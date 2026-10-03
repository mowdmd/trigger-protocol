import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { parseJson } from '../protocol/strict-json.mjs';
import { canonicalJson } from '../protocol/canonical-json.mjs';
import { validateReceipt, checkValidity, timestamp } from '../protocol/validation.mjs';
import { verifyReceipt, signingBytes } from '../protocol/receipt-signature.mjs';
import { checkTrust } from './trust.mjs';

const dir = mkdtempSync(join(tmpdir(), 'trigger-hardening-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const pubPath = join(dir, 'public.pem'); writeFileSync(pubPath, pem);
const server = join(dir, 'server.mjs');
writeFileSync(server, `import {createInterface} from 'node:readline';
createInterface({input:process.stdin}).on('line', line => console.log(JSON.stringify({forwarded:JSON.parse(line)})));`);
const base = JSON.parse(readFileSync(new URL('../examples/mcp-demo-receipt.json', import.meta.url)));
const request = { jsonrpc:'2.0', id:1, method:'tools/call', params:{ name:'hello', arguments:{name:'Trigger'} } };
const signed = value => ({ ...value, signature:{algorithm:'Ed25519', key_id:'operator', signature:sign(null, signingBytes(value), privateKey).toString('base64url')} });
const receipt = signed({...base, protocol:'trigger/0.3', nonce:'once'});
let sequence = 0;
function launch(value = receipt, options = [], input = JSON.stringify(request)) {
  const path = join(dir, `r-${sequence++}.json`); writeFileSync(path, JSON.stringify(value));
  const args = ['bin/trigger-mcp-proxy.mjs','--mode','gate','--receipt',path,
    '--public-key',pubPath,'--key-id','operator','--require-signature',...options,'--',process.execPath,server];
  return spawnSync(process.execPath, args, {input:input+'\n',encoding:'utf8',timeout:10000});
}
function blocked(result) {
  assert.doesNotMatch(result.stdout, /forwarded/, result.stdout);
  assert.ok(result.status !== 0 || /blocked/.test(result.stderr), result.stderr);
}
const hash = value => 'sha256:'+createHash('sha256').update(canonicalJson(value)).digest('hex');
function chain() {
  const proposal = {id:base.proposal_id,protocol:'trigger/0.2',agent:'agent:test',action:base.action,scope:base.scope,extensions:structuredClone(base.extensions)};
  const bound = signed({...receipt,proposal_hash:hash(proposal)});
  const decision = {id:bound.decision_id,protocol:'trigger/0.2',proposal_id:proposal.id,proposal_hash:bound.proposal_hash,actor:bound.actor,authority_id:bound.authority_id,decision:'approve',issued_at:bound.issued_at};
  const authority = {id:bound.authority_id,protocol:'trigger/0.2',holder:bound.actor,scope:bound.scope,action_patterns:[bound.action]};
  const state = {updated_at:base.issued_at,expires_at:base.expires_at,proposals:[proposal],decisions:[decision],authorities:[authority],delegations:[],key_bindings:[{key_id:'operator',actor:bound.actor,authority_ids:[bound.authority_id]}],revoked_receipt_ids:[],revoked_key_ids:[]};
  const path = join(dir, `state-${sequence++}.json`);
  return {bound,state,path, save(){writeFileSync(path,JSON.stringify(state));}};
}

test('strict JSON rejects duplicate and escaped duplicate keys, surrogates, overflow', () => {
  for (const raw of ['{"x":1,"x":2}','{"x":1,"\\u0078":2}','{"a":{"x":1,"x":2}}','"\\ud800"','{"\\udfff":1}','1e400','9007199254740992','[1,]']) assert.throws(()=>parseJson(raw));
  assert.equal(parseJson('{"__proto__":1}').__proto__,1);
  assert.equal(canonicalJson(parseJson('{"😀":1,"\uE000":2}')), '{"😀":1,"\uE000":2}');
  assert.equal(canonicalJson({a:-0,b:1.0,c:1e-7}),'{"a":0,"b":1,"c":1e-7}');
});
test('date-time and validity boundaries', () => {
  assert.equal(timestamp('2026-01-01T00:00:00Z'),1767225600000);
  assert.equal(timestamp('2026-01-01T09:00:00+09:00'),1767225600000);
  for (const date of ['2026-02-30T00:00:00Z','2026-01-01','2026-01-01T24:00:00Z','2026-13-01T00:00:00Z']) assert.throws(()=>timestamp(date));
  assert.throws(()=>checkValidity(base,Date.parse(base.expires_at)),/expired/);
  assert.throws(()=>checkValidity(base,0),/future/);
});
test('real receipt schemas reject additional properties, mixed scope and version leakage', () => {
  for (const r of [{...base,scope:['hello']},{...base,signature:receipt.signature},{...base,extra:1},{...base,proposal_hash:'bad'},{...receipt,scope:[1]},{...receipt,scope:[]},{...receipt,extensions:[]},{...receipt,signature:null}]) assert.throws(()=>validateReceipt(r));
  validateReceipt({...receipt,scope:['hello']});
  assert.equal(validateReceipt({...receipt,signature:undefined}).protocol,'trigger/0.3'); // optional cryptography remains optional structurally
});
test('key ID, key type, encoding and signature integrity', () => {
  verifyReceipt(receipt,pem,'operator');
  assert.throws(()=>verifyReceipt(receipt,pem,'unknown'));
  const other = generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>verifyReceipt(receipt,other,'operator'));
  const ed448 = generateKeyPairSync('ed448').publicKey.export({type:'spki',format:'pem'});
  assert.throws(()=>verifyReceipt(receipt,ed448,'operator'),/Ed25519/);
  for (const signature of ['', 'a'.repeat(85), receipt.signature.signature+'=', '+'+receipt.signature.signature.slice(1), '/'+receipt.signature.signature.slice(1), '!'.repeat(86)]) {
    assert.throws(()=>verifyReceipt({...receipt,signature:{...receipt.signature,signature}},pem,'operator'));
  }
  for (const field of ['scope','actor','authority_id','decision_id','nonce']) assert.throws(()=>verifyReceipt({...receipt,[field]:'tampered'},pem,'operator'));
});
test('signed gate forwards exactly bound invocation', () => {
  const r = launch(); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/forwarded/);
  blocked(launch(receipt,[],JSON.stringify({...request,params:{...request.params,arguments:{name:'Other'}}})));
});
test('unsigned receipts cannot pass cryptographic mode; bad algorithm/metadata rejected', () => {
  const {signature,...unsigned} = receipt; blocked(launch(unsigned));
  for (const sig of [null,{}, {...signature,algorithm:'RSA'},{...signature,key_id:'unknown'},{...signature,extra:1}]) blocked(launch({...receipt,signature:sig}));
});
test('gate rejects malformed JSON, batch/scalar/envelope inputs before upstream', () => {
  for (const raw of ['{oops','null','42','[]',JSON.stringify([request]),'{"jsonrpc":"2.0","method":"initialize","method":"tools/call"}',JSON.stringify({...request,jsonrpc:'1.0'}),JSON.stringify({...request,id:{x:1}})]) blocked(launch(receipt,[],raw));
});
test('gate rejects missing/empty tool and non-object arguments', () => {
  for (const params of [{},{name:''},{name:'hello',arguments:null},{name:'hello',arguments:[]},{name:'hello',arguments:'x'}]) blocked(launch(receipt,[],JSON.stringify({...request,params})));
});
test('legitimate JSON-RPC responses and initialize pass through', () => {
  for (const message of [{jsonrpc:'2.0',id:4,result:{}},{jsonrpc:'2.0',id:4,error:{code:-1,message:'no'}},{jsonrpc:'2.0',id:4,method:'initialize',params:{}}]) assert.match(launch(receipt,[],JSON.stringify(message)).stdout,/forwarded/);
});
test('canonicalization errors block a call without crashing the session', () => {
  const r = launch(receipt,[],JSON.stringify({...request,params:{name:'hello',arguments:{n:1e100}}})+'\n'+JSON.stringify(request));
  assert.equal(r.status,0,r.stderr); assert.equal((r.stdout.match(/forwarded/g)||[]).length,1);
});
test('replay claims survive process restart and reject reused nonce or receipt ID', () => {
  const replay = join(dir,`replay-${sequence++}`); mkdirSync(replay);
  assert.match(launch(receipt,['--replay-dir',replay]).stdout,/forwarded/);
  blocked(launch(receipt,['--replay-dir',replay]));
  blocked(launch(signed({...receipt,id:'new-id'}),['--replay-dir',replay]));
  blocked(launch(signed({...receipt,nonce:'new-nonce'}),['--replay-dir',replay]));
  const {nonce,...noNonce}=receipt; blocked(launch(signed(noNonce),['--replay-dir',replay]));
  blocked(launch(receipt,['--replay-dir',join(dir,'missing-store')]));
});
test('concurrent processes sharing replay store forward at most once', async () => {
  const replay = join(dir,`race-${sequence++}`); mkdirSync(replay);
  const path = join(dir,`race-receipt.json`);writeFileSync(path,JSON.stringify(receipt));
  async function run() {
    const child=spawn(process.execPath,['bin/trigger-mcp-proxy.mjs','--mode','gate','--receipt',path,'--public-key',pubPath,'--key-id','operator','--require-signature','--replay-dir',replay,'--',process.execPath,server]);
    let out='';child.stdout.on('data',c=>out+=c);child.stderr.resume();
    child.stdin.end(JSON.stringify(request)+'\n');
    await new Promise((res,rej)=>{child.once('close',res);child.once('error',rej);});return out;
  }
  const outputs=await Promise.all([run(),run(),run()]);
  assert.equal(outputs.filter(x=>x.includes('forwarded')).length,1);
});
test('cross-object approval chain succeeds; altered references and fields fail', () => {
  const c=chain();c.save();checkTrust(c.bound,c.path,'operator');
  assert.match(launch(c.bound,['--trust-state',c.path]).stdout,/forwarded/);
  for (const field of ['proposal_id','proposal_hash','decision_id','actor','authority_id','action','scope','resource','policy_version']) assert.throws(()=>checkTrust({...c.bound,[field]:'other'},c.path,'operator'));
  const original=structuredClone(c.state);
  for (const decision of ['reject','modify','defer','request_second_opinion']) {
    c.state.decisions[0].decision=decision;c.save();assert.throws(()=>checkTrust(c.bound,c.path,'operator'),/does not approve/);
  }
  c.state.decisions=original.decisions;
  c.state.proposals[0].extensions.other={changed:true};c.save();assert.throws(()=>checkTrust(c.bound,c.path,'operator'),/hash/);
});
test('revocation, stale snapshot and unknown constraints fail closed', () => {
  for (const mutate of [s=>s.authorities[0].revoked=true,s=>s.authorities[0].revoked_at=base.issued_at,s=>s.revoked_key_ids.push('operator'),s=>s.revoked_receipt_ids.push(receipt.id),s=>s.expires_at=base.issued_at,s=>s.key_bindings[0].actor='other',s=>s.authorities[0].limits={max_cost:1},s=>s.authorities.push(s.authorities[0])]) {
    const c=chain();mutate(c.state);c.save();assert.throws(()=>checkTrust(c.bound,c.path,'operator'));
  }
  const c=chain();c.save();assert.throws(()=>checkTrust({...c.bound,constraints:{max_cost:1}},c.path,'operator'));
  writeFileSync(c.path,'{bad');assert.throws(()=>checkTrust(c.bound,c.path,'operator'));
});
test('bounded single-hop delegation succeeds; escalation/expiry/revocation rejected', () => {
  const c=chain();c.state.authorities[0].holder='human:grantor';
  const delegation={id:'delegation-1',protocol:'trigger/0.2',grantor:'human:grantor',grantee:c.bound.actor,authority_id:c.bound.authority_id,scope:c.bound.scope,issued_at:base.issued_at,expires_at:base.expires_at,revocable:true};
  c.state.delegations=[delegation]; c.save();
  const r={...c.bound,delegation_id:delegation.id};checkTrust(r,c.path,'operator');
  for (const patch of [{grantor:'other'},{grantee:'other'},{scope:'*'},{revoked:true},{expires_at:base.issued_at},{limits:{max_cost:1}},{authority_id:'other'}]) {
    c.state.delegations=[{...delegation,...patch}];c.save();assert.throws(()=>checkTrust(r,c.path,'operator'));
  }
});
test('later approval preserves earlier rejection records', () => {
  const c=chain();c.state.decisions.unshift({...c.state.decisions[0],id:'earlier-reject',decision:'reject'});c.save();
  const bytes=readFileSync(c.path,'utf8');checkTrust(c.bound,c.path,'operator');
  assert.equal(readFileSync(c.path,'utf8'),bytes);
  assert.throws(()=>checkTrust({...c.bound,decision_id:'earlier-reject'},c.path,'operator'));
});

// Exercise a long-lived process: an initialize response is a startup barrier.
async function liveSession(value, options, afterReady) {
  const path=join(dir,`live-${sequence++}.json`);writeFileSync(path,JSON.stringify(value));
  const child=spawn(process.execPath,['bin/trigger-mcp-proxy.mjs','--mode','gate','--receipt',path,'--public-key',pubPath,'--key-id','operator','--require-signature',...options,'--',process.execPath,server]);
  let out='',err='';child.stderr.on('data',c=>err+=c);
  let readyResolve;const ready=new Promise(r=>readyResolve=r);
  child.stdout.on('data',c=>{out+=c;readyResolve();});
  const done=new Promise((res,rej)=>{child.once('close',res);child.once('error',rej);});
  const timeout=setTimeout(()=>child.kill(),10000);
  try {
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:99,method:'initialize'})+'\n');
    await Promise.race([ready,done.then(()=>{throw new Error(err);})]);
    await afterReady(path);
    child.stdin.end(JSON.stringify(request)+'\n');await done;
    assert.doesNotMatch(out,/"method":"tools\/call"/);assert.match(err,/blocked/);
  } finally {clearTimeout(timeout);child.kill();}
}
test('expiry is rechecked after startup', async () => {
  const expiry=Date.now()+2000;
  await liveSession(signed({...receipt,expires_at:new Date(expiry).toISOString()}),[],async()=>{
    await new Promise(r=>setTimeout(r,Math.max(0,expiry-Date.now()+30)));
  });
});
test('trust snapshot revocation is observed by an already-running gate', async () => {
  const c=chain();c.save();await liveSession(c.bound,['--trust-state',c.path],async()=>{c.state.revoked_receipt_ids.push(c.bound.id);c.save();});
});
test('receipt mutation is rejected during a session', async () => {
  await liveSession(receipt,[],async path=>writeFileSync(path,JSON.stringify(signed({...receipt,nonce:'changed'}))));
});
test('Python-generated fixed signature verifies with exact canonical bytes in Node', () => {
  const vector=JSON.parse(readFileSync(new URL('../conformance/signed-receipt-vector.json',import.meta.url)));
  assert.equal(signingBytes(vector.receipt).toString('hex'),vector.canonical_utf8_hex);
  verifyReceipt(vector.receipt,vector.public_key_pem,'interop-test-only');
  const mutated=structuredClone(vector.receipt);
  mutated.extensions['https://example.org/conformance'].order.reverse();
  assert.throws(()=>verifyReceipt(mutated,vector.public_key_pem,'interop-test-only'));
});

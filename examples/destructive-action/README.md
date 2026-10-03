# Destructive action example

This example shows the boundary around an intentionally irreversible operation.

The demo does not delete a real file or contact an external service. The upstream MCP-like server exposes a fake delete_file operation that only records whether the call reached it.

The point is the boundary:

    AI proposal
       ↓
    human / governance decision
       ↓
    signed Trigger Receipt
       ↓
    trigger-mcp-proxy
       ↓
    delete_file
       ↓
    execution record

## Run

From the repository root:

    npx trigger-mcp-proxy --mode gate --receipt ./examples/destructive-action/receipt.json -- node ./examples/destructive-action/server.mjs

The receipt binds both the tool name and exact arguments. A different path is blocked before the upstream server sees it.

For the trust-layer demonstration, create an Ed25519 key pair and sign the receipt with:

    node ./bin/trigger-receipt.mjs keygen --private-key ./private.pem --public-key ./public.pem
    node ./bin/trigger-receipt.mjs sign --receipt ./examples/destructive-action/receipt.json --private-key ./private.pem --key-id demo-operator
    node ./bin/trigger-receipt.mjs verify --receipt ./examples/destructive-action/receipt.json --public-key ./public.pem --key-id demo-operator

To enforce the signature at the proxy boundary, supply the trusted public key:

    npx trigger-mcp-proxy --mode gate --receipt ./examples/destructive-action/receipt.json --public-key ./public.pem --key-id demo-operator --require-signature -- node ./examples/destructive-action/server.mjs

The signature authenticates the receipt contents; the deployment still decides whether demo-operator is trusted for the stated authority.

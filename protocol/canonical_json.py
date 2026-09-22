"""RFC 8785 JSON Canonicalization Scheme (JCS) for Python JSON values."""

import json
import math
import re

_SAFE_INTEGER = 2**53 - 1
_NUMBER_RE = re.compile(r"^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$")


def canonical_json(value):
    return _serialize(value)


def _serialize(value):
    if value is None:
        return "null"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        if abs(value) > _SAFE_INTEGER:
            raise ValueError("JCS/I-JSON requires integers within the safe integer range")
        return str(value)
    if isinstance(value, float):
        return _serialize_number(value)
    if isinstance(value, list):
        return "[" + ",".join(_serialize(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda k: k.encode("utf-16-be", "surrogatepass"))
        if any(not isinstance(k, str) for k in keys):
            raise TypeError("JSON object keys must be strings")
        return "{" + ",".join(
            _serialize(k) + ":" + _serialize(value[k]) for k in keys
        ) + "}"
    raise TypeError(f"unsupported JSON value: {type(value).__name__}")


def _serialize_number(value):
    if not math.isfinite(value):
        raise ValueError("JCS does not permit non-finite numbers")
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) <= _SAFE_INTEGER:
        return str(int(value))

    raw = repr(value).lower()
    match = _NUMBER_RE.match(raw)
    if not match:
        raise ValueError(f"cannot serialize number: {value!r}")

    sign, integer, fraction, exponent = match.groups()
    digits = integer + (fraction or "")
    exponent = int(exponent or 0)
    decimal_pos = len(integer) + exponent
    negative = sign == "-"

    # ECMAScript uses decimal notation for [1e-6, 1e21), otherwise
    # scientific notation. Python's repr is already a shortest-roundtrip
    # representation; only the notation threshold and exponent formatting
    # need conversion.
    magnitude = abs(value)
    if 1e-6 <= magnitude < 1e21:
        if decimal_pos <= 0:
            out = "0." + "0" * (-decimal_pos) + digits
        elif decimal_pos >= len(digits):
            out = digits + "0" * (decimal_pos - len(digits))
        else:
            out = digits[:decimal_pos] + "." + digits[decimal_pos:]
    else:
        out = digits[0]
        if len(digits) > 1:
            out += "." + digits[1:]
        exponent_out = decimal_pos - 1
        out += "e" + ("+" if exponent_out >= 0 else "") + str(exponent_out)

    return ("-" if negative else "") + out

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redact = redact;
const KEYS = /pass(word|phrase)?|private.?key|secret|token|credential/i;
function redact(value, secrets = []) {
    const cleanString = (s) => secrets.filter(Boolean).reduce((v, x) => v.split(x).join("[REDACTED]"), s).replace(/(pass(word|phrase)?|private.?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
    if (typeof value === "string")
        return cleanString(value);
    if (value instanceof Error)
        return cleanString(value.message);
    if (Array.isArray(value))
        return value.map(v => redact(v, secrets));
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, KEYS.test(k) ? "[REDACTED]" : redact(v, secrets)]));
    return value;
}
//# sourceMappingURL=redact.js.map
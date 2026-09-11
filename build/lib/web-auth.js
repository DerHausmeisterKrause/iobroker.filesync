"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = void 0;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.safeUser = safeUser;
const node_crypto_1 = require("node:crypto");
const scrypt = (password, salt, keyLength, options) => new Promise((resolve, reject) => (0, node_crypto_1.scrypt)(password, salt, keyLength, options, (error, key) => error ? reject(error) : resolve(key)));
const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 32 };
async function hashPassword(password) {
    if (password.length < 8 || password.length > 1024)
        throw new Error("Password must contain between 8 and 1024 characters");
    const salt = (0, node_crypto_1.randomBytes)(32);
    const hash = await scrypt(password, salt, PARAMS.keyLength, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: 64 * 1024 * 1024 });
    return { algorithm: "scrypt", salt: salt.toString("base64"), hash: hash.toString("base64"), params: { ...PARAMS } };
}
async function verifyPassword(password, record) {
    if (!record || record.algorithm !== "scrypt")
        return false;
    try {
        const expected = Buffer.from(record.hash, "base64"), actual = await scrypt(password, Buffer.from(record.salt, "base64"), record.params.keyLength, { N: record.params.N, r: record.params.r, p: record.params.p, maxmem: 128 * 1024 * 1024 });
        return expected.length === actual.length && (0, node_crypto_1.timingSafeEqual)(expected, actual);
    }
    catch {
        return false;
    }
}
class SessionStore {
    ttlMinutes;
    sessions = new Map();
    cleanupTimer;
    constructor(ttlMinutes) {
        this.ttlMinutes = ttlMinutes;
        this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
        this.cleanupTimer.unref();
    }
    create(userId) { const session = { id: (0, node_crypto_1.randomBytes)(32).toString("base64url"), csrf: (0, node_crypto_1.randomBytes)(32).toString("base64url"), userId, expiresAt: Date.now() + this.ttlMinutes * 60_000 }; this.sessions.set(session.id, session); return session; }
    get(id) { if (!id)
        return; const value = this.sessions.get(id); if (!value || value.expiresAt <= Date.now()) {
        if (value)
            this.sessions.delete(id);
        return;
    } return value; }
    delete(id) { if (id)
        this.sessions.delete(id); }
    cleanup() { const now = Date.now(); for (const [id, s] of this.sessions)
        if (s.expiresAt <= now)
            this.sessions.delete(id); }
    close() { clearInterval(this.cleanupTimer); this.sessions.clear(); }
    get size() { this.cleanup(); return this.sessions.size; }
}
exports.SessionStore = SessionStore;
function safeUser(user, groups) { return { id: user.id, username: user.username, displayName: user.displayName, admin: user.admin, groups: groups.filter(g => g.enabled && (user.admin || user.groupIds.includes(g.id))).map(({ id, name }) => ({ id, name })) }; }
//# sourceMappingURL=web-auth.js.map
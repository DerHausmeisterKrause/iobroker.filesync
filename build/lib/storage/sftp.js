"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SftpStorageProvider = void 0;
const node_module_1 = require("node:module");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const path_1 = require("../security/path");
const errors_1 = require("./errors");
const SftpClient = (0, node_module_1.createRequire)(__filename)("ssh2-sftp-client");
class SftpStorageProvider {
    l;
    secret;
    c = new SftpClient();
    realRoot;
    constructor(l, secret) {
        this.l = l;
        this.secret = secret;
    }
    normalizePath(p) { return (0, path_1.normalizeRelative)(p); }
    p(p) { return node_path_1.default.posix.join(this.l.basePath, "/", (0, path_1.normalizeRelative)(p)); }
    writable() { if (this.l.readOnly)
        throw new Error("Location is read-only"); }
    inside(actual) { if (!this.realRoot)
        throw new Error("SFTP root is unavailable"); const relative = node_path_1.default.posix.relative(node_path_1.default.posix.resolve(this.realRoot), node_path_1.default.posix.resolve(actual)); if (relative === ".." || relative.startsWith("../") || node_path_1.default.posix.isAbsolute(relative))
        throw new Error("SFTP symlink escape denied"); }
    missing(p) { return Object.assign(new Error(`SFTP path not found: ${p}`), { code: 2 }); }
    async guard(p, allowMissing = false) { let probe = this.p(p); for (;;) {
        try {
            const actual = await this.c.realPath(probe);
            if (actual === "")
                throw this.missing(probe);
            this.inside(actual);
            return;
        }
        catch (error) {
            if (!(0, errors_1.isNotFoundError)(error))
                throw error;
            if (!allowMissing)
                throw this.missing(this.p(p));
            const parent = node_path_1.default.posix.dirname(probe);
            if (parent === probe)
                throw this.missing(this.p(p));
            probe = parent;
        }
    } }
    async connect() { if (!this.l.allowInsecureHostKey && !this.l.hostFingerprint)
        throw new Error("SFTP host fingerprint is required"); const expected = this.l.hostFingerprint.replace(/^SHA256:/, ""); await this.c.connect({ host: this.l.host, port: this.l.port, username: this.l.username, password: this.l.auth === "password" ? this.secret.password : undefined, privateKey: this.l.auth === "privateKey" ? this.secret.privateKey : undefined, passphrase: this.secret.passphrase, readyTimeout: this.l.timeoutMs, hostVerifier: this.l.allowInsecureHostKey ? () => true : (key) => { const actual = (0, node_crypto_1.createHash)("sha256").update(key).digest("base64").replace(/=+$/, ""); const a = Buffer.from(actual), e = Buffer.from(expected.replace(/=+$/, "")); return a.length === e.length && (0, node_crypto_1.timingSafeEqual)(a, e); } }); this.realRoot = await this.c.realPath(this.l.basePath); }
    async disconnect() { this.realRoot = undefined; await this.c.end(); }
    async testConnection() { const t = Date.now(); await this.list(""); return { latencyMs: Date.now() - t }; }
    async list(p) { await this.guard(p); return (await this.c.list(this.p(p))).map((x) => ({ path: node_path_1.default.posix.join(this.normalizePath(p), x.name), name: x.name, type: x.type === "d" ? "directory" : x.type === "l" ? "symlink" : "file", size: x.size, mtimeMs: x.modifyTime })); }
    async stat(p) { await this.guard(p); const s = await this.c.stat(this.p(p)); return { path: this.normalizePath(p), name: node_path_1.default.posix.basename(p), type: s.isDirectory ? "directory" : "file", size: s.size, mtimeMs: s.modifyTime }; }
    async statOrUndefined(p) { try {
        return await this.stat(p);
    }
    catch (error) {
        if ((0, errors_1.isNotFoundError)(error))
            return undefined;
        throw error;
    } }
    async exists(p) { return (await this.statOrUndefined(p)) !== undefined; }
    async mkdir(p) { this.writable(); await this.guard(p, true); await this.c.mkdir(this.p(p), true); await this.guard(p); }
    async createReadStream(p) { await this.guard(p); return this.c.createReadStream(this.p(p)); }
    async createWriteStream(p) { this.writable(); await this.guard(p, true); return this.c.createWriteStream(this.p(p)); }
    async rename(a, b) { this.writable(); await this.guard(a); await this.guard(b, true); await this.c.rename(this.p(a), this.p(b)); }
    async replace(temp, final) { this.writable(); const backup = node_path_1.default.posix.join(node_path_1.default.posix.dirname(final), `.${node_path_1.default.posix.basename(final)}.filesync-backup-${(0, node_crypto_1.randomUUID)()}`), existed = await this.exists(final); if (existed)
        await this.rename(final, backup); try {
        await this.rename(temp, final);
        if (existed)
            await this.remove(backup);
    }
    catch (error) {
        if (existed && await this.exists(backup))
            await this.rename(backup, final);
        throw error;
    } }
    async remove(p) { this.writable(); await this.guard(p); const s = await this.stat(p); if (s.type === "directory")
        await this.c.rmdir(this.p(p), true);
    else
        await this.c.delete(this.p(p)); }
    async setMtime(p, m) { this.writable(); await this.guard(p); await this.c.utimes(this.p(p), m / 1000, m / 1000); }
}
exports.SftpStorageProvider = SftpStorageProvider;
//# sourceMappingURL=sftp.js.map
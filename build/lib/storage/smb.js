"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmbStorageProvider = void 0;
const node_module_1 = require("node:module");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const path_1 = require("../security/path");
const errors_1 = require("./errors");
const createClient = (options) => { const SMB2 = (0, node_module_1.createRequire)(__filename)("@marsaud/smb2"); return new SMB2(options); };
/**
 * @marsaud/smb2's runtime stat mapper includes `size` (lib/tools/file-info.js),
 * although 0.18.0's declaration omits it. Keep that discrepancy local and
 * validate the value before exposing it as provider metadata.
 */
function runtimeStat(value) {
    if (!value || typeof value !== "object" || !("size" in value) || typeof value.size !== "number"
        || !("mtime" in value) || !(value.mtime instanceof Date) || !("isDirectory" in value)
        || typeof value.isDirectory !== "function")
        throw new Error("SMB returned malformed file metadata");
    return value;
}
class SmbStorageProvider {
    l;
    secret;
    factory;
    client;
    constructor(l, secret, factory = createClient) {
        this.l = l;
        this.secret = secret;
        this.factory = factory;
    }
    normalizePath(p) { return (0, path_1.normalizeRelative)(p); }
    p(p) { return node_path_1.default.posix.join((0, path_1.normalizeRelative)(this.l.basePath), (0, path_1.normalizeRelative)(p)).replace(/\//g, "\\"); }
    async connect() {
        if (!this.secret.password)
            throw new Error("SMB password unavailable");
        this.client = this.factory({ share: `\\\\${this.l.host}\\${this.l.share}`, domain: this.l.domain ?? "", username: this.l.username, password: this.secret.password, port: this.l.port, autoCloseTimeout: this.l.timeoutMs });
    }
    async disconnect() { this.client?.disconnect(); this.client = undefined; }
    c() { if (!this.client)
        throw new Error("SMB not connected"); return this.client; }
    async testConnection() { const t = Date.now(); await this.list(""); return { latencyMs: Date.now() - t }; }
    async list(p) {
        // Without `stats: true`, 0.18 returns names, not Dirent-like objects.
        const names = await this.c().readdir(this.p(p));
        return Promise.all(names.map(name => this.stat(node_path_1.default.posix.join(this.normalizePath(p), name))));
    }
    async stat(p) {
        const s = runtimeStat(await this.c().stat(this.p(p)));
        return { path: this.normalizePath(p), name: node_path_1.default.posix.basename(p), type: s.isDirectory() ? "directory" : "file", size: s.size, mtimeMs: s.mtime.getTime() };
    }
    async statOrUndefined(p) { try {
        return await this.stat(p);
    }
    catch (error) {
        if ((0, errors_1.isNotFoundError)(error))
            return undefined;
        throw error;
    } }
    async exists(p) { return (await this.statOrUndefined(p)) !== undefined; }
    async mkdir(p) {
        if (this.l.readOnly)
            throw new Error("Location is read-only");
        const parts = this.normalizePath(p).split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
            current = node_path_1.default.posix.join(current, part);
            if (!await this.exists(current))
                await this.c().mkdir(this.p(current));
        }
    }
    async createReadStream(p) { return await this.c().createReadStream(this.p(p)); }
    async createWriteStream(p) { if (this.l.readOnly)
        throw new Error("Location is read-only"); return await this.c().createWriteStream(this.p(p)); }
    async rename(a, b) { if (this.l.readOnly)
        throw new Error("Location is read-only"); await this.c().rename(this.p(a), this.p(b)); }
    async replace(temp, final) { if (this.l.readOnly)
        throw new Error("Location is read-only"); const backup = node_path_1.default.posix.join(node_path_1.default.posix.dirname(final), `.${node_path_1.default.posix.basename(final)}.filesync-backup-${(0, node_crypto_1.randomUUID)()}`); const existed = await this.exists(final); if (existed)
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
    async remove(p) { if (this.l.readOnly)
        throw new Error("Location is read-only"); const s = await this.stat(p); if (s.type === "directory")
        await this.c().rmdir(this.p(p));
    else
        await this.c().unlink(this.p(p)); }
}
exports.SmbStorageProvider = SmbStorageProvider;
//# sourceMappingURL=smb.js.map
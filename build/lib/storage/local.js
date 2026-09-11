"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageProvider = void 0;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const path_1 = require("../security/path");
const errors_1 = require("./errors");
class LocalStorageProvider {
    location;
    randomName;
    constructor(location, randomName = node_crypto_1.randomUUID) {
        this.location = location;
        this.randomName = randomName;
    }
    normalizePath(p) { return (0, path_1.normalizeRelative)(p); }
    resolve(p) { return (0, path_1.safeLocalPath)(this.location.basePath, p); }
    async root() { return (0, promises_1.realpath)(this.location.basePath); }
    inside(root, actual) { const relative = node_path_1.default.relative(root, actual); return relative === "" || (relative !== ".." && !relative.startsWith(`..${node_path_1.default.sep}`) && !node_path_1.default.isAbsolute(relative)); }
    async guarded(p, allowMissing = false) { const target = this.resolve(p), root = await this.root(); let probe = allowMissing ? node_path_1.default.dirname(target) : target; for (;;) {
        try {
            const actual = await (0, promises_1.realpath)(probe);
            if (!this.inside(root, actual))
                throw new Error("Symlink escape denied");
            return target;
        }
        catch (error) {
            if (!allowMissing || !(0, errors_1.isNotFoundError)(error))
                throw error;
            const parent = node_path_1.default.dirname(probe);
            if (parent === probe)
                throw error;
            probe = parent;
        }
    } }
    async secureMkdir(p) { const relative = this.normalizePath(p), root = await this.root(); let current = root; for (const segment of relative.split("/").filter(Boolean)) {
        current = node_path_1.default.join(current, segment);
        try {
            const info = await (0, promises_1.lstat)(current);
            if (info.isSymbolicLink()) {
                const actual = await (0, promises_1.realpath)(current);
                if (!this.inside(root, actual))
                    throw new Error("Symlink escape denied");
            }
            else if (!info.isDirectory())
                throw new Error(`Not a directory: ${segment}`);
        }
        catch (error) {
            if (!(0, errors_1.isNotFoundError)(error))
                throw error;
            await (0, promises_1.mkdir)(current);
            const actual = await (0, promises_1.realpath)(current);
            if (!this.inside(root, actual))
                throw new Error("Symlink escape denied");
        }
    } }
    async connect() { await (0, promises_1.access)(this.location.basePath); }
    async disconnect() { }
    async testConnection(writeTest = false) { const started = Date.now(); await (0, promises_1.access)(this.location.basePath); if (writeTest && !this.location.readOnly) {
        const p = await this.guarded(`.filesync-test-${this.randomName()}`, true);
        let created = false;
        try {
            await (0, promises_1.writeFile)(p, "", { flag: "wx" });
            created = true;
        }
        finally {
            if (created)
                await (0, promises_1.rm)(p, { force: true });
        }
    } return { latencyMs: Date.now() - started, freeBytes: await this.getFreeSpace() }; }
    async list(p) { const dir = await this.guarded(p); const rows = await (0, promises_1.readdir)(dir, { withFileTypes: true }); const result = []; for (const row of rows) {
        const rel = node_path_1.default.posix.join(this.normalizePath(p), row.name);
        const s = await (0, promises_1.lstat)(this.resolve(rel));
        result.push({ path: rel, name: row.name, type: s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : "file", size: s.size, mtimeMs: s.mtimeMs });
    } return result; }
    async stat(p) { const s = await (0, promises_1.lstat)(await this.guarded(p)); return { path: this.normalizePath(p), name: node_path_1.default.basename(p), type: s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : "file", size: s.size, mtimeMs: s.mtimeMs }; }
    async statOrUndefined(p) { try {
        return await this.stat(p);
    }
    catch (error) {
        if ((0, errors_1.isNotFoundError)(error))
            return undefined;
        throw error;
    } }
    async exists(p) { return (await this.statOrUndefined(p)) !== undefined; }
    async mkdir(p) { if (this.location.readOnly)
        throw new Error("Location is read-only"); await this.secureMkdir(p); }
    async createReadStream(p) { return (0, node_fs_1.createReadStream)(await this.guarded(p)); }
    async createWriteStream(p) { if (this.location.readOnly)
        throw new Error("Location is read-only"); return (0, node_fs_1.createWriteStream)(await this.guarded(p, true), { flags: "wx" }); }
    async rename(a, b) { if (this.location.readOnly)
        throw new Error("Location is read-only"); await (0, promises_1.rename)(await this.guarded(a), await this.guarded(b, true)); }
    async replace(temp, final) { if (this.location.readOnly)
        throw new Error("Location is read-only"); await (0, promises_1.rename)(await this.guarded(temp), await this.guarded(final, true)); }
    async remove(p) { if (this.location.readOnly)
        throw new Error("Location is read-only"); await (0, promises_1.rm)(await this.guarded(p), { recursive: true }); }
    async setMtime(p, m) { if (this.location.readOnly)
        throw new Error("Location is read-only"); const d = new Date(m); await (0, promises_1.utimes)(await this.guarded(p), d, d); }
    async getFreeSpace() { const s = await (0, promises_1.statfs)(await (0, promises_1.realpath)(this.location.basePath)); return s.bavail * s.bsize; }
}
exports.LocalStorageProvider = LocalStorageProvider;
//# sourceMappingURL=local.js.map
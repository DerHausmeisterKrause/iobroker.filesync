"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistentStore = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
class PersistentStore {
    root;
    constructor(root) {
        this.root = root;
    }
    file(id) { if (!/^[0-9a-f-]{36}$/i.test(id))
        throw new Error("Invalid job id"); return node_path_1.default.join(this.root, `${id}.json`); }
    async parse(file) {
        const parsed = JSON.parse(await (0, promises_1.readFile)(file, "utf8"));
        if (parsed.version !== 1 || !parsed.files || typeof parsed.files !== "object")
            throw new Error("Unsupported snapshot schema");
        return parsed;
    }
    async load(id) {
        await (0, promises_1.mkdir)(this.root, { recursive: true });
        const file = this.file(id);
        try {
            return await this.parse(file);
        }
        catch (e) {
            if (e.code === "ENOENT")
                return { version: 1, files: {}, pending: {} };
            const damaged = `${file}.corrupt-${Date.now()}`;
            await (0, promises_1.rename)(file, damaged).catch(() => undefined);
            try {
                const backup = await this.parse(`${file}.bak`);
                await (0, promises_1.writeFile)(file, JSON.stringify(backup), { mode: 0o600 });
                return backup;
            }
            catch {
                return { version: 1, files: {}, pending: {} };
            }
        }
    }
    async save(id, data) { await (0, promises_1.mkdir)(this.root, { recursive: true }); const f = this.file(id), tmp = `${f}.${process.pid}.tmp`; await (0, promises_1.writeFile)(tmp, JSON.stringify(data), { mode: 0o600 }); await (0, promises_1.copyFile)(f, `${f}.bak`).catch(() => undefined); await (0, promises_1.rename)(tmp, f); }
}
exports.PersistentStore = PersistentStore;
//# sourceMappingURL=store.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialStore = exports.RuntimeConfigStore = void 0;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
async function exists(file) {
    return (0, promises_1.access)(file, node_fs_1.constants.F_OK).then(() => true, () => false);
}
async function atomicWrite(file, value) {
    await (0, promises_1.mkdir)(node_path_1.default.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    const handle = await (0, promises_1.open)(temporary, "w", 0o600);
    try {
        await handle.truncate(0);
        await handle.writeFile(value, "utf8");
        await handle.sync();
    }
    finally {
        await handle.close();
    }
    await (0, promises_1.rename)(temporary, file);
}
class RuntimeConfigStore {
    file;
    queue = Promise.resolve();
    constructor(instanceDataDir) { this.file = node_path_1.default.join(instanceDataDir, "runtime-config.json"); }
    isInitialized() { return exists(this.file); }
    async load() {
        const data = JSON.parse(await (0, promises_1.readFile)(this.file, "utf8"));
        if (data.version !== 1 || !Array.isArray(data.locations) || !Array.isArray(data.jobs))
            throw new Error("Invalid runtime configuration");
        return { version: 1, locations: data.locations, jobs: data.jobs };
    }
    save(data) {
        const operation = this.queue.then(() => atomicWrite(this.file, `${JSON.stringify(data, null, 2)}\n`));
        this.queue = operation.catch(() => undefined);
        return operation;
    }
}
exports.RuntimeConfigStore = RuntimeConfigStore;
/** Credentials encrypted with ioBroker's adapter system-secret implementation. */
class CredentialStore {
    encrypt;
    decrypt;
    file;
    queue = Promise.resolve();
    constructor(instanceDataDir, encrypt, decrypt) {
        this.encrypt = encrypt;
        this.decrypt = decrypt;
        this.file = node_path_1.default.join(instanceDataDir, "credentials.enc");
    }
    isInitialized() { return exists(this.file); }
    async load() {
        const encrypted = (await (0, promises_1.readFile)(this.file, "utf8")).trim();
        const parsed = JSON.parse(this.decrypt(encrypted));
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
            throw new Error("Invalid credential store");
        return parsed;
    }
    save(secrets) {
        const operation = this.queue.then(() => atomicWrite(this.file, `${this.encrypt(JSON.stringify(secrets))}\n`));
        this.queue = operation.catch(() => undefined);
        return operation;
    }
}
exports.CredentialStore = CredentialStore;
//# sourceMappingURL=runtime-config-store.js.map
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import type { DataLocation, Job, SecretRecord } from "./types";

export interface RuntimeConfigData { version: number; locations: DataLocation[]; jobs: Job[]; }

async function exists(file: string): Promise<boolean> {
    return access(file, constants.F_OK).then(() => true, () => false);
}

async function atomicWrite(file: string, value: string): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    try {
        await handle.truncate(0);
        await handle.writeFile(value, "utf8");
        await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, file);
}

export class RuntimeConfigStore {
    readonly file: string;
    private queue: Promise<void> = Promise.resolve();
    constructor(instanceDataDir: string) { this.file = path.join(instanceDataDir, "runtime-config.json"); }
    isInitialized(): Promise<boolean> { return exists(this.file); }
    async load(): Promise<RuntimeConfigData> {
        const data = JSON.parse(await readFile(this.file, "utf8")) as Partial<RuntimeConfigData>;
        if (data.version !== 1 || !Array.isArray(data.locations) || !Array.isArray(data.jobs)) throw new Error("Invalid runtime configuration");
        return { version: 1, locations: data.locations, jobs: data.jobs };
    }
    save(data: RuntimeConfigData): Promise<void> {
        const operation = this.queue.then(() => atomicWrite(this.file, `${JSON.stringify(data, null, 2)}\n`));
        this.queue = operation.catch(() => undefined);
        return operation;
    }
}

/** Credentials encrypted with ioBroker's adapter system-secret implementation. */
export class CredentialStore {
    readonly file: string;
    private queue: Promise<void> = Promise.resolve();
    constructor(instanceDataDir: string, private readonly encrypt: (value: string) => string, private readonly decrypt: (value: string) => string) { this.file = path.join(instanceDataDir, "credentials.enc"); }
    isInitialized(): Promise<boolean> { return exists(this.file); }
    async load(): Promise<Record<string, SecretRecord>> {
        const encrypted = (await readFile(this.file, "utf8")).trim();
        const parsed: unknown = JSON.parse(this.decrypt(encrypted));
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Invalid credential store");
        return parsed as Record<string, SecretRecord>;
    }
    save(secrets: Record<string, SecretRecord>): Promise<void> {
        const operation = this.queue.then(() => atomicWrite(this.file, `${this.encrypt(JSON.stringify(secrets))}\n`));
        this.queue = operation.catch(() => undefined);
        return operation;
    }
}

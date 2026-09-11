import type { DataLocation, Job, SecretRecord } from "./types";
export interface RuntimeConfigData {
    version: number;
    locations: DataLocation[];
    jobs: Job[];
}
export declare class RuntimeConfigStore {
    readonly file: string;
    private queue;
    constructor(instanceDataDir: string);
    isInitialized(): Promise<boolean>;
    load(): Promise<RuntimeConfigData>;
    save(data: RuntimeConfigData): Promise<void>;
}
/** Credentials encrypted with ioBroker's adapter system-secret implementation. */
export declare class CredentialStore {
    private readonly encrypt;
    private readonly decrypt;
    readonly file: string;
    private queue;
    constructor(instanceDataDir: string, encrypt: (value: string) => string, decrypt: (value: string) => string);
    isInitialized(): Promise<boolean>;
    load(): Promise<Record<string, SecretRecord>>;
    save(secrets: Record<string, SecretRecord>): Promise<void>;
}

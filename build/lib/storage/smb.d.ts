import type { Readable, Writable } from "node:stream";
import type { FileMetadata, SmbLocation, SecretRecord } from "../types";
import type { StorageProvider } from "./provider";
export interface SmbClient {
    disconnect(): void;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<unknown>;
    mkdir(path: string): Promise<void>;
    createReadStream(path: string): Promise<Readable>;
    createWriteStream(path: string): Promise<Writable>;
    rename(from: string, to: string): Promise<void>;
    rmdir(path: string): Promise<void>;
    unlink(path: string): Promise<void>;
}
type SmbConstructor = new (options: {
    share: string;
    domain: string;
    username: string;
    password: string;
    port: number;
    autoCloseTimeout: number;
}) => SmbClient;
export declare class SmbStorageProvider implements StorageProvider {
    private readonly l;
    private readonly secret;
    private readonly factory;
    private client?;
    constructor(l: SmbLocation, secret: SecretRecord, factory?: (options: ConstructorParameters<SmbConstructor>[0]) => SmbClient);
    normalizePath(p: string): string;
    private p;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private c;
    testConnection(): Promise<{
        latencyMs: number;
    }>;
    list(p: string): Promise<FileMetadata[]>;
    stat(p: string): Promise<FileMetadata>;
    statOrUndefined(p: string): Promise<FileMetadata | undefined>;
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    createReadStream(p: string): Promise<Readable>;
    createWriteStream(p: string): Promise<Writable>;
    rename(a: string, b: string): Promise<void>;
    replace(temp: string, final: string): Promise<void>;
    remove(p: string): Promise<void>;
}
export {};

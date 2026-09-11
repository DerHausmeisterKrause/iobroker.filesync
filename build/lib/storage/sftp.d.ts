import type { Readable, Writable } from "node:stream";
import type { FileMetadata, SecretRecord, SftpLocation } from "../types";
import type { StorageProvider } from "./provider";
export declare class SftpStorageProvider implements StorageProvider {
    private readonly l;
    private readonly secret;
    private c;
    private realRoot?;
    constructor(l: SftpLocation, secret: SecretRecord);
    normalizePath(p: string): string;
    private p;
    private writable;
    private inside;
    private missing;
    private guard;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
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
    setMtime(p: string, m: number): Promise<void>;
}

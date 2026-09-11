import type { FileMetadata } from "../types";
import type { Readable, Writable } from "node:stream";
export interface StorageProvider {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(writeTest?: boolean): Promise<{
        latencyMs: number;
        freeBytes?: number;
    }>;
    list(path: string): Promise<FileMetadata[]>;
    stat(path: string): Promise<FileMetadata>;
    statOrUndefined(path: string): Promise<FileMetadata | undefined>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string): Promise<void>;
    createReadStream(path: string): Promise<Readable>;
    createWriteStream(path: string): Promise<Writable>;
    rename(from: string, to: string): Promise<void>;
    remove(path: string): Promise<void>;
    replace(tempPath: string, finalPath: string): Promise<void>;
    setMtime?(path: string, mtimeMs: number): Promise<void>;
    getFreeSpace?(): Promise<number | undefined>;
    normalizePath(path: string): string;
}

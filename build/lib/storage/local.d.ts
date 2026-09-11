import type { FileMetadata, LocalLocation } from "../types";
import type { StorageProvider } from "./provider";
export declare class LocalStorageProvider implements StorageProvider {
    private readonly location;
    private readonly randomName;
    constructor(location: LocalLocation, randomName?: () => string);
    normalizePath(p: string): string;
    private resolve;
    private root;
    private inside;
    private guarded;
    private secureMkdir;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(writeTest?: boolean): Promise<{
        latencyMs: number;
        freeBytes: number;
    }>;
    list(p: string): Promise<FileMetadata[]>;
    stat(p: string): Promise<FileMetadata>;
    statOrUndefined(p: string): Promise<FileMetadata | undefined>;
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    createReadStream(p: string): Promise<import("fs").ReadStream>;
    createWriteStream(p: string): Promise<import("fs").WriteStream>;
    rename(a: string, b: string): Promise<void>;
    replace(temp: string, final: string): Promise<void>;
    remove(p: string): Promise<void>;
    setMtime(p: string, m: number): Promise<void>;
    getFreeSpace(): Promise<number>;
}

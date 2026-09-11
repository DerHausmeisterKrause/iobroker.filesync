import type { FileMetadata } from "../types";
export interface SnapshotEntry extends FileMetadata {
    syncedAt: number;
    hash?: string;
    targetPath?: string;
}
export interface Snapshot {
    version: 1;
    files: Record<string, SnapshotEntry>;
    pending?: Record<string, {
        size: number;
        mtimeMs: number;
        observedAt: number;
    }>;
}
export declare class PersistentStore {
    private readonly root;
    constructor(root: string);
    private file;
    private parse;
    load(id: string): Promise<Snapshot>;
    save(id: string, data: Snapshot): Promise<void>;
}

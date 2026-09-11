import type { Job, TransferResult } from "../types";
import type { StorageProvider } from "../storage/provider";
import type { PersistentStore } from "../persistence/store";
import { TargetPathLock } from "../jobs/path-lock";
export declare class SyncEngine {
    private readonly store;
    private readonly now;
    private readonly checkpointSize;
    private readonly transfer;
    private readonly checkpointFailed;
    private readonly targetLock;
    constructor(store: PersistentStore, now?: () => number, checkpointSize?: number, transfer?: <T>(operation: () => Promise<T>) => Promise<T>, checkpointFailed?: (error: unknown) => void, targetLock?: TargetPathLock);
    run(job: Job, source: StorageProvider, target: StorageProvider, dryRunOverride?: boolean): Promise<TransferResult>;
}

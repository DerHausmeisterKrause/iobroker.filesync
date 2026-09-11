export interface PendingRun {
    realRequested: boolean;
    previewRequested: boolean;
}
export declare class JobLock {
    private running;
    private pending;
    tryAcquire(id: string, dryRun: boolean): boolean;
    release(id: string): PendingRun | undefined;
    count(): number;
    queued(): number;
    clear(): void;
}

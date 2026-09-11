export declare class TransferLimiter {
    private readonly concurrency;
    private readonly changed;
    private active;
    private closed;
    private readonly waiting;
    private readonly idleWaiters;
    constructor(concurrency: number, changed?: () => void);
    get pendingCount(): number;
    get activeCount(): number;
    run<T>(operation: () => Promise<T>): Promise<T>;
    close(): void;
    waitForIdle(timeoutMs: number): Promise<void>;
}

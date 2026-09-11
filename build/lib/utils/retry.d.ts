export declare function retry<T>(operation: () => Promise<T>, options: {
    attempts: number;
    baseDelayMs: number;
    exponential: boolean;
    maxDelayMs: number;
}, sleep?: (ms: number) => Promise<void>): Promise<T>;

/** A fair keyed mutex. Entries disappear as soon as the final waiter exits. */
export declare class TargetPathLock {
    private readonly tails;
    run<T>(key: string, operation: () => Promise<T>): Promise<T>;
    get size(): number;
}

export declare class NotificationGate {
    private failures;
    failure(job: string, cooldownMs: number, now?: number): boolean;
    recovery(job: string): boolean;
    isFailed(job: string): boolean;
}

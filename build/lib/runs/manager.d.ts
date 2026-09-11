export type RunSource = "manual" | "preview" | "schedule" | "change" | "state" | "reconciliation";
export type RunStatus = "queued" | "running" | "success" | "error" | "cancelled";
export interface RunRecord {
    runId: string;
    jobId: string;
    source: RunSource;
    dryRun: boolean;
    status: RunStatus;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    summary?: unknown;
    redactedError?: string;
}
export interface RunItems {
    runId: string;
    items: Array<{
        path: string;
        action: string;
    }>;
    total: number;
}
interface Invocation {
    record: RunRecord;
    execute: (runId: string) => Promise<{
        summary?: unknown;
        items?: RunItems["items"];
        total?: number;
    }>;
}
/** Serializes invocations per job and owns their complete, persistent lifecycle. */
export declare class RunManager {
    private readonly root;
    private readonly redact;
    private readonly retention;
    private readonly detailRetention;
    private readonly runs;
    private readonly queues;
    private readonly active;
    private readonly details;
    private stopping;
    private saveChain;
    constructor(root: string, redact: (error: unknown) => string, retention?: number, detailRetention?: number);
    load(): Promise<void>;
    enqueue(jobId: string, source: RunSource, dryRun: boolean, execute: Invocation["execute"]): {
        accepted: boolean;
        runId: string;
        queued: boolean;
        dryRun: boolean;
        coalesced: boolean;
    };
    private isAutomatic;
    private pump;
    private perform;
    private finish;
    get(id: string): RunRecord | null;
    history(limit?: number): RunRecord[];
    getItems(id: string, offset?: number, limit?: number): {
        total: number;
        offset: number;
        limit: number;
        items: {
            path: string;
            action: string;
        }[];
    };
    private trim;
    private trimDetails;
    private persist;
    private atomic;
    shutdown(timeoutMs?: number): Promise<void>;
    get activeCount(): number;
    get retainedCount(): number;
}
export {};

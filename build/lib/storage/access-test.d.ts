import type { StorageProvider } from "./provider";
type Step = "list" | "write" | "read" | "rename" | "delete";
type Check = {
    step: Step;
    status: "ok" | "error" | "skipped";
    message?: string;
};
export interface AccessReport {
    latencyMs: number;
    checks: Check[];
    readOnly: boolean;
    ok: boolean;
    cleanupError?: string;
}
/** An opt-in write probe; normal health checks remain read-only. */
export declare function testAccess(provider: StorageProvider, readOnly: boolean, secrets?: string[]): Promise<AccessReport>;
export declare function withAccessTest(provider: StorageProvider, readOnly: boolean, secrets: string[]): StorageProvider;
export {};

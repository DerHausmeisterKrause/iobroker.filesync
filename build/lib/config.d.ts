import { z } from "zod";
import type { AdapterConfig, DataLocation, Job, SecretRecord } from "./types";
export declare const secretRecordSchema: z.ZodObject<{
    password: z.ZodOptional<z.ZodString>;
    privateKey: z.ZodOptional<z.ZodString>;
    passphrase: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    password?: string | undefined;
    privateKey?: string | undefined;
    passphrase?: string | undefined;
}, {
    password?: string | undefined;
    privateKey?: string | undefined;
    passphrase?: string | undefined;
}>;
export declare function validateSecret(v: unknown): SecretRecord;
export declare function validateLocation(v: unknown): DataLocation;
export declare function validateJob(v: unknown): Job;
export declare function secureLocationCredentialId(raw: unknown, existing?: DataLocation): unknown;
export declare function migrateConfig(raw: Partial<AdapterConfig>): AdapterConfig;
export declare function validateRelations(c: AdapterConfig, j: Job): void;
/** Return warnings for direct change-triggered ping-pong cycles. */
export declare function relationWarnings(jobs: Job[]): string[];

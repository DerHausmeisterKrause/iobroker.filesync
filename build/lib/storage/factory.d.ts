import type { DataLocation, SecretRecord } from "../types";
import type { StorageProvider } from "./provider";
export declare function providerFor(l: DataLocation, secrets: Record<string, SecretRecord>): StorageProvider;

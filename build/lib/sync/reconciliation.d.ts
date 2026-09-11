import type { FileMetadata } from "../types";
export interface PendingObservation {
    size: number;
    mtimeMs: number;
    observedAt: number;
}
export declare function stableSince(file: FileMetadata, pending: PendingObservation | undefined, windowMs: number, now?: number): boolean;
export declare function targetNeedsRepair(source: FileMetadata, target: FileMetadata | undefined): boolean;

import type { FileMetadata, Job } from "../types";
export declare function matches(file: FileMetadata, filters: Job["filters"]): boolean;
export declare function changed(a: FileMetadata, b?: FileMetadata): boolean;

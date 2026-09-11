import type { WebConfig } from "./types";
export type FileSyncLocalLinks = Record<string, {
    name: {
        en: string;
        de: string;
    };
    link: string;
}>;
export declare function localLinksForWeb(web: Pick<WebConfig, "enabled" | "secure" | "port">, running?: boolean): FileSyncLocalLinks;
export declare function localLinksEqual(current: unknown, wanted: FileSyncLocalLinks): boolean;

import type { AdapterConfig, DataLocation, SecretRecord } from "./types";
export interface WebApi {
    config(): AdapterConfig;
    publicLocation(location: DataLocation): unknown;
    persistLocation(raw: unknown, secret?: SecretRecord): Promise<unknown>;
    deleteLocation(id: string): Promise<void>;
    persistJob(raw: unknown): Promise<unknown>;
    deleteJob(id: string): Promise<void>;
    testLocation(id: string, write: boolean): Promise<unknown>;
    browseLocation(id: string, p: string, offset: number, limit: number): Promise<unknown>;
    startRun(id: string, preview: boolean): unknown;
    run(id: string): unknown;
    runs(limit: number): unknown[];
    runItems(id: string, offset: number, limit: number): unknown;
    status(): unknown;
    tls?(): Promise<{
        key: string | Buffer;
        cert: string | Buffer;
        ca?: string | Buffer;
    }>;
}
export declare class StandaloneWebServer {
    private api;
    private root;
    private secure;
    private server?;
    private sessions;
    private failures;
    constructor(api: WebApi, root: string, secure: boolean, ttlMinutes: number);
    start(port: number, bind: string): Promise<void>;
    stop(): Promise<void>;
    get port(): number | undefined;
    get loggedInUsers(): number;
    private requireTls;
    private headers;
    private json;
    private error;
    private body;
    private cookie;
    private principal;
    private csrf;
    private can;
    private location;
    private job;
    private validateGroups;
    private validateJobAccess;
    private login;
    private runVisible;
    private apiRequest;
    private handle;
}

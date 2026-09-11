import type { ScryptPassword, WebUser } from "./types";
export declare function hashPassword(password: string): Promise<ScryptPassword>;
export declare function verifyPassword(password: string, record: ScryptPassword | undefined): Promise<boolean>;
export interface Session {
    id: string;
    csrf: string;
    userId: string;
    expiresAt: number;
}
export declare class SessionStore {
    private ttlMinutes;
    private sessions;
    private cleanupTimer;
    constructor(ttlMinutes: number);
    create(userId: string): {
        id: string;
        csrf: string;
        userId: string;
        expiresAt: number;
    };
    get(id: string | undefined): Session | undefined;
    delete(id: string | undefined): void;
    cleanup(): void;
    close(): void;
    get size(): number;
}
export declare function safeUser(user: WebUser, groups: {
    id: string;
    name: string;
    enabled: boolean;
}[]): {
    id: string;
    username: string;
    displayName: string;
    admin: boolean;
    groups: {
        id: string;
        name: string;
    }[];
};

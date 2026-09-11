import type { FileSyncGroup, Permission } from "../types";
export declare class Authorizer {
    private readonly groups;
    constructor(groups: FileSyncGroup[]);
    can(user: string, permission: Permission, resource?: {
        type: "job" | "location";
        id: string;
    }): boolean;
}

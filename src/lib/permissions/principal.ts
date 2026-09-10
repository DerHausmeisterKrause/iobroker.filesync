import type { Permission } from "../types";
import { Authorizer } from "./authorizer";

/**
 * Authentication metadata is supplied by js-controller on the message envelope.
 * Values inside `message` are deliberately never considered an identity.
 */
export interface TrustedMessageEnvelope {
    from: string;
    user?: string;
}

export function authenticatedUser(envelope: TrustedMessageEnvelope): string {
    if (!envelope.user?.startsWith("system.user.")) {
        throw new Error("Authenticated ioBroker user is missing");
    }
    return envelope.user;
}

export function authorizeEnvelope(
    envelope: TrustedMessageEnvelope,
    authorizer: Authorizer,
    permission: Permission,
    resource?: { type: "job" | "location"; id: string },
): string {
    const user = authenticatedUser(envelope);
    if (!authorizer.can(user, permission, resource)) {
        throw new Error("Forbidden");
    }
    return user;
}

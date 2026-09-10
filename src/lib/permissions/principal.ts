/**
 * sendTo does not carry the authenticated socket user to the destination adapter.
 * Therefore this adapter deliberately does not invent a per-user identity. Its
 * administrative RPC surface accepts only messages transported by an Admin
 * adapter instance. Admin's `other.sendto` socket ACL is the authorization
 * boundary; this does not prove that the caller is an administrator.
 */
export interface ControllerMessageEnvelope { from: string }

export function assertAdminTransport(envelope: ControllerMessageEnvelope): void {
    if (!/^system\.adapter\.admin\.\d+$/.test(envelope.from)) {
        throw new Error("Administrative API requires an authenticated ioBroker Admin transport");
    }
}

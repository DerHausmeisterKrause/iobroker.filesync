"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertAdminTransport = assertAdminTransport;
function assertAdminTransport(envelope) {
    if (!/^system\.adapter\.admin\.\d+$/.test(envelope.from)) {
        throw new Error("Administrative API requires an authenticated ioBroker Admin transport");
    }
}
//# sourceMappingURL=principal.js.map
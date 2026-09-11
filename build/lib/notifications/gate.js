"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationGate = void 0;
class NotificationGate {
    failures = new Map();
    failure(job, cooldownMs, now = Date.now()) { const last = this.failures.get(job); if (last === undefined || now - last >= cooldownMs) {
        this.failures.set(job, now);
        return true;
    } return false; }
    recovery(job) { return this.failures.delete(job); }
    isFailed(job) { return this.failures.has(job); }
}
exports.NotificationGate = NotificationGate;
//# sourceMappingURL=gate.js.map
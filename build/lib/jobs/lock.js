"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobLock = void 0;
class JobLock {
    running = new Set();
    pending = new Map();
    tryAcquire(id, dryRun) { if (this.running.has(id)) {
        const queued = this.pending.get(id) ?? { realRequested: false, previewRequested: false };
        if (dryRun)
            queued.previewRequested = true;
        else
            queued.realRequested = true;
        this.pending.set(id, queued);
        return false;
    } this.running.add(id); return true; }
    release(id) { this.running.delete(id); const invocation = this.pending.get(id); this.pending.delete(id); return invocation; }
    count() { return this.running.size; }
    queued() { return this.pending.size; }
    clear() { this.running.clear(); this.pending.clear(); }
}
exports.JobLock = JobLock;
//# sourceMappingURL=lock.js.map
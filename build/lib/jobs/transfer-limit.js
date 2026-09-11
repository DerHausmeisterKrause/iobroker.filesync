"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransferLimiter = void 0;
class TransferLimiter {
    concurrency;
    changed;
    active = 0;
    closed = false;
    waiting = [];
    idleWaiters = new Set();
    constructor(concurrency, changed = () => undefined) {
        this.concurrency = concurrency;
        this.changed = changed;
        if (!Number.isInteger(concurrency) || concurrency < 1)
            throw new Error("Concurrency must be at least one");
    }
    get pendingCount() { return this.waiting.length; }
    get activeCount() { return this.active; }
    async run(operation) {
        if (this.closed)
            throw new Error("Transfer limiter is closed");
        if (this.active >= this.concurrency)
            await new Promise((resolve, reject) => { this.waiting.push({ resolve, reject }); this.changed(); });
        if (this.closed)
            throw new Error("Transfer limiter is closed");
        this.active++;
        this.changed();
        try {
            return await operation();
        }
        finally {
            this.active--;
            if (!this.closed)
                this.waiting.shift()?.resolve();
            if (this.active === 0) {
                for (const resolve of this.idleWaiters)
                    resolve();
                this.idleWaiters.clear();
            }
            this.changed();
        }
    }
    close() { if (this.closed)
        return; this.closed = true; for (const waiter of this.waiting.splice(0))
        waiter.reject(new Error("Transfer limiter is closed")); this.changed(); }
    async waitForIdle(timeoutMs) { if (this.active === 0)
        return; await Promise.race([new Promise(resolve => this.idleWaiters.add(resolve)), new Promise(resolve => setTimeout(resolve, timeoutMs))]); }
}
exports.TransferLimiter = TransferLimiter;
//# sourceMappingURL=transfer-limit.js.map
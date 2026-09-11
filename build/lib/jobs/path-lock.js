"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TargetPathLock = void 0;
/** A fair keyed mutex. Entries disappear as soon as the final waiter exits. */
class TargetPathLock {
    tails = new Map();
    async run(key, operation) {
        const previous = this.tails.get(key) ?? Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        const tail = previous.then(() => current);
        this.tails.set(key, tail);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            if (this.tails.get(key) === tail)
                this.tails.delete(key);
        }
    }
    get size() { return this.tails.size; }
}
exports.TargetPathLock = TargetPathLock;
//# sourceMappingURL=path-lock.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
async function retry(operation, options, sleep = (ms) => new Promise(r => setTimeout(r, ms))) { let last; for (let i = 0; i <= options.attempts; i++) {
    try {
        return await operation();
    }
    catch (e) {
        last = e;
        if (i === options.attempts)
            break;
        const delay = Math.min(options.maxDelayMs, options.baseDelayMs * (options.exponential ? 2 ** i : 1));
        await sleep(delay);
    }
} throw last; }
//# sourceMappingURL=retry.js.map
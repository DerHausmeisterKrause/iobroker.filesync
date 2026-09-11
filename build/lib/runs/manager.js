"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunManager = void 0;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const node_crypto_1 = require("node:crypto");
/** Serializes invocations per job and owns their complete, persistent lifecycle. */
class RunManager {
    root;
    redact;
    retention;
    detailRetention;
    runs = new Map();
    queues = new Map();
    active = new Map();
    details = new Map();
    stopping = false;
    saveChain = Promise.resolve();
    constructor(root, redact, retention = 500, detailRetention = 20) {
        this.root = root;
        this.redact = redact;
        this.retention = retention;
        this.detailRetention = detailRetention;
    }
    async load() { await (0, promises_1.mkdir)(this.root, { recursive: true }); try {
        const data = JSON.parse(await (0, promises_1.readFile)(node_path_1.default.join(this.root, "runs.json"), "utf8"));
        for (const record of data.slice(-this.retention))
            this.runs.set(record.runId, record);
    }
    catch { /* first start or damaged history */ } try {
        const data = JSON.parse(await (0, promises_1.readFile)(node_path_1.default.join(this.root, "run-items.json"), "utf8"));
        for (const item of data.slice(-this.detailRetention))
            this.details.set(item.runId, item);
    }
    catch { /* optional detail history */ } }
    enqueue(jobId, source, dryRun, execute) {
        if (this.stopping)
            throw new Error("Adapter is stopping");
        const queue = this.queues.get(jobId) ?? [], automatic = this.isAutomatic(source);
        if (automatic) {
            const pending = queue.find(item => this.isAutomatic(item.record.source));
            if (pending)
                return { accepted: true, runId: pending.record.runId, queued: true, dryRun: pending.record.dryRun, coalesced: true };
        }
        else if (queue.filter(item => !this.isAutomatic(item.record.source)).length >= 10)
            throw new Error("Manual run queue limit reached (maximum 10 per job)");
        const record = { runId: (0, node_crypto_1.randomUUID)(), jobId, source, dryRun, status: "queued", queuedAt: Date.now() };
        this.runs.set(record.runId, record);
        this.trim();
        const queued = queue.length > 0 || this.active.has(jobId);
        queue.push({ record, execute });
        this.queues.set(jobId, queue);
        void this.persist();
        this.pump(jobId);
        return { accepted: true, runId: record.runId, queued, dryRun, coalesced: false };
    }
    isAutomatic(source) { return source === "schedule" || source === "change" || source === "reconciliation"; }
    pump(jobId) { if (this.stopping || this.active.has(jobId))
        return; const invocation = this.queues.get(jobId)?.shift(); if (!invocation)
        return; const promise = this.perform(invocation).finally(() => { this.active.delete(jobId); this.pump(jobId); }); this.active.set(jobId, promise); }
    async perform(invocation) { const { record } = invocation; if (this.stopping) {
        this.finish(record, "cancelled");
        return;
    } record.status = "running"; record.startedAt = Date.now(); await this.persist(); try {
        const result = await invocation.execute(record.runId);
        record.summary = result.summary;
        if (result.items) {
            this.details.set(record.runId, { runId: record.runId, items: result.items, total: result.total ?? result.items.length });
            this.trimDetails();
        }
        this.finish(record, "success");
    }
    catch (error) {
        record.redactedError = this.redact(error);
        this.finish(record, "error");
    } await this.persist(); }
    finish(record, status) { record.status = status; record.finishedAt = Date.now(); }
    get(id) { return this.runs.get(id) ?? null; }
    history(limit = 100) { return [...this.runs.values()].sort((a, b) => b.queuedAt - a.queuedAt).slice(0, Math.min(500, Math.max(1, limit))); }
    getItems(id, offset = 0, limit = 200) { const detail = this.details.get(id); const safeOffset = Math.max(0, offset), safeLimit = Math.min(500, Math.max(1, limit)); const items = detail?.items ?? []; return { total: detail?.total ?? 0, offset: safeOffset, limit: safeLimit, items: items.slice(safeOffset, safeOffset + safeLimit) }; }
    trim() { while (this.runs.size > this.retention) {
        const oldest = this.runs.keys().next().value;
        if (!oldest)
            break;
        this.runs.delete(oldest);
    } }
    trimDetails() { while (this.details.size > this.detailRetention) {
        const oldest = this.details.keys().next().value;
        if (!oldest)
            break;
        this.details.delete(oldest);
    } }
    persist() { this.saveChain = this.saveChain.then(async () => { await (0, promises_1.mkdir)(this.root, { recursive: true }); await this.atomic("runs.json", [...this.runs.values()]); await this.atomic("run-items.json", [...this.details.values()]); }).catch(() => undefined); return this.saveChain; }
    async atomic(name, data) { const file = node_path_1.default.join(this.root, name), temp = `${file}.${process.pid}.tmp`; await (0, promises_1.writeFile)(temp, JSON.stringify(data), { mode: 0o600 }); await (0, promises_1.rename)(temp, file); }
    async shutdown(timeoutMs = 30000) { this.stopping = true; for (const queue of this.queues.values())
        for (const invocation of queue)
            this.finish(invocation.record, "cancelled"); this.queues.clear(); await this.persist(); const active = Promise.allSettled(this.active.values()); await Promise.race([active, new Promise(resolve => setTimeout(resolve, timeoutMs))]); await this.saveChain; }
    get activeCount() { return this.active.size; }
    get retainedCount() { return this.runs.size; }
}
exports.RunManager = RunManager;
//# sourceMappingURL=manager.js.map
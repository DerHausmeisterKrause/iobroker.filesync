"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncEngine = void 0;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:stream/promises");
const filter_1 = require("./filter");
const retry_1 = require("../utils/retry");
const reconciliation_1 = require("./reconciliation");
const path_lock_1 = require("../jobs/path-lock");
const MAX_RESULT_ITEMS = 500;
async function scan(p, root, recursive) {
    const out = [];
    const queue = [root];
    while (queue.length) {
        const current = queue.shift();
        for (const item of await p.list(current)) {
            if (item.type === "symlink")
                continue;
            if (item.type === "directory" && recursive)
                queue.push(item.path);
            else if (item.type === "file")
                out.push({ ...item, path: node_path_1.default.posix.relative(root, item.path) });
        }
    }
    return out;
}
async function hash(p, file) { const h = (0, node_crypto_1.createHash)("sha256"), stream = await p.createReadStream(file); for await (const chunk of stream)
    h.update(chunk); return h.digest("hex"); }
class SyncEngine {
    store;
    now;
    checkpointSize;
    transfer;
    checkpointFailed;
    targetLock;
    constructor(store, now = Date.now, checkpointSize = 25, transfer = operation => operation(), checkpointFailed = () => undefined, targetLock = new path_lock_1.TargetPathLock()) {
        this.store = store;
        this.now = now;
        this.checkpointSize = checkpointSize;
        this.transfer = transfer;
        this.checkpointFailed = checkpointFailed;
        this.targetLock = targetLock;
    }
    async run(job, source, target, dryRunOverride) {
        const dryRun = job.dryRun || dryRunOverride === true;
        const result = { copied: 0, overwritten: 0, versioned: 0, moved: 0, skipped: 0, failed: 0, deleted: 0, bytes: 0, scanned: 0, dryRun, totalActions: 0, resultTruncated: false, items: [] };
        const action = (filePath, kind) => { result.totalActions++; if (result.items.length < MAX_RESULT_ITEMS)
            result.items.push({ path: filePath, action: kind });
        else
            result.resultTruncated = true; };
        let snapshot = await this.store.load(job.id), dirty = 0;
        const checkpoint = async (force = false) => { if (!dryRun && (force || dirty >= this.checkpointSize)) {
            await this.store.save(job.id, snapshot);
            dirty = 0;
        } };
        try {
            await source.connect();
            await target.connect();
            const files = (await scan(source, job.sourcePath, job.recursive)).filter(f => (0, filter_1.matches)(f, job.filters));
            snapshot.pending ??= {};
            result.scanned = files.length;
            const sourceSet = new Set(files.map(f => f.path));
            for (const file of files) {
                const old = snapshot.files[file.path];
                const src = node_path_1.default.posix.join(job.sourcePath, file.path);
                const canonical = node_path_1.default.posix.join(job.targetPath, file.path);
                const previousTarget = old?.targetPath ?? canonical;
                const previousTargetMeta = await target.statOrUndefined(previousTarget);
                const canonicalTargetMeta = previousTarget === canonical ? previousTargetMeta : await target.statOrUndefined(canonical);
                let repair = (0, reconciliation_1.targetNeedsRepair)(file, previousTargetMeta);
                if (job.hashCheck && !repair && previousTargetMeta)
                    repair = await hash(source, src) !== await hash(target, previousTarget);
                if (job.mode === "incremental" && !(0, filter_1.changed)(file, old) && !repair) {
                    action(file.path, "skip");
                    result.skipped++;
                    continue;
                }
                if (job.stabilitySeconds > 0) {
                    const pending = snapshot.pending[file.path];
                    const unchanged = pending && pending.size === file.size && pending.mtimeMs === file.mtimeMs;
                    if (!(0, reconciliation_1.stableSince)(file, pending, job.stabilitySeconds * 1000, this.now())) {
                        snapshot.pending[file.path] = { size: file.size, mtimeMs: file.mtimeMs, observedAt: unchanged ? pending.observedAt : this.now() };
                        dirty++;
                        await checkpoint();
                        result.skipped++;
                        continue;
                    }
                }
                delete snapshot.pending[file.path];
                let canonicalExists = canonicalTargetMeta !== undefined, final = canonical, kind = canonicalExists && job.conflict === "version" ? "version" : canonicalExists ? "overwrite" : "copy";
                if (dryRun) {
                    if (canonicalExists && job.conflict === "never") {
                        result.skipped++;
                        continue;
                    }
                    if (canonicalExists && job.conflict === "error")
                        throw new Error(`Target conflict: ${file.path}`);
                    if (kind === "version")
                        final = `${canonical}.${this.now()}`;
                }
                if (!dryRun) {
                    const outcome = await this.targetLock.run(`${job.targetLocationId}:${target.normalizePath(canonical)}`, () => this.transfer(async () => {
                        // The conflict decision and destination selection must use state observed while holding the path lock.
                        canonicalExists = (await target.statOrUndefined(canonical)) !== undefined;
                        if (canonicalExists && job.conflict === "never")
                            return { skipped: true, final: canonical, kind: "copy" };
                        if (canonicalExists && job.conflict === "error")
                            throw new Error(`Target conflict: ${file.path}`);
                        kind = canonicalExists && job.conflict === "version" ? "version" : canonicalExists ? "overwrite" : "copy";
                        final = kind === "version" ? `${canonical}.${this.now()}` : canonical;
                        await target.mkdir(node_path_1.default.posix.dirname(final));
                        await (0, retry_1.retry)(async () => { const temp = node_path_1.default.posix.join(node_path_1.default.posix.dirname(final), `.${node_path_1.default.posix.basename(final)}.filesync-${(0, node_crypto_1.randomUUID)()}.tmp`); try {
                            const before = await source.stat(src);
                            await (0, promises_1.pipeline)(await source.createReadStream(src), await target.createWriteStream(temp));
                            const written = await target.stat(temp);
                            const after = await source.stat(src);
                            if (written.size !== before.size || (0, filter_1.changed)(before, after))
                                throw new Error("Source changed during transfer or size verification failed");
                            if (job.hashCheck && await hash(source, src) !== await hash(target, temp))
                                throw new Error("SHA-256 verification failed");
                            await target.replace(temp, final);
                            if (job.preserveTimestamps && target.setMtime)
                                await target.setMtime(final, before.mtimeMs);
                        }
                        catch (e) {
                            await target.remove(temp).catch(() => undefined);
                            throw e;
                        } }, job.retry);
                        return { skipped: false, final, kind };
                    }));
                    if (outcome.skipped) {
                        action(file.path, "skip");
                        result.skipped++;
                        continue;
                    }
                    final = outcome.final;
                    kind = outcome.kind;
                    snapshot.files[file.path] = { ...file, syncedAt: this.now(), hash: job.hashCheck ? await hash(source, src) : undefined, targetPath: final };
                    dirty++;
                    await checkpoint();
                    if (job.mode === "move")
                        await source.remove(src);
                }
                action(file.path, kind);
                result.copied++;
                if (kind === "overwrite")
                    result.overwritten++;
                if (kind === "version")
                    result.versioned++;
                if (job.mode === "move")
                    result.moved++;
                result.bytes += file.size;
            }
            if (job.mode === "mirror" && job.mirrorDeleteConfirmed) {
                for (const targetFile of (await scan(target, job.targetPath, job.recursive)).filter(file => (0, filter_1.matches)(file, job.filters))) {
                    if (!sourceSet.has(targetFile.path)) {
                        const removePath = node_path_1.default.posix.join(job.targetPath, targetFile.path);
                        let removed = dryRun;
                        if (!dryRun)
                            removed = await this.targetLock.run(`${job.targetLocationId}:${target.normalizePath(removePath)}`, async () => { const current = await target.statOrUndefined(removePath); if (!current || current.size !== targetFile.size || current.mtimeMs !== targetFile.mtimeMs)
                                return false; await target.remove(removePath); return true; });
                        if (removed) {
                            action(targetFile.path, "delete");
                            result.deleted++;
                        }
                    }
                }
            }
            if (!dryRun) {
                snapshot = { version: 1, files: Object.fromEntries(Object.entries(snapshot.files).filter(([p]) => sourceSet.has(p))), pending: Object.fromEntries(Object.entries(snapshot.pending).filter(([p]) => sourceSet.has(p))) };
                dirty++;
                await checkpoint(true);
            }
            return result;
        }
        catch (error) {
            if (!dryRun && dirty > 0) {
                try {
                    await checkpoint(true);
                }
                catch (checkpointError) {
                    this.checkpointFailed(checkpointError);
                }
            }
            throw error;
        }
        finally {
            await Promise.allSettled([source.disconnect(), target.disconnect()]);
        }
    }
}
exports.SyncEngine = SyncEngine;
//# sourceMappingURL=engine.js.map
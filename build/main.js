"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSyncAdapter = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const utils = __importStar(require("@iobroker/adapter-core"));
const node_path_1 = __importDefault(require("node:path"));
const web_auth_1 = require("./lib/web-auth");
const web_server_1 = require("./lib/web-server");
const config_1 = require("./lib/config");
const factory_1 = require("./lib/storage/factory");
const store_1 = require("./lib/persistence/store");
const engine_1 = require("./lib/sync/engine");
const manager_1 = require("./lib/runs/manager");
const transfer_limit_1 = require("./lib/jobs/transfer-limit");
const redact_1 = require("./lib/security/redact");
const principal_1 = require("./lib/permissions/principal");
class FileSyncAdapter extends utils.Adapter {
    cfg;
    webServer;
    secrets = {};
    engine;
    transfers;
    runManager;
    timers = new Map();
    failedJobs = new Set();
    health;
    stopping = false;
    constructor(options = {}) { super({ ...options, name: "filesync" }); this.on("ready", () => void this.ready().catch(e => this.log.error(this.redactSafe(e)))); this.on("message", obj => void this.message(obj).catch(e => this.log.error(this.redactSafe(e)))); this.on("stateChange", (id, state) => void this.state(id, state).catch(e => this.log.warn(this.redactSafe(e)))); this.on("unload", cb => void this.unload(cb).catch(e => { this.log.error(this.redactSafe(e)); cb(); })); }
    async ready() {
        await this.ensureInfoStates();
        await this.setStateAsync("info.connection", false, true);
        try {
            this.cfg = (0, config_1.migrateConfig)(this.config);
            const vault = this.cfg.credentialVault?.trim();
            if (!vault || vault === "{}")
                this.secrets = {};
            else
                try {
                    const parsed = JSON.parse(vault);
                    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
                        throw new Error("invalid vault");
                    this.secrets = parsed;
                }
                catch {
                    this.secrets = {};
                    this.log.warn("Encrypted credential vault was invalid and has been ignored");
                }
            await this.processWebUsers();
            this.runManager = new manager_1.RunManager(node_path_1.default.join(utils.getAbsoluteInstanceDataDir(this), "history"), error => this.redactSafe(error), this.cfg.auditRetention, 20);
            await this.runManager.load();
            this.transfers = new transfer_limit_1.TransferLimiter(this.cfg.maxConcurrentTransfers, () => { void this.updateCounters().catch(e => this.log.debug(this.redactSafe(e))); });
            this.engine = new engine_1.SyncEngine(new store_1.PersistentStore(node_path_1.default.join(utils.getAbsoluteInstanceDataDir(this), "indexes")), Date.now, 25, operation => this.transfers.run(operation), e => this.log.error(`Snapshot checkpoint failed: ${this.redactSafe(e)}`));
            await this.subscribeStatesAsync("jobs.*.trigger");
            await this.subscribeStatesAsync("jobs.*.enabled");
            await this.rebuildSchedule();
            this.health = setInterval(() => void this.checkHealth(), this.cfg.healthIntervalSeconds * 1000);
            if (this.cfg.web.enabled) {
                if (this.hasWebAdmin())
                    await this.startWebServer().catch(error => this.log.error(`Webserver disabled/not started: ${this.redactSafe(error)}`));
                else
                    this.log.warn("Webserver disabled/not started: no active web administrator configured");
            }
            await this.setStateAsync("info.connection", true, true);
            await this.updateCounters();
        }
        catch (e) {
            this.log.error(this.redactSafe(e));
            await this.setStateAsync("info.connection", false, true);
        }
    }
    hasWebAdmin() { return this.cfg.webUsers.some(user => user.enabled && user.admin && user.passwordHash); }
    async ensureInfoStates() {
        const states = [
            ["info.connection", "Connected", "boolean", "indicator.connected"], ["info.activeJobs", "Active jobs", "number", "value"], ["info.failedJobs", "Failed jobs", "number", "value"], ["info.queuedTransfers", "Queued transfers", "number", "value"],
            ["info.webServerRunning", "Web server running", "boolean", "value"], ["info.webServerPort", "Web server port", "number", "value"], ["info.webServerSecure", "Web server secure", "boolean", "value"], ["info.webServerUrl", "Web server URL", "string", "value"]
        ];
        for (const [id, name, type, role] of states)
            await this.setObjectNotExistsAsync(id, { type: "state", common: { name, type, role, read: true, write: false }, native: {} });
        await Promise.all([this.setStateAsync("info.webServerRunning", false, true), this.setStateAsync("info.webServerPort", Number(this.config.web?.port ?? 8095), true), this.setStateAsync("info.webServerSecure", Boolean(this.config.web?.secure), true), this.setStateAsync("info.webServerUrl", "", true)]);
    }
    async processWebUsers() { let changed = false; for (const user of this.cfg.webUsers) {
        if (user.newPassword) {
            user.passwordHash = await (0, web_auth_1.hashPassword)(user.newPassword);
            delete user.newPassword;
            changed = true;
        }
    } if (changed)
        await this.persistCandidate(this.cfg, this.secrets); }
    async startWebServer() { const webRoot = node_path_1.default.join(__dirname, "..", "web-dist"); this.webServer = new web_server_1.StandaloneWebServer({ config: () => this.cfg, publicLocation: l => this.publicLocation(l), persistLocation: (location, secret) => this.saveLocation({ location, secret }), deleteLocation: async (id) => { await this.deleteLocation(id); }, persistJob: job => this.saveJob(job), deleteJob: async (id) => { await this.deleteJob(id); }, testLocation: (id, write) => this.withProvider(id, p => p.testConnection(write)), browseLocation: async (id, requestedPath, offset, limit) => { const entries = (await this.withProvider(id, p => p.list(requestedPath))).filter(x => x.type === "directory"); return { path: requestedPath, offset, limit, total: entries.length, hasMore: offset + limit < entries.length, entries: entries.slice(offset, offset + limit) }; }, startRun: (id, preview) => this.startRun(id, preview), run: id => this.runManager.get(id), runs: limit => this.runManager.history(limit), runItems: (id, offset, limit) => this.runManager.getItems(id, offset, limit), status: () => ({ version: "0.1.0", connected: true, webServer: true, activeJobs: this.runManager.activeCount, failedJobs: this.failedJobs.size, queue: this.transfers.pendingCount, locations: this.cfg.locations.length, jobs: this.cfg.jobs.length }), tls: () => this.loadTls() }, webRoot, this.cfg.web.secure, this.cfg.web.sessionTtlMinutes); try {
        await this.webServer.start(this.cfg.web.port, this.cfg.web.bind);
        const host = this.cfg.web.bind === "0.0.0.0" ? "HOST" : this.cfg.web.bind, url = `${this.cfg.web.secure ? "https" : "http"}://${host}:${this.cfg.web.port}`;
        await Promise.all([this.setStateAsync("info.webServerRunning", true, true), this.setStateAsync("info.webServerUrl", url, true)]);
        if (!this.cfg.web.secure)
            this.log.warn("FileSync HTTP login is unencrypted; use it only on a trusted LAN");
    }
    catch (error) {
        await this.setStateAsync("info.webServerRunning", false, true);
        throw new Error(`FileSync web server could not listen on ${this.cfg.web.bind}:${this.cfg.web.port}: ${this.redactSafe(error)}`);
    } }
    async loadTls() { const { certPublic, certPrivate, certChained } = this.cfg.web; if (!certPublic || !certPrivate)
        throw new Error("HTTPS requires public and private ioBroker certificates"); const [certificates] = await this.getCertificatesAsync(certPublic, certPrivate, certChained); if (!certificates.key || !certificates.cert)
        throw new Error("Selected ioBroker TLS certificates are incomplete"); return certificates; }
    auth(envelope) { (0, principal_1.assertAdminTransport)(envelope); }
    redactSafe(error) { return String((0, redact_1.redact)(error, Object.values(this.secrets).flatMap(secret => Object.values(secret).filter((value) => typeof value === "string" && value.length > 0)))); }
    publicLocation(l) { const secret = "credentialId" in l ? this.secrets[l.credentialId] ?? {} : {}; return { ...Object.fromEntries(Object.entries(l).filter(([key]) => key !== "credentialId")), target: l.type === "local" ? l.basePath : l.type === "smb" ? `${l.host}/${l.share}` : `${l.host}:${l.basePath}`, hasPassword: Boolean(secret.password), hasPrivateKey: Boolean(secret.privateKey), hasPassphrase: Boolean(secret.passphrase) }; }
    async message(obj) { if (!obj.command || !obj.callback)
        return; const r = (obj.message ?? {}); try {
        let data;
        switch (obj.command) {
            case "listLocations":
                this.auth(obj);
                data = this.cfg.locations.map(l => this.publicLocation(l));
                break;
            case "testLocation":
                this.auth(obj);
                data = await this.withProvider(r.locationId, p => p.testConnection(Boolean(r.writeTest)));
                break;
            case "browseLocation":
                this.auth(obj);
                {
                    const requestedPath = r.path ?? "", offset = Math.max(0, r.offset ?? 0), limit = Math.max(1, Math.min(500, r.limit ?? 200)), entries = (await this.withProvider(r.locationId, p => p.list(requestedPath))).filter(x => x.type === "directory");
                    data = { path: requestedPath, offset, limit, total: entries.length, hasMore: offset + limit < entries.length, entries: entries.slice(offset, offset + limit) };
                }
                break;
            case "saveLocation":
                this.auth(obj);
                if (r.secret || r.deleteSecret)
                    this.auth(obj);
                data = await this.saveLocation(r);
                break;
            case "deleteLocation":
                this.auth(obj);
                data = await this.deleteLocation(r.locationId);
                break;
            case "listJobs":
                this.auth(obj);
                data = this.cfg.jobs;
                break;
            case "saveJob":
                this.auth(obj);
                data = await this.saveJob(r.job);
                break;
            case "deleteJob":
                this.auth(obj);
                data = await this.deleteJob(r.id);
                break;
            case "runJob":
                this.auth(obj);
                data = this.startRun(r.id, false);
                break;
            case "previewJob":
                this.auth(obj);
                data = this.startRun(r.id, true);
                break;
            case "getRunStatus":
                this.auth(obj);
                data = this.runManager.get(r.id);
                break;
            case "getRunHistory":
                this.auth(obj);
                data = this.runManager.history(r.limit);
                break;
            case "getRunItems":
                this.auth(obj);
                data = this.runManager.getItems(r.id, r.offset, r.limit);
                break;
            case "status":
                this.auth(obj);
                data = { connected: true, activeJobs: this.runManager.activeCount, failedJobs: this.failedJobs.size, queuedTransfers: this.transfers.pendingCount, locations: this.cfg.locations.length, jobs: this.cfg.jobs.length };
                break;
            default: throw new Error("Unknown command");
        }
        this.sendTo(obj.from, obj.command, { ok: true, data }, obj.callback);
    }
    catch (e) {
        this.sendTo(obj.from, obj.command, { ok: false, error: this.redactSafe(e) }, obj.callback);
    } }
    async withProvider(id, fn) { const l = this.cfg.locations.find(x => x.id === id); if (!l)
        throw new Error("Location not found"); const p = (0, factory_1.providerFor)(l, this.secrets); await p.connect(); try {
        return await fn(p);
    }
    finally {
        await p.disconnect();
    } }
    credentialInUse(id, exceptLocationId) { return this.cfg.locations.some(l => l.id !== exceptLocationId && "credentialId" in l && l.credentialId === id); }
    cloneConfig() { return structuredClone(this.cfg); }
    cloneSecrets() { return structuredClone(this.secrets); }
    async persistCandidate(config, secrets) { config.credentialVault = JSON.stringify(secrets); const adapter = this; if (typeof adapter.updateConfig !== "function")
        throw new Error("This js-controller does not provide the secure updateConfig API"); await adapter.updateConfig(config); }
    async saveLocation(r) { const next = this.cloneConfig(), nextSecrets = this.cloneSecrets(); const requested = r.location && typeof r.location === "object" ? r.location : {}; const existing = next.locations.find(x => x.id === requested.id); const l = (0, config_1.validateLocation)((0, config_1.secureLocationCredentialId)(r.location, existing)); if (r.secret) {
        r.secret = (0, config_1.validateSecret)(r.secret);
        if (!("credentialId" in l))
            throw new Error("Local locations cannot store credentials");
        nextSecrets[l.credentialId] = { ...nextSecrets[l.credentialId], ...Object.fromEntries(Object.entries(r.secret).filter(([, v]) => v !== "")) };
    } if (r.deleteSecret && "credentialId" in l)
        delete nextSecrets[l.credentialId]; if (existing && "credentialId" in existing && (!("credentialId" in l) || existing.credentialId !== l.credentialId) && !next.locations.some(x => x.id !== existing.id && "credentialId" in x && x.credentialId === existing.credentialId))
        delete nextSecrets[existing.credentialId]; const i = next.locations.findIndex(x => x.id === l.id); if (i < 0)
        next.locations.push(l);
    else
        next.locations[i] = l; for (const job of next.jobs.filter(j => j.sourceLocationId === l.id || j.targetLocationId === l.id))
        (0, config_1.validateRelations)(next, job); await this.persistCandidate(next, nextSecrets); this.cfg = next; this.secrets = nextSecrets; await this.rebuildSchedule(); return this.publicLocation(l); }
    async deleteLocation(id) { if (this.cfg.jobs.some(j => j.sourceLocationId === id || j.targetLocationId === id))
        throw new Error("Location is referenced by a job"); const next = this.cloneConfig(), nextSecrets = this.cloneSecrets(), l = next.locations.find(x => x.id === id); next.locations = next.locations.filter(x => x.id !== id); if (l && "credentialId" in l && !next.locations.some(x => "credentialId" in x && x.credentialId === l.credentialId))
        delete nextSecrets[l.credentialId]; await this.persistCandidate(next, nextSecrets); this.cfg = next; this.secrets = nextSecrets; await this.rebuildSchedule(); return true; }
    async saveJob(raw) { const j = (0, config_1.validateJob)(raw), next = this.cloneConfig(), nextSecrets = this.cloneSecrets(); const i = next.jobs.findIndex(x => x.id === j.id); if (i < 0)
        next.jobs.push(j);
    else
        next.jobs[i] = j; (0, config_1.validateRelations)(next, j); const { relationWarnings } = await Promise.resolve().then(() => __importStar(require("./lib/config"))); for (const warning of relationWarnings(next.jobs))
        this.log.warn(warning); await this.persistCandidate(next, nextSecrets); this.cfg = next; this.secrets = nextSecrets; await this.rebuildSchedule(); return j; }
    async deleteJob(id) { const next = this.cloneConfig(), nextSecrets = this.cloneSecrets(); next.jobs = next.jobs.filter(x => x.id !== id); await this.persistCandidate(next, nextSecrets); this.cfg = next; this.secrets = nextSecrets; this.failedJobs.delete(id); await this.rebuildSchedule(); await this.updateCounters(); return true; }
    async persist() { this.cfg.credentialVault = JSON.stringify(this.secrets); const adapter = this; if (typeof adapter.updateConfig !== "function")
        throw new Error("This js-controller does not provide the secure updateConfig API"); await adapter.updateConfig(this.cfg); }
    async rebuildSchedule() { for (const t of this.timers.values())
        clearInterval(t); this.timers.clear(); for (const j of this.cfg.jobs) {
        await this.ensureJobStates(j);
        await this.setStateAsync(`jobs.${j.id}.enabled`, j.enabled, true);
        if (!j.enabled)
            this.failedJobs.delete(j.id);
        else if ((await this.getStateAsync(`jobs.${j.id}.status`))?.val === "error")
            this.failedJobs.add(j.id);
        if (j.enabled && j.trigger.type !== "manual")
            this.timers.set(j.id, setInterval(() => { void Promise.resolve().then(() => this.startRun(j.id, false, j.trigger.type === "change" ? "reconciliation" : "schedule")).catch(e => this.log.warn(`Scheduled job ${j.id} failed: ${this.redactSafe(e)}`)); }, j.trigger.intervalSeconds * 1000));
    } }
    async ensureJobStates(j) { for (const [key, type, write] of [["enabled", "boolean", true], ["running", "boolean", false], ["status", "string", false], ["lastRun", "number", false], ["lastSuccess", "number", false], ["lastError", "string", false], ["lastDryRun", "number", false], ["lastDryRunStatus", "string", false], ["lastDryRunError", "string", false], ["lastDryRunResultId", "string", false], ["lastDryRunScanned", "number", false], ["lastDryRunWouldCopy", "number", false], ["lastDryRunWouldOverwrite", "number", false], ["lastDryRunWouldVersion", "number", false], ["lastDryRunWouldDelete", "number", false], ["lastDryRunWouldMove", "number", false], ["lastDryRunBytes", "number", false], ["filesScanned", "number", false], ["filesCopied", "number", false], ["filesSkipped", "number", false], ["filesFailed", "number", false], ["bytesCopied", "number", false], ["duration", "number", false], ["currentFile", "string", false], ["queueSize", "number", false], ["trigger", "boolean", true]])
        await this.setObjectNotExistsAsync(`jobs.${j.id}.${key}`, { type: "state", common: { name: `${j.name} ${key}`, type, role: key === "trigger" ? "button" : "value", read: true, write }, native: {} }); }
    startRun(jobId, preview, source = preview ? "preview" : "manual") { if (this.stopping)
        throw new Error("Adapter is stopping"); const job = this.cfg.jobs.find(x => x.id === jobId); if (!job || !job.enabled)
        throw new Error("Job unavailable"); const dryRun = job.dryRun || preview; return this.runManager.enqueue(jobId, source, dryRun, runId => this.run(jobId, runId, dryRun)); }
    async run(id, runId, effectiveDryRun) { if (this.stopping)
        throw new Error("Adapter is stopping"); const j = this.cfg.jobs.find(x => x.id === id); if (!j || !j.enabled)
        throw new Error("Job unavailable"); const start = Date.now(); await this.setStateAsync(`jobs.${id}.running`, true, true); if (!effectiveDryRun)
        await this.setStateAsync(`jobs.${id}.status`, "scanning", true); try {
        const source = this.cfg.locations.find(x => x.id === j.sourceLocationId), target = this.cfg.locations.find(x => x.id === j.targetLocationId), result = await this.engine.run(j, (0, factory_1.providerFor)(source, this.secrets), (0, factory_1.providerFor)(target, this.secrets), effectiveDryRun);
        if (effectiveDryRun) {
            await Promise.all([this.setStateAsync(`jobs.${id}.lastDryRun`, Date.now(), true), this.setStateAsync(`jobs.${id}.lastDryRunStatus`, "success", true), this.setStateAsync(`jobs.${id}.lastDryRunError`, "", true), this.setStateAsync(`jobs.${id}.lastDryRunResultId`, runId, true), this.setStateAsync(`jobs.${id}.lastDryRunScanned`, result.scanned, true), this.setStateAsync(`jobs.${id}.lastDryRunWouldCopy`, result.copied - result.overwritten - result.versioned, true), this.setStateAsync(`jobs.${id}.lastDryRunWouldOverwrite`, result.overwritten, true), this.setStateAsync(`jobs.${id}.lastDryRunWouldVersion`, result.versioned, true), this.setStateAsync(`jobs.${id}.lastDryRunWouldDelete`, result.deleted, true), this.setStateAsync(`jobs.${id}.lastDryRunWouldMove`, result.moved, true), this.setStateAsync(`jobs.${id}.lastDryRunBytes`, result.bytes, true)]);
        }
        else {
            await Promise.all([this.setStateAsync(`jobs.${id}.status`, "success", true), this.setStateAsync(`jobs.${id}.lastSuccess`, Date.now(), true), this.setStateAsync(`jobs.${id}.filesScanned`, result.scanned, true), this.setStateAsync(`jobs.${id}.filesCopied`, result.copied, true), this.setStateAsync(`jobs.${id}.filesSkipped`, result.skipped, true), this.setStateAsync(`jobs.${id}.filesFailed`, result.failed, true), this.setStateAsync(`jobs.${id}.bytesCopied`, result.bytes, true)]);
            this.failedJobs.delete(id);
        }
        return { summary: { scanned: result.scanned, wouldCopy: result.copied - result.overwritten - result.versioned, wouldOverwrite: result.overwritten, wouldVersion: result.versioned, wouldMove: result.moved, wouldDelete: result.deleted, bytes: result.bytes, totalActions: result.totalActions, truncated: result.resultTruncated }, items: result.items, total: result.totalActions };
    }
    catch (error) {
        const safe = this.redactSafe(error);
        if (effectiveDryRun)
            await Promise.all([this.setStateAsync(`jobs.${id}.lastDryRun`, Date.now(), true), this.setStateAsync(`jobs.${id}.lastDryRunStatus`, "error", true), this.setStateAsync(`jobs.${id}.lastDryRunError`, safe, true), this.setStateAsync(`jobs.${id}.lastDryRunResultId`, runId, true)]);
        else {
            await this.setStateAsync(`jobs.${id}.status`, "error", true);
            await this.setStateAsync(`jobs.${id}.lastError`, safe, true);
            await this.setStateAsync(`jobs.${id}.filesFailed`, 1, true);
            this.failedJobs.add(id);
        }
        throw error;
    }
    finally {
        if (!effectiveDryRun) {
            await this.setStateAsync(`jobs.${id}.lastRun`, Date.now(), true);
            await this.setStateAsync(`jobs.${id}.duration`, Date.now() - start, true);
        }
        await this.setStateAsync(`jobs.${id}.running`, false, true);
        await this.updateCounters();
    } }
    async state(id, state) { if (!state || state.ack)
        return; const jobId = id.split(".").at(-2); if (id.endsWith(".trigger") && state.val === true) {
        if (jobId)
            try {
                this.startRun(jobId, false, "state");
            }
            catch (error) {
                this.log.warn(this.redactSafe(error));
            }
        await this.setStateAsync(id, false, true);
    }
    else if (id.endsWith(".enabled") && typeof state.val === "boolean" && jobId) {
        const current = this.cfg.jobs.find(x => x.id === jobId);
        if (!current)
            return;
        const next = this.cloneConfig(), nextSecrets = this.cloneSecrets(), candidate = next.jobs.find(x => x.id === jobId);
        candidate.enabled = state.val;
        candidate.updatedAt = new Date().toISOString();
        try {
            await this.persistCandidate(next, nextSecrets);
            this.cfg = next;
            this.secrets = nextSecrets;
            if (!candidate.enabled)
                this.failedJobs.delete(candidate.id);
            await this.rebuildSchedule();
            await this.updateCounters();
        }
        catch (error) {
            await this.setStateAsync(id, current.enabled, true);
            throw error;
        }
    } }
    async updateCounters() { await this.setStateAsync("info.activeJobs", this.runManager?.activeCount ?? 0, true); await this.setStateAsync("info.failedJobs", this.failedJobs.size, true); await this.setStateAsync("info.queuedTransfers", this.transfers?.pendingCount ?? 0, true); }
    async checkHealth() { for (const l of this.cfg.locations.filter(x => x.enabled)) {
        await this.withProvider(l.id, p => p.testConnection()).catch(e => this.log.debug(`Health check failed for ${l.id}: ${this.redactSafe(e)}`));
    } }
    async unload(cb) { this.stopping = true; for (const t of this.timers.values())
        clearInterval(t); this.timers.clear(); if (this.health)
        clearInterval(this.health); this.transfers?.close(); await this.webServer?.stop().catch(e => this.log.warn(this.redactSafe(e))); await this.setStateAsync("info.webServerRunning", false, true).catch(() => undefined); await this.runManager?.shutdown(30000); await this.transfers?.waitForIdle(30000); await this.setStateAsync("info.connection", false, true).catch(() => undefined); cb(); }
}
exports.FileSyncAdapter = FileSyncAdapter;
if (require.main === module)
    new FileSyncAdapter();
exports.default = (options = {}) => new FileSyncAdapter(options);
//# sourceMappingURL=main.js.map
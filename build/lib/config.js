"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.secretRecordSchema = void 0;
exports.validateSecret = validateSecret;
exports.validateLocation = validateLocation;
exports.validateJob = validateJob;
exports.secureLocationCredentialId = secureLocationCredentialId;
exports.migrateConfig = migrateConfig;
exports.validateRelations = validateRelations;
exports.relationWarnings = relationWarnings;
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const node_path_1 = __importDefault(require("node:path"));
const id = zod_1.z.string().min(1).max(128);
exports.secretRecordSchema = zod_1.z.object({ password: zod_1.z.string().max(4096).optional(), privateKey: zod_1.z.string().max(131072).optional(), passphrase: zod_1.z.string().max(4096).optional() }).strict();
function validateSecret(v) { return exports.secretRecordSchema.parse(v); }
const base = zod_1.z.object({ id, name: zod_1.z.string().min(1).max(128), description: zod_1.z.string().max(500).optional(), enabled: zod_1.z.boolean(), readOnly: zod_1.z.boolean(), timeoutMs: zod_1.z.number().int().min(1000).max(300000), groupIds: zod_1.z.array(id).default([]) });
const location = zod_1.z.discriminatedUnion("type", [base.extend({ type: zod_1.z.literal("local"), basePath: zod_1.z.string().min(1).refine(value => node_path_1.default.isAbsolute(value), "Local basePath must be absolute on this host") }), base.extend({ type: zod_1.z.literal("smb"), host: zod_1.z.string().min(1), port: zod_1.z.number().int().min(1).max(65535), share: zod_1.z.string().min(1).regex(/^[^\\/]+$/), domain: zod_1.z.string().optional(), username: zod_1.z.string().min(1), basePath: zod_1.z.string(), credentialId: id }), base.extend({ type: zod_1.z.literal("sftp"), host: zod_1.z.string().min(1), port: zod_1.z.number().int().min(1).max(65535), username: zod_1.z.string().min(1), auth: zod_1.z.enum(["password", "privateKey"]), basePath: zod_1.z.string().min(1), hostFingerprint: zod_1.z.string(), allowInsecureHostKey: zod_1.z.boolean(), credentialId: id })]);
const job = zod_1.z.object({ id, groupIds: zod_1.z.array(id).default([]), name: zod_1.z.string().min(1).max(128), description: zod_1.z.string().max(500).optional(), enabled: zod_1.z.boolean(), sourceLocationId: id, sourcePath: zod_1.z.string(), targetLocationId: id, targetPath: zod_1.z.string(), mode: zod_1.z.enum(["incremental", "full", "mirror", "move"]), mirrorDeleteConfirmed: zod_1.z.boolean(), dryRun: zod_1.z.boolean(), recursive: zod_1.z.boolean(), preserveTimestamps: zod_1.z.boolean(), hashCheck: zod_1.z.boolean(), stabilitySeconds: zod_1.z.number().int().min(0).max(86400), conflict: zod_1.z.enum(["changed", "always", "never", "error", "version"]), trigger: zod_1.z.object({ type: zod_1.z.enum(["change", "interval", "manual"]), intervalSeconds: zod_1.z.number().int().min(30) }), filters: zod_1.z.object({ include: zod_1.z.array(zod_1.z.string()).max(50), exclude: zod_1.z.array(zod_1.z.string()).max(50), minSize: zod_1.z.number().nonnegative().optional(), maxSize: zod_1.z.number().positive().optional() }), retry: zod_1.z.object({ attempts: zod_1.z.number().int().min(0).max(20), baseDelayMs: zod_1.z.number().int().min(100), exponential: zod_1.z.boolean(), maxDelayMs: zod_1.z.number().int().min(100) }), notificationGroupIds: zod_1.z.array(id), createdAt: zod_1.z.string().datetime(), updatedAt: zod_1.z.string().datetime() }).superRefine((value, ctx) => { if (value.mode === "mirror" && value.conflict === "version")
    ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: "Version conflict mode is not supported for mirror jobs", path: ["conflict"] }); });
function validateLocation(v) { return location.parse(v); }
function validateJob(v) { return job.parse(v); }
function secureLocationCredentialId(raw, existing) { if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return raw; const value = { ...raw }; if (value.type !== "smb" && value.type !== "sftp")
    return value; if (existing && "credentialId" in existing)
    value.credentialId = existing.credentialId;
else
    value.credentialId = (0, node_crypto_1.randomUUID)(); return value; }
function migrateConfig(raw) {
    const legacyGroups = Array.isArray(raw.groups) ? raw.groups : [];
    const groups = (Array.isArray(raw.webGroups) ? raw.webGroups : legacyGroups).map(group => ({ ...group, enabled: group.enabled !== false, users: group.users ?? [], permissions: group.permissions ?? [], locationIds: group.locationIds ?? [], jobIds: group.jobIds ?? [] }));
    const locations = (Array.isArray(raw.locations) ? raw.locations : []).map(location => ({ ...location, groupIds: Array.isArray(location.groupIds) ? location.groupIds : [] }));
    const jobs = (Array.isArray(raw.jobs) ? raw.jobs : []).map(item => ({ ...item, groupIds: Array.isArray(item.groupIds) ? item.groupIds : [] }));
    return { configVersion: 2, web: { enabled: raw.web?.enabled !== false, port: Math.max(1, Math.min(65535, raw.web?.port ?? 8095)), secure: Boolean(raw.web?.secure), bind: raw.web?.bind || "0.0.0.0", sessionTtlMinutes: Math.max(5, Math.min(10080, raw.web?.sessionTtlMinutes ?? 480)), certPublic: raw.web?.certPublic, certPrivate: raw.web?.certPrivate, certChained: raw.web?.certChained }, webGroups: groups, webUsers: Array.isArray(raw.webUsers) ? raw.webUsers.map(user => ({ ...user, groupIds: Array.isArray(user.groupIds) ? user.groupIds : [] })) : [], locations, jobs, groups: legacyGroups, notifications: Array.isArray(raw.notifications) ? raw.notifications : [], maxConcurrentTransfers: Math.max(1, Math.min(16, raw.maxConcurrentTransfers ?? 2)), healthIntervalSeconds: Math.max(30, raw.healthIntervalSeconds ?? 300), auditRetention: Math.max(10, Math.min(10000, raw.auditRetention ?? 500)), credentialVault: typeof raw.credentialVault === "string" ? raw.credentialVault : "{}" };
}
function inside(source, target) { const a = node_path_1.default.posix.normalize(`/${source.replace(/\\/g, "/")}`), b = node_path_1.default.posix.normalize(`/${target.replace(/\\/g, "/")}`); return b === a || b.startsWith(`${a.endsWith("/") ? a.slice(0, -1) : a}/`); }
function validateRelations(c, j) { const s = c.locations.find(x => x.id === j.sourceLocationId), t = c.locations.find(x => x.id === j.targetLocationId); if (!s || !t)
    throw new Error("Referenced location does not exist"); if (j.mode === "mirror" && j.conflict === "version")
    throw new Error("Version conflict mode is not supported for mirror jobs"); if (!s.enabled || !t.enabled)
    throw new Error("Referenced location is disabled"); if (t.readOnly)
    throw new Error("A read-only location cannot be used as a job target"); if (j.mode === "move" && s.readOnly)
    throw new Error("A read-only location cannot be used as a move source"); for (const other of c.jobs) {
    if (other.id !== j.id && other.targetLocationId === j.targetLocationId && (inside(other.targetPath, j.targetPath) || inside(j.targetPath, other.targetPath)) && (other.mode === "mirror" || j.mode === "mirror"))
        throw new Error(`Destructive mirror target overlaps job ${other.name}`);
} if (s.id === t.id && inside(j.sourcePath, j.targetPath))
    throw new Error("Target may not be identical to or inside source"); if (s.type === "local" && t.type === "local") {
    const a = node_path_1.default.resolve(s.basePath, j.sourcePath), b = node_path_1.default.resolve(t.basePath, j.targetPath);
    if (b === a || b.startsWith(`${a}${node_path_1.default.sep}`))
        throw new Error("Target may not be identical to or inside source");
} }
/** Return warnings for direct change-triggered ping-pong cycles. */
function relationWarnings(jobs) { const warnings = []; for (let i = 0; i < jobs.length; i++)
    for (let k = i + 1; k < jobs.length; k++) {
        const a = jobs[i], b = jobs[k];
        if (a.trigger.type === "change" && b.trigger.type === "change" && a.sourceLocationId === b.targetLocationId && a.targetLocationId === b.sourceLocationId && inside(a.sourcePath, b.targetPath) && inside(b.sourcePath, a.targetPath))
            warnings.push(`Jobs ${a.name} and ${b.name} form a synchronization cycle`);
        if (a.targetLocationId === b.targetLocationId && (inside(a.targetPath, b.targetPath) || inside(b.targetPath, a.targetPath)))
            warnings.push(`Jobs ${a.name} and ${b.name} have overlapping target scopes${a.mode === "mirror" || b.mode === "mirror" ? " (destructive mirror)" : ""}`);
    } return warnings; }
//# sourceMappingURL=config.js.map
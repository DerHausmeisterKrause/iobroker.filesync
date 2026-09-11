"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StandaloneWebServer = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const node_http_1 = require("node:http");
const node_https_1 = require("node:https");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const web_auth_1 = require("./web-auth");
class ApiError extends Error {
    status;
    code;
    constructor(status, code, message = "Access denied") {
        super(message);
        this.status = status;
        this.code = code;
    }
}
const locationBody = zod_1.z.object({ location: zod_1.z.record(zod_1.z.unknown()), secret: zod_1.z.object({ password: zod_1.z.string().max(4096).optional(), privateKey: zod_1.z.string().max(131072).optional(), passphrase: zod_1.z.string().max(4096).optional() }).optional() });
const jobBody = zod_1.z.object({ job: zod_1.z.record(zod_1.z.unknown()) });
class StandaloneWebServer {
    api;
    root;
    secure;
    server;
    sessions;
    failures = new Map();
    constructor(api, root, secure, ttlMinutes) {
        this.api = api;
        this.root = root;
        this.secure = secure;
        this.sessions = new web_auth_1.SessionStore(ttlMinutes);
    }
    async start(port, bind) { const handler = (req, res) => void this.handle(req, res); this.server = this.secure ? (0, node_https_1.createServer)(await this.requireTls(), handler) : (0, node_http_1.createServer)(handler); await new Promise((resolve, reject) => { this.server.once("error", reject); this.server.listen(port, bind, () => { this.server.off("error", reject); resolve(); }); }); }
    async stop() { this.sessions.close(); if (this.server)
        await new Promise((resolve, reject) => this.server.close(e => e ? reject(e) : resolve())); }
    get port() { const address = this.server?.address(); return typeof address === "object" && address ? address.port : undefined; }
    get loggedInUsers() { return this.sessions.size; }
    async requireTls() { if (!this.api.tls)
        throw new Error("HTTPS requires an ioBroker certificate collection"); return this.api.tls(); }
    headers(res, api = false) { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"); if (api)
        res.setHeader("Cache-Control", "no-store"); if (this.secure)
        res.setHeader("Strict-Transport-Security", "max-age=31536000"); }
    json(res, status, value) { this.headers(res, true); res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(value)); }
    error(res, error) { const known = error instanceof ApiError ? error : error instanceof zod_1.ZodError ? new ApiError(400, "VALIDATION_ERROR", "Invalid request") : new ApiError(500, "INTERNAL_ERROR", "Request failed"); this.json(res, known.status, { ok: false, error: { code: known.code, message: known.message } }); }
    async body(req) { let size = 0; const chunks = []; for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024)
            throw new ApiError(413, "BODY_TOO_LARGE", "Request body too large");
        chunks.push(chunk);
    } try {
        return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    }
    catch {
        throw new ApiError(400, "INVALID_JSON", "Invalid JSON");
    } }
    cookie(req) { return req.headers.cookie?.split(";").map(x => x.trim().split("=")).find(x => x[0] === "filesync_session")?.[1]; }
    principal(req) { const session = this.sessions.get(this.cookie(req)); const user = session && this.api.config().webUsers.find(x => x.id === session.userId && x.enabled); if (!session || !user)
        throw new ApiError(401, "AUTH_REQUIRED", "Authentication required"); return { user, session }; }
    csrf(req, p) { if (req.headers["x-csrf-token"] !== p.session.csrf)
        throw new ApiError(403, "CSRF_INVALID", "CSRF token invalid"); const origin = req.headers.origin; if (origin) {
        const host = req.headers.host;
        if (new URL(origin).host !== host)
            throw new ApiError(403, "ORIGIN_INVALID", "Origin denied");
    } }
    can(user, groups) { return user.admin || groups.some(id => user.groupIds.includes(id) && this.api.config().webGroups.some(group => group.id === id && group.enabled)); }
    location(user, id) { const value = this.api.config().locations.find(x => x.id === id); if (!value)
        throw new ApiError(404, "LOCATION_NOT_FOUND", "Location not found"); if (!this.can(user, value.groupIds))
        throw new ApiError(403, "LOCATION_FORBIDDEN"); return value; }
    job(user, id) { const value = this.api.config().jobs.find(x => x.id === id); if (!value)
        throw new ApiError(404, "JOB_NOT_FOUND", "Job not found"); if (!this.can(user, value.groupIds))
        throw new ApiError(403, "JOB_FORBIDDEN"); return value; }
    validateGroups(user, groups) { if (!Array.isArray(groups) || groups.some(x => typeof x !== "string") || (!user.admin && groups.some(x => !user.groupIds.includes(x))))
        throw new ApiError(403, "GROUP_FORBIDDEN"); if (groups.length === 0 && !user.admin)
        throw new ApiError(400, "GROUP_REQUIRED", "At least one group is required"); }
    validateJobAccess(user, raw) { this.validateGroups(user, raw.groupIds); const source = this.location(user, String(raw.sourceLocationId)), target = this.location(user, String(raw.targetLocationId)); if (!user.admin) {
        const groups = raw.groupIds;
        if (!groups.some(id => source.groupIds.includes(id)) || !groups.some(id => target.groupIds.includes(id)))
            throw new ApiError(400, "JOB_LOCATION_GROUP_MISMATCH", "Job and locations must share a group");
    } }
    async login(req, res) { const body = zod_1.z.object({ username: zod_1.z.string().min(1).max(128), password: zod_1.z.string().min(1).max(1024) }).parse(await this.body(req)); const key = `${req.socket.remoteAddress ?? "unknown"}|${body.username.toLocaleLowerCase()}`, failure = this.failures.get(key); if (failure && failure.blockedUntil > Date.now())
        throw new ApiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts; try again later"); const user = this.api.config().webUsers.find(x => x.username.toLocaleLowerCase() === body.username.toLocaleLowerCase()); if (!user?.enabled || !await (0, web_auth_1.verifyPassword)(body.password, user.passwordHash)) {
        const count = (failure?.count ?? 0) + 1;
        this.failures.set(key, { count, blockedUntil: count >= 5 ? Date.now() + Math.min(300_000, 2 ** (count - 5) * 10_000) : 0 });
        throw new ApiError(401, "INVALID_CREDENTIALS", "Benutzername oder Passwort falsch");
    } this.failures.delete(key); this.sessions.delete(this.cookie(req)); const session = this.sessions.create(user.id); res.setHeader("Set-Cookie", `filesync_session=${session.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor((session.expiresAt - Date.now()) / 1000)}${this.secure ? "; Secure" : ""}`); this.json(res, 200, { ok: true, data: { user: (0, web_auth_1.safeUser)(user, this.api.config().webGroups), csrfToken: session.csrf } }); }
    runVisible(user, record) { if (user.admin)
        return true; const job = this.api.config().jobs.find(x => x.id === record?.jobId); return Boolean(job && this.can(user, job.groupIds)); }
    async apiRequest(req, res, url) {
        const method = req.method ?? "GET", parts = url.pathname.split("/").filter(Boolean);
        if (url.pathname === "/api/auth/login" && method === "POST") {
            await this.login(req, res);
            return;
        }
        const p = this.principal(req);
        if (method !== "GET")
            this.csrf(req, p);
        if (url.pathname === "/api/auth/me" && method === "GET")
            return this.json(res, 200, { ok: true, data: { ...(0, web_auth_1.safeUser)(p.user, this.api.config().webGroups), csrfToken: p.session.csrf } });
        if (url.pathname === "/api/auth/logout" && method === "POST") {
            this.sessions.delete(p.session.id);
            res.setHeader("Set-Cookie", `filesync_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${this.secure ? "; Secure" : ""}`);
            return this.json(res, 200, { ok: true, data: true });
        }
        if (url.pathname === "/api/status" && method === "GET") {
            const visibleJobs = this.api.config().jobs.filter(x => this.can(p.user, x.groupIds)), visibleRuns = this.api.runs(500).filter(x => this.runVisible(p.user, x));
            const status = this.api.status();
            return this.json(res, 200, { ok: true, data: { ...status, locations: this.api.config().locations.filter(x => this.can(p.user, x.groupIds)).length, jobs: visibleJobs.length, activeJobs: visibleRuns.filter(x => x.status === "running").length, failedJobs: visibleRuns.filter(x => x.status === "error").length, queue: visibleRuns.filter(x => x.status === "queued").length } });
        }
        if (parts[1] === "locations") {
            const id = parts[2];
            if (!id && method === "GET")
                return this.json(res, 200, { ok: true, data: this.api.config().locations.filter(x => this.can(p.user, x.groupIds)).map(x => this.api.publicLocation(x)) });
            if (!id && method === "POST") {
                const b = locationBody.parse(await this.body(req));
                this.validateGroups(p.user, b.location.groupIds);
                return this.json(res, 201, { ok: true, data: await this.api.persistLocation(b.location, b.secret) });
            }
            const existing = this.location(p.user, id);
            if (parts[3] === "test" && method === "POST")
                return this.json(res, 200, { ok: true, data: await this.api.testLocation(id, Boolean((await this.body(req)).writeTest)) });
            if (parts[3] === "browse" && method === "GET")
                return this.json(res, 200, { ok: true, data: await this.api.browseLocation(id, url.searchParams.get("path") ?? "", Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("limit") ?? 200)) });
            if (method === "GET")
                return this.json(res, 200, { ok: true, data: this.api.publicLocation(existing) });
            if (method === "PUT") {
                const b = locationBody.parse(await this.body(req));
                if (b.location.id !== id)
                    throw new ApiError(400, "ID_MISMATCH", "ID mismatch");
                this.validateGroups(p.user, b.location.groupIds);
                return this.json(res, 200, { ok: true, data: await this.api.persistLocation(b.location, b.secret) });
            }
            if (method === "DELETE") {
                await this.api.deleteLocation(id);
                return this.json(res, 200, { ok: true, data: true });
            }
        }
        if (parts[1] === "jobs") {
            const id = parts[2];
            if (!id && method === "GET")
                return this.json(res, 200, { ok: true, data: this.api.config().jobs.filter(x => this.can(p.user, x.groupIds)) });
            if (!id && method === "POST") {
                const b = jobBody.parse(await this.body(req));
                this.validateJobAccess(p.user, b.job);
                return this.json(res, 201, { ok: true, data: await this.api.persistJob(b.job) });
            }
            const existing = this.job(p.user, id);
            if (parts[3] === "preview" && method === "POST")
                return this.json(res, 202, { ok: true, data: this.api.startRun(id, true) });
            if (parts[3] === "run" && method === "POST")
                return this.json(res, 202, { ok: true, data: this.api.startRun(id, false) });
            if (method === "GET")
                return this.json(res, 200, { ok: true, data: existing });
            if (method === "PUT") {
                const b = jobBody.parse(await this.body(req));
                if (b.job.id !== id)
                    throw new ApiError(400, "ID_MISMATCH", "ID mismatch");
                this.validateJobAccess(p.user, b.job);
                return this.json(res, 200, { ok: true, data: await this.api.persistJob(b.job) });
            }
            if (method === "DELETE") {
                await this.api.deleteJob(id);
                return this.json(res, 200, { ok: true, data: true });
            }
        }
        if (parts[1] === "runs") {
            if (!parts[2] && method === "GET")
                return this.json(res, 200, { ok: true, data: this.api.runs(Number(url.searchParams.get("limit") ?? 100)).filter(x => this.runVisible(p.user, x)) });
            const record = this.api.run(parts[2]);
            if (!record || !this.runVisible(p.user, record))
                throw new ApiError(404, "RUN_NOT_FOUND", "Run not found");
            if (parts[3] === "items")
                return this.json(res, 200, { ok: true, data: this.api.runItems(parts[2], Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("limit") ?? 200)) });
            return this.json(res, 200, { ok: true, data: record });
        }
        throw new ApiError(404, "NOT_FOUND", "Not found");
    }
    async handle(req, res) { try {
        const url = new URL(req.url ?? "/", `${this.secure ? "https" : "http"}://${req.headers.host ?? "localhost"}`);
        if (url.pathname.startsWith("/api/")) {
            await this.apiRequest(req, res, url);
            return;
        }
        const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const safe = node_path_1.default.resolve(this.root, relative);
        if (!safe.startsWith(node_path_1.default.resolve(this.root) + node_path_1.default.sep))
            throw new ApiError(404, "NOT_FOUND", "Not found");
        let data;
        try {
            data = await (0, promises_1.readFile)(safe);
        }
        catch {
            data = await (0, promises_1.readFile)(node_path_1.default.join(this.root, "index.html"));
        }
        this.headers(res);
        res.setHeader("Content-Type", safe.endsWith(".js") ? "text/javascript; charset=utf-8" : safe.endsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8");
        res.setHeader("Cache-Control", safe.endsWith("index.html") ? "no-cache" : "public, max-age=3600");
        res.end(data);
    }
    catch (error) {
        this.error(res, error);
    } }
}
exports.StandaloneWebServer = StandaloneWebServer;
//# sourceMappingURL=web-server.js.map
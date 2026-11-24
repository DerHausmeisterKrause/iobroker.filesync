"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAccess = testAccess;
exports.withAccessTest = withAccessTest;
const node_crypto_1 = require("node:crypto");
const node_stream_1 = require("node:stream");
const promises_1 = require("node:stream/promises");
const redact_1 = require("../security/redact");
/** An opt-in write probe; normal health checks remain read-only. */
async function testAccess(provider, readOnly, secrets = []) {
    const started = Date.now(), checks = [];
    const report = { latencyMs: 0, checks, readOnly, ok: false };
    const steps = ["list", "write", "read", "rename", "delete"];
    const id = (0, node_crypto_1.randomUUID)(), temporary = `.access.filesync-${id}.tmp`, renamed = `.access-renamed.filesync-${id}.tmp`;
    const payload = Buffer.from("FileSync access probe\n");
    let cleanupPath;
    const safe = (error) => String((0, redact_1.redact)(error, secrets));
    const check = async (step, operation) => { try {
        await operation();
        checks.push({ step, status: "ok" });
        return true;
    }
    catch (error) {
        checks.push({ step, status: "error", message: safe(error) });
        return false;
    } };
    try {
        if (!await check("list", async () => { await provider.list(""); }))
            return report;
        if (readOnly)
            return report;
        if (!await check("write", async () => {
            if (await provider.statOrUndefined(temporary) || await provider.statOrUndefined(renamed))
                throw new Error("Probe path already exists");
            const stream = await provider.createWriteStream(temporary);
            cleanupPath = temporary;
            try {
                await (0, promises_1.pipeline)(node_stream_1.Readable.from([payload]), stream);
            }
            catch (error) {
                if (error?.code === "EEXIST")
                    cleanupPath = undefined;
                throw error;
            }
        }))
            return report;
        if (!await check("read", async () => {
            const parts = [];
            let length = 0;
            for await (const chunk of await provider.createReadStream(temporary)) {
                const data = Buffer.from(chunk);
                length += data.length;
                if (length > payload.length)
                    throw new Error("Probe contents differ");
                parts.push(data);
            }
            if (!Buffer.concat(parts).equals(payload))
                throw new Error("Probe contents differ");
        }))
            return report;
        if (!await check("rename", async () => { if (await provider.statOrUndefined(renamed))
            throw new Error("Probe destination already exists"); await provider.rename(temporary, renamed); cleanupPath = renamed; }))
            return report;
        await check("delete", async () => { await provider.remove(renamed); cleanupPath = undefined; });
        return report;
    }
    finally {
        if (cleanupPath) {
            try {
                const info = await provider.statOrUndefined(cleanupPath);
                if (info) {
                    if (info.type !== "file")
                        throw new Error("Probe path is no longer a file");
                    await provider.remove(cleanupPath);
                }
            }
            catch (error) {
                report.cleanupError = `${cleanupPath}: ${safe(error)}`;
            }
        }
        for (const step of steps)
            if (!checks.some(c => c.step === step))
                checks.push({ step, status: "skipped" });
        report.ok = !report.cleanupError && checks.every(c => c.status === "ok" || (readOnly && c.status === "skipped"));
        report.latencyMs = Date.now() - started;
    }
}
function withAccessTest(provider, readOnly, secrets) {
    const original = provider.testConnection.bind(provider);
    provider.testConnection = (writeTest = false) => writeTest ? testAccess(provider, readOnly, secrets) : original(false);
    return provider;
}
//# sourceMappingURL=access-test.js.map
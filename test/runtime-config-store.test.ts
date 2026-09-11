import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialStore, RuntimeConfigStore } from "../src/lib/runtime-config-store";

const roots: string[] = [];
async function directory(): Promise<string> { const value = await mkdtemp(path.join(os.tmpdir(), "filesync-runtime-")); roots.push(value); return value; }
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe("runtime configuration persistence", () => {
    it("persists resources outside native config and survives reconstruction", async () => {
        const root = await directory();
        const store = new RuntimeConfigStore(root);
        const location = { id: "source", name: "Source", type: "local" as const, basePath: "/tmp/source", enabled: true, readOnly: false, timeoutMs: 1000, groupIds: ["group"] };
        await store.save({ version: 1, locations: [location], jobs: [] });
        expect(await new RuntimeConfigStore(root).load()).toEqual({ version: 1, locations: [location], jobs: [] });
        expect(await readFile(store.file, "utf8")).toContain('"locations"');
    });

    it("serializes concurrent atomic replacements", async () => {
        const store = new RuntimeConfigStore(await directory());
        await Promise.all(Array.from({ length: 20 }, (_, index) => store.save({ version: 1, locations: [], jobs: Array.from({ length: index }, () => ({} as never)) })));
        expect((await store.load()).jobs).toHaveLength(19);
        await expect(readFile(`${store.file}.tmp`, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("uses adapter encryption and never writes credential plaintext", async () => {
        const root = await directory();
        const encrypt = (value: string) => Buffer.from(value).toString("base64");
        const decrypt = (value: string) => Buffer.from(value, "base64").toString();
        const store = new CredentialStore(root, encrypt, decrypt);
        await store.save({ credential: { password: "top-secret", passphrase: "hidden" } });
        expect(await new CredentialStore(root, encrypt, decrypt).load()).toEqual({ credential: { password: "top-secret", passphrase: "hidden" } });
        expect(await readFile(store.file, "utf8")).not.toContain("top-secret");
    });
});


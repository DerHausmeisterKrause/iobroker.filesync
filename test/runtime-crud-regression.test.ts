import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("runtime CRUD restart regression", () => {
    it("keeps updateConfig confined to static web-user configuration", async () => {
        const source = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");
        expect(source.match(/\.updateConfig\(/g)).toHaveLength(1);
        expect(source).toMatch(/processWebUsers\(\).*persistStaticConfig/);
        for (const method of ["saveLocation", "deleteLocation", "saveJob", "deleteJob"]) {
            const body = source.slice(source.indexOf(`private ${method}`), source.indexOf("\n private ", source.indexOf(`private ${method}`)));
            expect(body, method).toContain("persistRuntime");
            expect(body, method).not.toContain("updateConfig");
        }
    });
});

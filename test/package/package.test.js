"use strict";
const path = require("node:path");
const { tests } = require("@iobroker/testing");
const fs = require("node:fs");
const assert = require("node:assert");
const pkg = require("../../package.json");
tests.packageFiles(path.join(__dirname, "../.."));

describe("committed runtime", () => {
    it("contains the package main directly after checkout", () => {
        assert.ok(fs.existsSync(path.join(__dirname, "../..", pkg.main)), `Missing package main: ${pkg.main}`);
    });

    it("declares every runtime info state object", () => {
        const ioPackage = require("../../io-package.json");
        const ids = new Set(ioPackage.objects.map(object => object._id));
        for (const id of ["info.connection", "info.activeJobs", "info.failedJobs", "info.queuedTransfers", "info.webServerRunning", "info.webServerPort", "info.webServerSecure", "info.webServerUrl"]) {
            assert.ok(ids.has(id), `Missing runtime object: ${id}`);
        }
    });

    it("ships sources needed for an emergency local build", () => {
        for (const file of ["src", "tsconfig.json", "scripts-build-web.js"]) {
            assert.ok(pkg.files.includes(file), `${file} is missing from package files`);
        }
    });
});

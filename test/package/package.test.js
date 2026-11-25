"use strict";
const path = require("node:path");
const { tests } = require("@iobroker/testing");
const fs = require("node:fs");
const assert = require("node:assert");
const pkg = require("../../package.json");
tests.packageFiles(path.join(__dirname, "../.."));

describe("committed runtime", () => {
    it("ships the same FileSync icon for Admin, web source and distribution", () => {
        const root = path.join(__dirname, "../..");
        const icon = require("../../io-package.json").common.icon;
        assert.equal(icon, "filesync.png");
        const image = fs.readFileSync(path.join(root,"admin",icon));
        assert.equal(image.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
        for (const dir of ["web-src","web-dist"]) {
            assert.deepEqual(fs.readFileSync(path.join(root,dir,icon)),image);
            assert.ok(fs.readFileSync(path.join(root,dir,"index.html"),"utf8").includes('href="/filesync.png"'));
        }
    });

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

    it("ships the isolated SMB worker used at runtime", () => {
        assert.ok(pkg.files.includes("src"));
        assert.ok(fs.existsSync(path.join(__dirname,"../../src/lib/storage/smb-worker.cjs")));
    });
    it("ships sources needed for an emergency local build", () => {
        for (const file of ["src", "tsconfig.json", "scripts-build-web.js"]) {
            assert.ok(pkg.files.includes(file), `${file} is missing from package files`);
        }
    });
    it("parses and round-trips SMB paths and domain usernames in the actual frontend", () => {
        const app = fs.readFileSync(path.join(__dirname,"../../web-dist/app.js"),"utf8");
        const helpers=app.split("// BEGIN SMB editor helpers")[1].split("// END SMB editor helpers")[0];
        const {parseSmbPath,formatSmbPath,parseSmbUsername,formatSmbUsername}=new Function(helpers+";return {parseSmbPath,formatSmbPath,parseSmbUsername,formatSmbUsername}")();
        for(const [raw,expected] of [
            ["10.10.22.34\\testshare",{host:"10.10.22.34",share:"testshare",basePath:""}],
            ["\\\\12.4.23.52\\share$\\test",{host:"12.4.23.52",share:"share$",basePath:"test"}],
            ["//server/Daten$/Ordner mit Leerzeichen/Unterordner/",{host:"server",share:"Daten$",basePath:"Ordner mit Leerzeichen/Unterordner"}],
            ["\\\\[::1]\\share",{host:"::1",share:"share",basePath:""}]
        ]){assert.deepStrictEqual(parseSmbPath(raw),expected);assert.deepStrictEqual(parseSmbPath(formatSmbPath(expected)),expected)}
        for(const raw of ["server","10.10.22.345/share","server/share/../test","server:445/share","server/share/a:b","server//share"])assert.throws(()=>parseSmbPath(raw));
        assert.deepStrictEqual(parseSmbUsername("DOMAIN\\user"),{domain:"DOMAIN",username:"user"});
        assert.deepStrictEqual(parseSmbUsername("user"),{domain:"",username:"user"});
        assert.equal(formatSmbUsername({domain:"DOMAIN",username:"user"}),"DOMAIN\\user");
        assert.throws(()=>parseSmbUsername("DOMAIN\\"));assert.throws(()=>parseSmbUsername("a\\b\\c"));
    });
    it("keeps the backend, frontend and package versions in sync", () => {
        const ioPackage = require("../../io-package.json");
        assert.equal(ioPackage.common.version, pkg.version);
        for (const file of ["src/main.ts", "build/main.js"]) {
            assert.equal(fs.readFileSync(path.join(__dirname, "../..", file), "utf8").match(/version:\s*"([^"]+)"/)?.[1], pkg.version, file);
        }
        for (const file of ["web-src/app.js", "web-dist/app.js"]) {
            const content = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
            assert.equal(content.match(/const frontendVersion="([^"]+)"/)?.[1], pkg.version, file);
            assert.ok(content.includes("run-status-filter"), "Missing run filter: " + file);
        }
        for (const file of ["web-src/app.css", "web-dist/app.css"]) {
            const css = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
            assert.ok(css.includes(".run-list tr.run-success") && css.includes(".run-list tr.run-error"), "Missing run status colors: " + file);
        }
    });
});

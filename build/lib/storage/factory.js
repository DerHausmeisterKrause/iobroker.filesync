"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerFor = providerFor;
const local_1 = require("./local");
const smb_1 = require("./smb");
const sftp_1 = require("./sftp");
const access_test_1 = require("./access-test");
function providerFor(l, secrets) { const secret = l.type === "local" ? {} : secrets[l.credentialId] ?? {}; const provider = l.type === "local" ? new local_1.LocalStorageProvider(l) : l.type === "smb" ? new smb_1.SmbStorageProvider(l, secret) : new sftp_1.SftpStorageProvider(l, secret); return (0, access_test_1.withAccessTest)(provider, l.readOnly, Object.values(secret).filter((value) => typeof value === "string" && value.length > 0)); }
//# sourceMappingURL=factory.js.map
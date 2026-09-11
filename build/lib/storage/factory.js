"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerFor = providerFor;
const local_1 = require("./local");
const smb_1 = require("./smb");
const sftp_1 = require("./sftp");
function providerFor(l, secrets) { switch (l.type) {
    case "local": return new local_1.LocalStorageProvider(l);
    case "smb": return new smb_1.SmbStorageProvider(l, secrets[l.credentialId] ?? {});
    case "sftp": return new sftp_1.SftpStorageProvider(l, secrets[l.credentialId] ?? {});
} }
//# sourceMappingURL=factory.js.map
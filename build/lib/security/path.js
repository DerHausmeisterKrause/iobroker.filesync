"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRelative = normalizeRelative;
exports.safeLocalPath = safeLocalPath;
const node_path_1 = __importDefault(require("node:path"));
function normalizeRelative(input) {
    const value = input.replace(/\\/g, "/").replace(/^\/+/, "");
    if (value.includes("\0"))
        throw new Error("Invalid NUL in path");
    const normalized = node_path_1.default.posix.normalize(value);
    if (normalized === ".." || normalized.startsWith("../") || node_path_1.default.posix.isAbsolute(normalized))
        throw new Error("Path traversal denied");
    return normalized === "." ? "" : normalized;
}
function safeLocalPath(base, relative) {
    const root = node_path_1.default.resolve(base);
    const target = node_path_1.default.resolve(root, normalizeRelative(relative));
    const rel = node_path_1.default.relative(root, target);
    if (rel !== "" && (rel === ".." || rel.startsWith(`..${node_path_1.default.sep}`) || node_path_1.default.isAbsolute(rel)))
        throw new Error("Path escapes location root");
    return target;
}
//# sourceMappingURL=path.js.map
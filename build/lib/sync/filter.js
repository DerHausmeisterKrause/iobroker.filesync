"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matches = matches;
exports.changed = changed;
const minimatch_1 = require("minimatch");
function matches(file, filters) { if (file.type !== "file" || /(^|\/)\.[^/]*\.filesync-(?:[^/]+\.tmp|backup-[^/]+|metadata-[^/]+)$/.test(file.path))
    return false; if (filters.minSize !== undefined && file.size < filters.minSize)
    return false; if (filters.maxSize !== undefined && file.size > filters.maxSize)
    return false; const opts = { dot: true, nocase: false, matchBase: true }; return (filters.include.length === 0 || filters.include.some(x => (0, minimatch_1.minimatch)(file.path, x, opts))) && !filters.exclude.some(x => (0, minimatch_1.minimatch)(file.path, x, opts)); }
function changed(a, b) { return !b || a.size !== b.size || Math.floor(a.mtimeMs) !== Math.floor(b.mtimeMs); }
//# sourceMappingURL=filter.js.map
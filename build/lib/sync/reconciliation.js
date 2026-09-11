"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableSince = stableSince;
exports.targetNeedsRepair = targetNeedsRepair;
function stableSince(file, pending, windowMs, now = Date.now()) { return windowMs === 0 || Boolean(pending && pending.size === file.size && pending.mtimeMs === file.mtimeMs && now - pending.observedAt >= windowMs); }
function targetNeedsRepair(source, target) { return !target || source.size !== target.size; }
//# sourceMappingURL=reconciliation.js.map
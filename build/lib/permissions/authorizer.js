"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Authorizer = void 0;
class Authorizer {
    groups;
    constructor(groups) {
        this.groups = groups;
    }
    can(user, permission, resource) { if (user === "system.user.admin")
        return true; return this.groups.some(g => g.users.includes(user) && (g.permissions.includes("admin") || g.permissions.includes(permission)) && (!resource || (resource.type === "job" ? g.jobIds : g.locationIds).includes(resource.id))); }
}
exports.Authorizer = Authorizer;
//# sourceMappingURL=authorizer.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localLinksForWeb = localLinksForWeb;
exports.localLinksEqual = localLinksEqual;
function localLinksForWeb(web, running = true) {
    if (!web.enabled || !running)
        return {};
    return { _default: { name: { en: "Open FileSync", de: "FileSync öffnen" }, link: `${web.secure ? "https" : "http"}://%ip%:${web.port}` } };
}
function localLinksEqual(current, wanted) {
    return JSON.stringify(current ?? {}) === JSON.stringify(wanted);
}
//# sourceMappingURL=local-links.js.map
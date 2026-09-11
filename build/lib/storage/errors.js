"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNotFoundError = isNotFoundError;
/** Return true only for OS/SMB/SFTP values which unambiguously mean "missing". */
function isNotFoundError(error) {
    if (!error || typeof error !== "object")
        return false;
    const { code, errno, status } = error;
    return code === "ENOENT" || code === 2 || errno === -2
        || status === "STATUS_NO_SUCH_FILE" || status === "STATUS_OBJECT_NAME_NOT_FOUND" || status === "STATUS_OBJECT_PATH_NOT_FOUND"
        || code === "STATUS_NO_SUCH_FILE" || code === "STATUS_OBJECT_NAME_NOT_FOUND" || code === "STATUS_OBJECT_PATH_NOT_FOUND";
}
//# sourceMappingURL=errors.js.map
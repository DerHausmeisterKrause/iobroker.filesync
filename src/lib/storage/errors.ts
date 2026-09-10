interface ErrorWithCode { code?:unknown; errno?:unknown; status?:unknown }

/** Return true only for OS/SMB/SFTP values which unambiguously mean "missing". */
export function isNotFoundError(error:unknown):boolean {
 if(!error||typeof error!=="object")return false;
 const {code,errno,status}=error as ErrorWithCode;
 return code==="ENOENT"||code===2||errno===-2
  ||status==="STATUS_NO_SUCH_FILE"||status==="STATUS_OBJECT_NAME_NOT_FOUND"||status==="STATUS_OBJECT_PATH_NOT_FOUND"
  ||code==="STATUS_NO_SUCH_FILE"||code==="STATUS_OBJECT_NAME_NOT_FOUND"||code==="STATUS_OBJECT_PATH_NOT_FOUND";
}

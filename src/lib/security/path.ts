import path from "node:path";
export function normalizeRelative(input:string):string {
 const value=input.replace(/\\/g,"/").replace(/^\/+/,"");
 if (value.includes("\0")) throw new Error("Invalid NUL in path");
 const normalized=path.posix.normalize(value);
 if (normalized===".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) throw new Error("Path traversal denied");
 return normalized==="."?"":normalized;
}
export function safeLocalPath(base:string, relative:string):string {
 const root=path.resolve(base); const target=path.resolve(root,normalizeRelative(relative));
 const rel=path.relative(root,target);
 if (rel!=="" && (rel===".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))) throw new Error("Path escapes location root");
 return target;
}

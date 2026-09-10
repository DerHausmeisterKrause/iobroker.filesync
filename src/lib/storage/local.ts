import { createReadStream,createWriteStream } from "node:fs";
import { access,lstat,mkdir,readdir,realpath,rename,rm,statfs,utimes,writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileMetadata,LocalLocation } from "../types";
import type { StorageProvider } from "./provider";
import { safeLocalPath,normalizeRelative } from "../security/path";
import { isNotFoundError } from "./errors";
export class LocalStorageProvider implements StorageProvider {
 constructor(private readonly location:LocalLocation){}
 normalizePath(p:string):string{return normalizeRelative(p)}
 private resolve(p:string):string{return safeLocalPath(this.location.basePath,p)}
 private async guarded(p:string,allowMissing=false):Promise<string>{ const target=this.resolve(p); const parent=allowMissing?path.dirname(target):target; const actual=await realpath(parent); const root=await realpath(this.location.basePath); if(actual!==root&&!actual.startsWith(`${root}${path.sep}`))throw new Error("Symlink escape denied"); return target; }
 async connect():Promise<void>{await access(this.location.basePath)} async disconnect():Promise<void>{}
 async testConnection(writeTest=false){const started=Date.now();await access(this.location.basePath);if(writeTest&&!this.location.readOnly){const p=this.resolve(`.filesync-test-${process.pid}`);await writeFile(p,"");await rm(p)}return {latencyMs:Date.now()-started,freeBytes:await this.getFreeSpace()}}
 async list(p:string):Promise<FileMetadata[]>{const dir=await this.guarded(p);const rows=await readdir(dir,{withFileTypes:true});const result:FileMetadata[]=[];for(const row of rows){const rel=path.posix.join(this.normalizePath(p),row.name);const s=await lstat(this.resolve(rel));result.push({path:rel,name:row.name,type:s.isSymbolicLink()?"symlink":s.isDirectory()?"directory":"file",size:s.size,mtimeMs:s.mtimeMs})}return result}
 async stat(p:string):Promise<FileMetadata>{const s=await lstat(await this.guarded(p));return {path:this.normalizePath(p),name:path.basename(p),type:s.isSymbolicLink()?"symlink":s.isDirectory()?"directory":"file",size:s.size,mtimeMs:s.mtimeMs}}
 async statOrUndefined(p:string){try{return await this.stat(p)}catch(error){if(isNotFoundError(error))return undefined;throw error}}
 async exists(p:string){return (await this.statOrUndefined(p))!==undefined}
 async mkdir(p:string){if(this.location.readOnly)throw new Error("Location is read-only");await mkdir(this.resolve(p),{recursive:true});await this.guarded(p)}
 async createReadStream(p:string){return createReadStream(await this.guarded(p))}
 async createWriteStream(p:string){if(this.location.readOnly)throw new Error("Location is read-only");return createWriteStream(await this.guarded(p,true),{flags:"wx"})}
 async rename(a:string,b:string){if(this.location.readOnly)throw new Error("Location is read-only");await rename(await this.guarded(a),await this.guarded(b,true))}
 async replace(temp:string,final:string){if(this.location.readOnly)throw new Error("Location is read-only");await rename(await this.guarded(temp),this.resolve(final))}
 async remove(p:string){if(this.location.readOnly)throw new Error("Location is read-only");await rm(await this.guarded(p),{recursive:true})}
 async setMtime(p:string,m:number){const d=new Date(m);await utimes(await this.guarded(p),d,d)}
 async getFreeSpace(){const s=await statfs(await realpath(this.location.basePath));return s.bavail*s.bsize}
}

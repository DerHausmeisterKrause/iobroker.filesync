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
 private async root():Promise<string>{return realpath(this.location.basePath)}
 private inside(root:string,actual:string):boolean{return actual===root||actual.startsWith(`${root}${path.sep}`)}
 private async guarded(p:string,allowMissing=false):Promise<string>{const target=this.resolve(p),root=await this.root();let probe=allowMissing?path.dirname(target):target;for(;;){try{const actual=await realpath(probe);if(!this.inside(root,actual))throw new Error("Symlink escape denied");return target}catch(error){if(!allowMissing||!isNotFoundError(error))throw error;const parent=path.dirname(probe);if(parent===probe)throw error;probe=parent}}}
 private async secureMkdir(p:string):Promise<void>{const relative=this.normalizePath(p),root=await this.root();let current=root;for(const segment of relative.split("/").filter(Boolean)){current=path.join(current,segment);try{const info=await lstat(current);if(info.isSymbolicLink()){const actual=await realpath(current);if(!this.inside(root,actual))throw new Error("Symlink escape denied")}else if(!info.isDirectory())throw new Error(`Not a directory: ${segment}`)}catch(error){if(!isNotFoundError(error))throw error;await mkdir(current);const actual=await realpath(current);if(!this.inside(root,actual))throw new Error("Symlink escape denied")}}}
 async connect():Promise<void>{await access(this.location.basePath)} async disconnect():Promise<void>{}
 async testConnection(writeTest=false){const started=Date.now();await access(this.location.basePath);if(writeTest&&!this.location.readOnly){const p=this.resolve(`.filesync-test-${process.pid}`);await writeFile(p,"");await rm(p)}return {latencyMs:Date.now()-started,freeBytes:await this.getFreeSpace()}}
 async list(p:string):Promise<FileMetadata[]>{const dir=await this.guarded(p);const rows=await readdir(dir,{withFileTypes:true});const result:FileMetadata[]=[];for(const row of rows){const rel=path.posix.join(this.normalizePath(p),row.name);const s=await lstat(this.resolve(rel));result.push({path:rel,name:row.name,type:s.isSymbolicLink()?"symlink":s.isDirectory()?"directory":"file",size:s.size,mtimeMs:s.mtimeMs})}return result}
 async stat(p:string):Promise<FileMetadata>{const s=await lstat(await this.guarded(p));return {path:this.normalizePath(p),name:path.basename(p),type:s.isSymbolicLink()?"symlink":s.isDirectory()?"directory":"file",size:s.size,mtimeMs:s.mtimeMs}}
 async statOrUndefined(p:string){try{return await this.stat(p)}catch(error){if(isNotFoundError(error))return undefined;throw error}}
 async exists(p:string){return (await this.statOrUndefined(p))!==undefined}
 async mkdir(p:string){if(this.location.readOnly)throw new Error("Location is read-only");await this.secureMkdir(p)}
 async createReadStream(p:string){return createReadStream(await this.guarded(p))}
 async createWriteStream(p:string){if(this.location.readOnly)throw new Error("Location is read-only");return createWriteStream(await this.guarded(p,true),{flags:"wx"})}
 async rename(a:string,b:string){if(this.location.readOnly)throw new Error("Location is read-only");await rename(await this.guarded(a),await this.guarded(b,true))}
 async replace(temp:string,final:string){if(this.location.readOnly)throw new Error("Location is read-only");await rename(await this.guarded(temp),await this.guarded(final,true))}
 async remove(p:string){if(this.location.readOnly)throw new Error("Location is read-only");await rm(await this.guarded(p),{recursive:true})}
 async setMtime(p:string,m:number){if(this.location.readOnly)throw new Error("Location is read-only");const d=new Date(m);await utimes(await this.guarded(p),d,d)}
 async getFreeSpace(){const s=await statfs(await realpath(this.location.basePath));return s.bavail*s.bsize}
}

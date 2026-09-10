import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {Readable,Writable} from "node:stream";
import type {FileMetadata,SmbLocation,SecretRecord} from "../types";
import type {StorageProvider} from "./provider";
import {normalizeRelative} from "../security/path";
import {isNotFoundError} from "./errors";

interface RuntimeSmbStat {size:number;mtime:Date;isDirectory():boolean}
export interface SmbClient {disconnect():void;readdir(path:string):Promise<string[]>;stat(path:string):Promise<unknown>;mkdir(path:string):Promise<void>;createReadStream(path:string):Promise<Readable>;createWriteStream(path:string):Promise<Writable>;rename(from:string,to:string):Promise<void>;rmdir(path:string):Promise<void>;unlink(path:string):Promise<void>}
type SmbConstructor=new(options:{share:string;domain:string;username:string;password:string;port:number;autoCloseTimeout:number})=>SmbClient;
const createClient=(options:ConstructorParameters<SmbConstructor>[0]):SmbClient=>{const SMB2=createRequire(__filename)("@marsaud/smb2") as unknown as SmbConstructor;return new SMB2(options)};

/**
 * @marsaud/smb2's runtime stat mapper includes `size` (lib/tools/file-info.js),
 * although 0.18.0's declaration omits it. Keep that discrepancy local and
 * validate the value before exposing it as provider metadata.
 */
function runtimeStat(value:unknown):RuntimeSmbStat {
 if(!value||typeof value!=="object"||!("size" in value)||typeof value.size!=="number"
  ||!("mtime" in value)||!(value.mtime instanceof Date)||!("isDirectory" in value)
  ||typeof value.isDirectory!=="function")throw new Error("SMB returned malformed file metadata");
 return value as RuntimeSmbStat;
}

export class SmbStorageProvider implements StorageProvider {
 private client?:SmbClient;
 constructor(private readonly l:SmbLocation,private readonly secret:SecretRecord,private readonly factory=createClient){}
 normalizePath(p:string){return normalizeRelative(p)}
 private p(p:string){return path.posix.join(normalizeRelative(this.l.basePath),normalizeRelative(p)).replace(/\//g,"\\")}
 async connect(){
  if(!this.secret.password)throw new Error("SMB password unavailable");
  this.client=this.factory({share:`\\\\${this.l.host}\\${this.l.share}`,domain:this.l.domain??"",username:this.l.username,password:this.secret.password,port:this.l.port,autoCloseTimeout:this.l.timeoutMs});
 }
 async disconnect(){this.client?.disconnect();this.client=undefined}
 private c(){if(!this.client)throw new Error("SMB not connected");return this.client}
 async testConnection(){const t=Date.now();await this.list("");return{latencyMs:Date.now()-t}}
 async list(p:string):Promise<FileMetadata[]>{
  // Without `stats: true`, 0.18 returns names, not Dirent-like objects.
  const names=await this.c().readdir(this.p(p));
  return Promise.all(names.map(name=>this.stat(path.posix.join(this.normalizePath(p),name))));
 }
 async stat(p:string):Promise<FileMetadata>{
  const s=runtimeStat(await this.c().stat(this.p(p)));
  return{path:this.normalizePath(p),name:path.posix.basename(p),type:s.isDirectory()?"directory":"file",size:s.size,mtimeMs:s.mtime.getTime()};
 }
 async statOrUndefined(p:string){try{return await this.stat(p)}catch(error){if(isNotFoundError(error))return undefined;throw error}}
 async exists(p:string){return (await this.statOrUndefined(p))!==undefined}
 async mkdir(p:string){
  if(this.l.readOnly)throw new Error("Location is read-only");
  const parts=this.normalizePath(p).split("/").filter(Boolean);let current="";
  for(const part of parts){current=path.posix.join(current,part);if(!await this.exists(current))await this.c().mkdir(this.p(current))}
 }
 async createReadStream(p:string):Promise<Readable>{return await this.c().createReadStream(this.p(p))}
 async createWriteStream(p:string):Promise<Writable>{if(this.l.readOnly)throw new Error("Location is read-only");return await this.c().createWriteStream(this.p(p))}
 async rename(a:string,b:string){if(this.l.readOnly)throw new Error("Location is read-only");await this.c().rename(this.p(a),this.p(b))}
 async replace(temp:string,final:string){if(this.l.readOnly)throw new Error("Location is read-only");const backup=path.posix.join(path.posix.dirname(final),`.${path.posix.basename(final)}.filesync-backup-${randomUUID()}`);const existed=await this.exists(final);if(existed)await this.rename(final,backup);try{await this.rename(temp,final);if(existed)await this.remove(backup)}catch(error){if(existed&&await this.exists(backup))await this.rename(backup,final);throw error}}
 async remove(p:string){if(this.l.readOnly)throw new Error("Location is read-only");const s=await this.stat(p);if(s.type==="directory")await this.c().rmdir(this.p(p));else await this.c().unlink(this.p(p))}
}

import { createRequire } from "node:module";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import type { FileMetadata, SecretRecord, SftpLocation } from "../types";
import type { StorageProvider } from "./provider";
import { normalizeRelative } from "../security/path";
import { isNotFoundError } from "./errors";

interface SftpEntry { name:string; type:string; size:number; modifyTime:number }
interface SftpStat { isDirectory:boolean; size:number; modifyTime:number }
interface SftpApi {
 connect(options:Record<string,unknown>):Promise<void>; end():Promise<void>;
 list(path:string):Promise<SftpEntry[]>; stat(path:string):Promise<SftpStat>; realPath(path:string):Promise<string>;
 mkdir(path:string,recursive:boolean):Promise<void>; createReadStream(path:string):Readable; createWriteStream(path:string):Writable;
 rename(a:string,b:string):Promise<void>; rmdir(path:string,recursive:boolean):Promise<void>; delete(path:string):Promise<void>;
 utimes(path:string,atime:number,mtime:number):Promise<void>;
}
type SftpConstructor=new()=>SftpApi;
const SftpClient=createRequire(__filename)("ssh2-sftp-client") as unknown as SftpConstructor;

export class SftpStorageProvider implements StorageProvider {
 private c:SftpApi=new SftpClient(); private realRoot?:string;
 constructor(private readonly l:SftpLocation,private readonly secret:SecretRecord){}
 normalizePath(p:string){return normalizeRelative(p)}
 private p(p:string){return path.posix.join(this.l.basePath,"/",normalizeRelative(p))}
 private writable(){if(this.l.readOnly)throw new Error("Location is read-only")}
 private inside(actual:string){if(!this.realRoot||(actual!==this.realRoot&&!actual.startsWith(`${this.realRoot}/`)))throw new Error("SFTP symlink escape denied")}
 private async guard(p:string,allowMissing=false){let probe=this.p(p);for(;;){try{this.inside(await this.c.realPath(probe));return}catch(error){if(!allowMissing||!isNotFoundError(error))throw error;const parent=path.posix.dirname(probe);if(parent===probe)throw error;probe=parent}}}
 async connect(){if(!this.l.allowInsecureHostKey&&!this.l.hostFingerprint)throw new Error("SFTP host fingerprint is required");const expected=this.l.hostFingerprint.replace(/^SHA256:/,"");await this.c.connect({host:this.l.host,port:this.l.port,username:this.l.username,password:this.l.auth==="password"?this.secret.password:undefined,privateKey:this.l.auth==="privateKey"?this.secret.privateKey:undefined,passphrase:this.secret.passphrase,readyTimeout:this.l.timeoutMs,hostVerifier:this.l.allowInsecureHostKey?()=>true:(key:Buffer)=>{const actual=createHash("sha256").update(key).digest("base64").replace(/=+$/,"");const a=Buffer.from(actual),e=Buffer.from(expected.replace(/=+$/,"") );return a.length===e.length&&timingSafeEqual(a,e)}});this.realRoot=await this.c.realPath(this.l.basePath)}
 async disconnect(){this.realRoot=undefined;await this.c.end()}
 async testConnection(){const t=Date.now();await this.list("");return{latencyMs:Date.now()-t}}
 async list(p:string):Promise<FileMetadata[]>{await this.guard(p);return(await this.c.list(this.p(p))).map((x:SftpEntry)=>({path:path.posix.join(this.normalizePath(p),x.name),name:x.name,type:x.type==="d"?"directory":x.type==="l"?"symlink":"file",size:x.size,mtimeMs:x.modifyTime}))}
 async stat(p:string){await this.guard(p);const s=await this.c.stat(this.p(p));return{path:this.normalizePath(p),name:path.posix.basename(p),type:s.isDirectory?"directory":"file",size:s.size,mtimeMs:s.modifyTime} as FileMetadata}
 async statOrUndefined(p:string){try{return await this.stat(p)}catch(error){if(isNotFoundError(error))return undefined;throw error}}
 async exists(p:string){return(await this.statOrUndefined(p))!==undefined}
 async mkdir(p:string){this.writable();await this.guard(p,true);await this.c.mkdir(this.p(p),true);await this.guard(p)}
 async createReadStream(p:string){await this.guard(p);return this.c.createReadStream(this.p(p))}
 async createWriteStream(p:string){this.writable();await this.guard(p,true);return this.c.createWriteStream(this.p(p))}
 async rename(a:string,b:string){this.writable();await this.guard(a);await this.guard(b,true);await this.c.rename(this.p(a),this.p(b))}
 async replace(temp:string,final:string){this.writable();const backup=`${final}.filesync-backup`,existed=await this.exists(final);if(existed)await this.rename(final,backup);try{await this.rename(temp,final);if(existed)await this.remove(backup)}catch(error){if(existed&&await this.exists(backup))await this.rename(backup,final);throw error}}
 async remove(p:string){this.writable();await this.guard(p);const s=await this.stat(p);if(s.type==="directory")await this.c.rmdir(this.p(p),true);else await this.c.delete(this.p(p))}
 async setMtime(p:string,m:number){this.writable();await this.guard(p);await this.c.utimes(this.p(p),m/1000,m/1000)}
}

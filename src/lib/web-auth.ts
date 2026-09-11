import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { ScryptPassword, WebUser } from "./types";
const scrypt=(password:string,salt:Buffer,keyLength:number,options:{N:number;r:number;p:number;maxmem:number})=>new Promise<Buffer>((resolve,reject)=>scryptCallback(password,salt,keyLength,options,(error,key)=>error?reject(error):resolve(key)));
const PARAMS={N:16384,r:8,p:1,keyLength:32} as const;
export async function hashPassword(password:string):Promise<ScryptPassword>{
 if(password.length<8||password.length>1024)throw new Error("Password must contain between 8 and 1024 characters");
 const salt=randomBytes(32);const hash=await scrypt(password,salt,PARAMS.keyLength,{N:PARAMS.N,r:PARAMS.r,p:PARAMS.p,maxmem:64*1024*1024}) as Buffer;
 return{algorithm:"scrypt",salt:salt.toString("base64"),hash:hash.toString("base64"),params:{...PARAMS}};
}
export async function verifyPassword(password:string,record:ScryptPassword|undefined):Promise<boolean>{
 if(!record||record.algorithm!=="scrypt")return false;
 try{const expected=Buffer.from(record.hash,"base64"),actual=await scrypt(password,Buffer.from(record.salt,"base64"),record.params.keyLength,{N:record.params.N,r:record.params.r,p:record.params.p,maxmem:128*1024*1024}) as Buffer;return expected.length===actual.length&&timingSafeEqual(expected,actual)}catch{return false}
}
export interface Session { id:string;csrf:string;userId:string;expiresAt:number }
export class SessionStore{
 private sessions=new Map<string,Session>();private cleanupTimer:NodeJS.Timeout;
 constructor(private ttlMinutes:number){this.cleanupTimer=setInterval(()=>this.cleanup(),60_000);this.cleanupTimer.unref()}
 create(userId:string){const session={id:randomBytes(32).toString("base64url"),csrf:randomBytes(32).toString("base64url"),userId,expiresAt:Date.now()+this.ttlMinutes*60_000};this.sessions.set(session.id,session);return session}
 get(id:string|undefined){if(!id)return;const value=this.sessions.get(id);if(!value||value.expiresAt<=Date.now()){if(value)this.sessions.delete(id);return}return value}
 delete(id:string|undefined){if(id)this.sessions.delete(id)} cleanup(){const now=Date.now();for(const [id,s]of this.sessions)if(s.expiresAt<=now)this.sessions.delete(id)} close(){clearInterval(this.cleanupTimer);this.sessions.clear()} get size(){this.cleanup();return this.sessions.size}
}
export function safeUser(user:WebUser,groups:{id:string;name:string;enabled:boolean}[]){return{id:user.id,username:user.username,displayName:user.displayName,admin:user.admin,groups:groups.filter(g=>g.enabled&&(user.admin||user.groupIds.includes(g.id))).map(({id,name})=>({id,name}))}}

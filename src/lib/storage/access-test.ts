import {randomUUID} from "node:crypto";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import type {StorageProvider} from "./provider";
import {redact} from "../security/redact";

type Step = "list" | "write" | "read" | "rename" | "delete";
type Check = {step:Step;status:"ok"|"error"|"skipped";message?:string};
export interface AccessReport { latencyMs:number; checks:Check[]; readOnly:boolean; ok:boolean; cleanupError?:string; }

/** An opt-in write probe; normal health checks remain read-only. */
export async function testAccess(provider:StorageProvider,readOnly:boolean,secrets:string[]=[]):Promise<AccessReport>{
 const started=Date.now(),checks:Check[]=[];
 const report:AccessReport={latencyMs:0,checks,readOnly,ok:false};
 const steps:Step[]=["list","write","read","rename","delete"];
 const id=randomUUID(),temporary=`.access.filesync-${id}.tmp`,renamed=`.access-renamed.filesync-${id}.tmp`;
 const payload=Buffer.from("FileSync access probe\n");
 let cleanupPath:string|undefined;
 const safe=(error:unknown)=>String(redact(error,secrets));
 const check=async(step:Step,operation:()=>Promise<void>)=>{try{await operation();checks.push({step,status:"ok"});return true}catch(error){checks.push({step,status:"error",message:safe(error)});return false}};
 try{
  if(!await check("list",async()=>{await provider.list("")}))return report;
  if(readOnly)return report;
  if(!await check("write",async()=>{
   if(await provider.statOrUndefined(temporary)||await provider.statOrUndefined(renamed))throw new Error("Probe path already exists");
   const stream=await provider.createWriteStream(temporary);
   cleanupPath=temporary;
   try{await pipeline(Readable.from([payload]),stream)}catch(error){if((error as NodeJS.ErrnoException)?.code==="EEXIST")cleanupPath=undefined;throw error}
  }))return report;
  if(!await check("read",async()=>{
   const parts:Buffer[]=[];let length=0;
   for await(const chunk of await provider.createReadStream(temporary)){const data=Buffer.from(chunk);length+=data.length;if(length>payload.length)throw new Error("Probe contents differ");parts.push(data)}
   if(!Buffer.concat(parts).equals(payload))throw new Error("Probe contents differ");
  }))return report;
  if(!await check("rename",async()=>{if(await provider.statOrUndefined(renamed))throw new Error("Probe destination already exists");await provider.rename(temporary,renamed);cleanupPath=renamed}))return report;
  await check("delete",async()=>{await provider.remove(renamed);cleanupPath=undefined});
  return report;
 }finally{
  if(cleanupPath){try{const info=await provider.statOrUndefined(cleanupPath);if(info){if(info.type!=="file")throw new Error("Probe path is no longer a file");await provider.remove(cleanupPath)}}catch(error){report.cleanupError=`${cleanupPath}: ${safe(error)}`}}
  for(const step of steps)if(!checks.some(c=>c.step===step))checks.push({step,status:"skipped"});
  report.ok=!report.cleanupError&&checks.every(c=>c.status==="ok"||(readOnly&&c.status==="skipped"));
  report.latencyMs=Date.now()-started;
 }
}

export function withAccessTest(provider:StorageProvider,readOnly:boolean,secrets:string[]):StorageProvider{
 const original=provider.testConnection.bind(provider);
 provider.testConnection=(writeTest=false)=>writeTest?testAccess(provider,readOnly,secrets):original(false);
 return provider;
}

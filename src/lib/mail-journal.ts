import {mkdir,readFile,rename,writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
export type DeliveryStatus="pending"|"accepted"|"error";
export type DeliveryResult="accepted"|"error"|"limited"|"disabled"|"missing";
export interface DeliveryEntry {id:string;at:number;event:string;to:string;status:DeliveryStatus}
interface UserJournal {history:DeliveryEntry[];digestKeys:Record<string,string>}

export class DeliveryJournal{
 private readonly file:string;
 private users=new Map<string,UserJournal>();
 private queue=Promise.resolve();
 private readonly warn:()=>void;
 private healthy=true;
 constructor(root:string,warn:()=>void){this.file=path.join(root,"notification-history.json");this.warn=warn}
 async load(){try{const data:unknown=JSON.parse(await readFile(this.file,"utf8"));if(!Array.isArray(data))throw new Error("Invalid mail journal");for(const row of data){if(!Array.isArray(row)||typeof row[0]!=="string"||!row[1]||!Array.isArray(row[1].history)||!row[1].digestKeys)throw new Error("Invalid mail journal");const value=row[1] as UserJournal;this.users.set(row[0],{history:value.history.slice(-100),digestKeys:value.digestKeys})}}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT"){this.healthy=false;this.warn()}}}
 history(userId:string){return [...(this.users.get(userId)?.history??[])].reverse()}
 private mutate<T>(operation:(next:Map<string,UserJournal>)=>T){
  const pending=this.queue.then(async()=>{if(!this.healthy)throw new Error("Mail history unavailable");const next=new Map([...this.users].map(([id,value])=>[id,{history:value.history.map(entry=>({...entry})),digestKeys:{...value.digestKeys}}] as const));const result=operation(next);await mkdir(path.dirname(this.file),{recursive:true});await writeFile(this.file+".tmp",JSON.stringify([...next]),{mode:0o600});await rename(this.file+".tmp",this.file);this.users=next;return result});
  this.queue=pending.then(()=>undefined,()=>undefined);return pending;
 }
 async deliver(userId:string,event:string,to:string,send:()=>Promise<void>,digest?:{kind:string;key:string}):Promise<DeliveryResult>{
  const now=Date.now(),id=randomUUID();
  const reserved=await this.mutate(next=>{const user=next.get(userId)??{history:[],digestKeys:{}};const recent=user.history.filter(entry=>now-entry.at<3600000);if(recent.length>=10)return false;if(event==="Testmail"&&recent.some(entry=>entry.event===event&&now-entry.at<300000))return false;if(digest&&user.digestKeys[digest.kind]===digest.key)return false;if(digest)user.digestKeys[digest.kind]=digest.key;user.history.push({id,at:now,event,to,status:"pending"});user.history=user.history.slice(-100);next.set(userId,user);return true});
  if(!reserved)return "limited";
  let status:"accepted"|"error"="accepted";try{await send()}catch{status="error";this.warn()}
  try{await this.mutate(next=>{const entry=next.get(userId)?.history.find(item=>item.id===id);if(entry)entry.status=status})}catch{this.warn()}
  return status;
 }
}

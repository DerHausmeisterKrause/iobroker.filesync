"use strict";
const {mkdir,readFile,rename,writeFile}=require("node:fs/promises");
const path=require("node:path");
const {randomUUID}=require("node:crypto");

class DeliveryJournal{
 file;
 users=new Map();
 queue=Promise.resolve();
 warn;
 healthy=true;
 constructor(root,warn){this.file=path.join(root,"notification-history.json");this.warn=warn}
 async load(){try{const data=JSON.parse(await readFile(this.file,"utf8"));if(!Array.isArray(data))throw new Error("Invalid mail journal");for(const row of data){if(!Array.isArray(row)||typeof row[0]!=="string"||!row[1]||!Array.isArray(row[1].history)||!row[1].digestKeys)throw new Error("Invalid mail journal");const value=row[1];this.users.set(row[0],{history:value.history.slice(-100),digestKeys:value.digestKeys})}}catch(error){if((error).code!=="ENOENT"){this.healthy=false;this.warn()}}}
 history(userId){return [...(this.users.get(userId)?.history??[])].reverse()}
 mutate(operation){
  const pending=this.queue.then(async()=>{if(!this.healthy)throw new Error("Mail history unavailable");const next=new Map([...this.users].map(([id,value])=>[id,{history:value.history.map(entry=>({...entry})),digestKeys:{...value.digestKeys}}]));const result=operation(next);await mkdir(path.dirname(this.file),{recursive:true});await writeFile(this.file+".tmp",JSON.stringify([...next]),{mode:0o600});await rename(this.file+".tmp",this.file);this.users=next;return result});
  this.queue=pending.then(()=>undefined,()=>undefined);return pending;
 }
 async deliver(userId,event,to,send,digest){
  const now=Date.now(),id=randomUUID();
  const reserved=await this.mutate(next=>{const user=next.get(userId)??{history:[],digestKeys:{}};const recent=user.history.filter(entry=>now-entry.at<3600000);if(recent.length>=10)return false;if(event==="Testmail"&&recent.some(entry=>entry.event===event&&now-entry.at<300000))return false;if(digest&&user.digestKeys[digest.kind]===digest.key)return false;if(digest)user.digestKeys[digest.kind]=digest.key;user.history.push({id,at:now,event,to,status:"pending"});user.history=user.history.slice(-100);next.set(userId,user);return true});
  if(!reserved)return "limited";
  let status="accepted";try{await send()}catch{status="error";this.warn()}
  try{await this.mutate(next=>{const entry=next.get(userId)?.history.find(item=>item.id===id);if(entry)entry.status=status})}catch{this.warn()}
  return status;
 }
}
module.exports={DeliveryJournal};

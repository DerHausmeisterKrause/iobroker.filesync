"use strict";
const {mkdir,readFile,rename,writeFile}=require("node:fs/promises");
const path=require("node:path");
function canNotify(user,job,cfg){return user.enabled&&(user.admin||job.groupIds.some(id=>user.groupIds.includes(id)&&cfg.webGroups.some(g=>g.id===id&&g.enabled)))}
function defaults(){return {email:"",failures:false,successes:false,recovery:false,allJobs:false,jobIds:[],cooldownMinutes:60}}
function parsePreferences(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid notification settings");
 const v=raw;
 const email=typeof v.email==="string"?v.email.trim():"";
 if(email&&(email.length>254||!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email)))throw new Error("Invalid email address");
 if(!Array.isArray(v.jobIds)||v.jobIds.length>500||v.jobIds.some(id=>typeof id!=="string"||id.length>128))throw new Error("Invalid job selection");
 const cooldown=Number(v.cooldownMinutes);
 if(!Number.isInteger(cooldown)||cooldown<5||cooldown>1440)throw new Error("Cooldown must be 5 to 1440 minutes");
 const pref={email,failures:v.failures===true,successes:v.successes===true,recovery:v.recovery===true,allJobs:v.allJobs===true,jobIds:[...new Set(v.jobIds)],cooldownMinutes:cooldown};
 if((pref.failures||pref.successes||pref.recovery)&&!email)throw new Error("Email required");
 return pref;
}
class NotificationService {
 file;
 prefs=new Map();
 queue=Promise.resolve();
 sent=new Map();
 hourly=new Map();
 config;
 send;
 warn;
 constructor(root,config,send,warn){this.file=path.join(root,"notification-preferences.json");this.config=config;this.send=send;this.warn=warn}
 async load(){
  try{const data=JSON.parse(await readFile(this.file,"utf8"));if(!Array.isArray(data))throw new Error("Invalid preferences store");for(const row of data){if(Array.isArray(row)&&typeof row[0]==="string"){try{this.prefs.set(row[0],parsePreferences(row[1]))}catch{this.warn()}}}}catch(error){if((error).code!=="ENOENT")this.warn()}
 }
 get(userId){return this.prefs.get(userId)??defaults()}
 save(userId,pref){
  const operation=this.queue.then(async()=>{const next=new Map(this.prefs);next.set(userId,pref);await mkdir(path.dirname(this.file),{recursive:true});await writeFile(this.file+".tmp",JSON.stringify([...next]),{mode:0o600});await rename(this.file+".tmp",this.file);this.prefs=next;return pref});
  this.queue=operation.then(()=>undefined,()=>undefined);return operation;
 }
 async notify(jobId,runId,success,wasFailed){
  const cfg=this.config(),instance=cfg.emailInstance??"";
  if(cfg.emailEnabled!==true||!/^email\.\d+$/.test(instance))return;
  const job=cfg.jobs.find(j=>j.id===jobId);if(!job)return;
  const now=Date.now();
  for(const [key,time] of this.sent)if(now-time>86400000)this.sent.delete(key);
  for(const user of cfg.webUsers){
   const pref=this.prefs.get(user.id);if(!pref?.email||!canNotify(user,job,cfg)||(!pref.allJobs&&!pref.jobIds.includes(jobId)))continue;
   const event=!success?(pref.failures?"Fehler":""):wasFailed&&pref.recovery?"Wieder erfolgreich":pref.successes?"Erfolgreich":"";
   if(!event)continue;
   const key=JSON.stringify([user.id,jobId,event]),last=this.sent.get(key);
   if(last!==undefined&&now-last<pref.cooldownMinutes*60000)continue;
   const recent=(this.hourly.get(user.id)??[]).filter(t=>now-t<3600000);if(recent.length>=10)continue;
   this.sent.set(key,now);this.hourly.set(user.id,[...recent,now]);
   const mail={to:pref.email,subject:"FileSync: "+event,text:["Status: "+event,"Job: "+job.name,"Run-ID: "+runId,"Zeit: "+new Date(now).toISOString(),"Details finden Sie in der FileSync-Weboberfläche."].join("\n")};
   try{await this.send(instance,mail)}catch{this.warn()}
  }
 }
}
module.exports={NotificationService,parsePreferences,canNotify,defaults};

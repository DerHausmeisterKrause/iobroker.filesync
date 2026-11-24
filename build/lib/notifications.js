"use strict";
const {mkdir,readFile,rename,writeFile}=require("node:fs/promises");
const path=require("node:path");
const {DeliveryJournal}=require("./mail-journal");
function canNotify(user,job,cfg){return user.enabled&&(user.admin||job.groupIds.some(id=>user.groupIds.includes(id)&&cfg.webGroups.some(g=>g.id===id&&g.enabled)))}
function defaults(){return {email:"",failures:false,successes:false,recovery:false,allJobs:false,jobIds:[],cooldownMinutes:60,warnings:false,digest:"off"}}
function parsePreferences(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Invalid notification settings");
 const v=raw;
 const email=typeof v.email==="string"?v.email.trim():"";
 if(email&&(email.length>254||!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email)))throw new Error("Invalid email address");
 if(!Array.isArray(v.jobIds)||v.jobIds.length>500||v.jobIds.some(id=>typeof id!=="string"||id.length>128))throw new Error("Invalid job selection");
 const cooldown=Number(v.cooldownMinutes);
 if(!Number.isInteger(cooldown)||cooldown<5||cooldown>1440)throw new Error("Cooldown must be 5 to 1440 minutes");
 const pref={email,failures:v.failures===true,successes:v.successes===true,recovery:v.recovery===true,allJobs:v.allJobs===true,jobIds:[...new Set(v.jobIds)],cooldownMinutes:cooldown,warnings:v.warnings===true,digest:v.digest==="daily"||v.digest==="weekly"?v.digest:"off"};
 if((pref.failures||pref.successes||pref.recovery||pref.warnings||pref.digest!=="off")&&!email)throw new Error("Email required");
 return pref;
}
class NotificationService {
 file;
 prefs=new Map();
 queue=Promise.resolve();
 sent=new Map();
 journal;
 digestRunning=false;
 config;
 send;
 warn;
 constructor(root,config,send,warn){this.file=path.join(root,"notification-preferences.json");this.config=config;this.send=send;this.warn=warn;this.journal=new DeliveryJournal(root,warn)}
 async load(){
  await this.journal.load();
  try{const data=JSON.parse(await readFile(this.file,"utf8"));if(!Array.isArray(data))throw new Error("Invalid preferences store");for(const row of data){if(Array.isArray(row)&&typeof row[0]==="string"){try{this.prefs.set(row[0],parsePreferences(row[1]))}catch{this.warn()}}}}catch(error){if((error).code!=="ENOENT")this.warn()}
 }
 get(userId){return this.prefs.get(userId)??defaults()}
 save(userId,pref){
  const operation=this.queue.then(async()=>{const next=new Map(this.prefs);next.set(userId,pref);await mkdir(path.dirname(this.file),{recursive:true});await writeFile(this.file+".tmp",JSON.stringify([...next]),{mode:0o600});await rename(this.file+".tmp",this.file);this.prefs=next;return pref});
  this.queue=operation.then(()=>undefined,()=>undefined);return operation;
 }

 history(userId){return this.journal.history(userId)}
 async testMail(userId){
  const cfg=this.config(),pref=this.prefs.get(userId),instance=cfg.emailInstance??"";
  if(cfg.emailEnabled!==true||!/^email\.\d+$/.test(instance)||!cfg.webUsers.some(u=>u.id===userId&&u.enabled))return "disabled";
  if(!pref?.email)return "missing";
  const mail={to:pref.email,subject:"FileSync: Testmail",text:"Der E-Mail-Versand von FileSync wurde getestet. Es handelt sich nicht um eine Job-Benachrichtigung."};
  return this.journal.deliver(userId,"Testmail",mail.to,()=>this.send(instance,mail));
 }
 async digest(runs,now=new Date()){
  if(this.digestRunning)return;this.digestRunning=true;try{
  const cfg=this.config(),instance=cfg.emailInstance??"";
  if(cfg.emailEnabled!==true||!/^email\.\d+$/.test(instance)||now.getHours()<8)return;
  for(const user of cfg.webUsers){
   const pref=this.prefs.get(user.id);if(!user.enabled||!pref?.email||pref.digest==="off")continue;
   const end=new Date(now);end.setHours(0,0,0,0);
   if(pref.digest==="weekly")end.setDate(end.getDate()-((end.getDay()+6)%7));
   const start=new Date(end);start.setDate(start.getDate()-(pref.digest==="weekly"?7:1));
   const key=end.toISOString(),kind=pref.digest;
   if(this.journal.hasDigest(user.id,kind,key))continue;
   const allowed=new Set(cfg.jobs.filter(job=>canNotify(user,job,cfg)&&(pref.allJobs||pref.jobIds.includes(job.id))).map(job=>job.id));
   if(!allowed.size)continue;
   const selected=runs.filter(run=>!run.dryRun&&allowed.has(run.jobId)&&run.finishedAt!==undefined&&run.finishedAt>=start.getTime()&&run.finishedAt<end.getTime());
   const counts=["success","error","cancelled"].map(status=>selected.filter(run=>run.status===status).length);
   const event=kind==="daily"?"Tagesbericht":"Wochenbericht";
   const mail={to:pref.email,subject:"FileSync: "+event,text:[event,"Zeitraum (Serverzeit): "+start.toLocaleDateString("de-DE")+" bis "+end.toLocaleDateString("de-DE")+" (exklusiv)","Erfolgreich: "+counts[0],"Fehlgeschlagen: "+counts[1],"Abgebrochen: "+counts[2],"Auswertung der letzten maximal 500 gespeicherten Runs; ältere Runs können fehlen. Vorschauen sind ausgeschlossen."].join("\n")};
   try{await this.journal.deliver(user.id,event,mail.to,()=>this.send(instance,mail),{kind,key})}catch{this.warn()}
  }
  }finally{this.digestRunning=false}
 }
 async notify(jobId,runId,success,wasFailed,warning=false){
  const cfg=this.config(),instance=cfg.emailInstance??"";
  if(cfg.emailEnabled!==true||!/^email\.\d+$/.test(instance))return;
  const job=cfg.jobs.find(j=>j.id===jobId);if(!job)return;
  const now=Date.now();
  for(const [key,time] of this.sent)if(now-time>86400000)this.sent.delete(key);
  for(const user of cfg.webUsers){
   const pref=this.prefs.get(user.id);if(!pref?.email||!canNotify(user,job,cfg)||(!pref.allJobs&&!pref.jobIds.includes(jobId)))continue;
   const event=!success?(pref.failures?"Fehler":""):wasFailed&&pref.recovery?"Wieder erfolgreich":warning&&pref.warnings?"Warnung":pref.successes?"Erfolgreich":"";
   if(!event)continue;
   const key=JSON.stringify([user.id,jobId,event]),last=this.sent.get(key);
   if(last!==undefined&&now-last<pref.cooldownMinutes*60000)continue;
   this.sent.set(key,now);
   const mail={to:pref.email,subject:"FileSync: "+event,text:["Status: "+event,"Job: "+job.name,"Run-ID: "+runId,"Zeit: "+new Date(now).toISOString(),...(event==="Warnung"?["Die Liste der Dateiaktionen wurde gekürzt."]:[]),"Details finden Sie in der FileSync-Weboberfläche."].join("\n")};
   try{const status=await this.journal.deliver(user.id,event,mail.to,()=>this.send(instance,mail));if(status==="limited")this.sent.delete(key)}catch{this.warn()}
  }
 }
}
module.exports={NotificationService,parsePreferences,canNotify,defaults};

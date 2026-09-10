import path from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export type RunSource = "manual" | "preview" | "schedule" | "change" | "state" | "reconciliation";
export type RunStatus = "queued" | "running" | "success" | "error" | "cancelled";
export interface RunRecord {
 runId:string; jobId:string; source:RunSource; dryRun:boolean; status:RunStatus;
 queuedAt:number; startedAt?:number; finishedAt?:number; summary?:unknown; redactedError?:string;
}
export interface RunItems { runId:string; items:Array<{path:string;action:string}>; total:number }
interface Invocation {record:RunRecord; execute:(runId:string)=>Promise<{summary?:unknown;items?:RunItems["items"];total?:number}>}

/** Serializes invocations per job and owns their complete, persistent lifecycle. */
export class RunManager {
 private readonly runs=new Map<string,RunRecord>(); private readonly queues=new Map<string,Invocation[]>();
 private readonly active=new Map<string,Promise<void>>(); private readonly details=new Map<string,RunItems>();
 private stopping=false; private saveChain=Promise.resolve();
 constructor(private readonly root:string,private readonly redact:(error:unknown)=>string,private readonly retention=500,private readonly detailRetention=20){}
 async load(){await mkdir(this.root,{recursive:true});try{const data=JSON.parse(await readFile(path.join(this.root,"runs.json"),"utf8")) as RunRecord[];for(const record of data.slice(-this.retention))this.runs.set(record.runId,record)}catch{/* first start or damaged history */}try{const data=JSON.parse(await readFile(path.join(this.root,"run-items.json"),"utf8")) as RunItems[];for(const item of data.slice(-this.detailRetention))this.details.set(item.runId,item)}catch{/* optional detail history */}}
 enqueue(jobId:string,source:RunSource,dryRun:boolean,execute:Invocation["execute"]){if(this.stopping)throw new Error("Adapter is stopping");const record:RunRecord={runId:randomUUID(),jobId,source,dryRun,status:"queued",queuedAt:Date.now()};this.runs.set(record.runId,record);this.trim();const queue=this.queues.get(jobId)??[],queued=queue.length>0||this.active.has(jobId);queue.push({record,execute});this.queues.set(jobId,queue);void this.persist();this.pump(jobId);return{accepted:true,runId:record.runId,queued,dryRun}}
 private pump(jobId:string){if(this.stopping||this.active.has(jobId))return;const invocation=this.queues.get(jobId)?.shift();if(!invocation)return;const promise=this.perform(invocation).finally(()=>{this.active.delete(jobId);this.pump(jobId)});this.active.set(jobId,promise)}
 private async perform(invocation:Invocation){const {record}=invocation;if(this.stopping){this.finish(record,"cancelled");return}record.status="running";record.startedAt=Date.now();await this.persist();try{const result=await invocation.execute(record.runId);record.summary=result.summary;if(record.dryRun&&result.items){this.details.set(record.runId,{runId:record.runId,items:result.items,total:result.total??result.items.length});this.trimDetails()}this.finish(record,"success")}catch(error){record.redactedError=this.redact(error);this.finish(record,"error")}await this.persist()}
 private finish(record:RunRecord,status:RunStatus){record.status=status;record.finishedAt=Date.now()}
 get(id:string){return this.runs.get(id)??null} history(limit=100){return [...this.runs.values()].sort((a,b)=>b.queuedAt-a.queuedAt).slice(0,Math.min(500,Math.max(1,limit)))}
 getItems(id:string,offset=0,limit=200){const detail=this.details.get(id);const safeOffset=Math.max(0,offset),safeLimit=Math.min(500,Math.max(1,limit));const items=detail?.items??[];return{total:detail?.total??0,offset:safeOffset,limit:safeLimit,items:items.slice(safeOffset,safeOffset+safeLimit)}}
 private trim(){while(this.runs.size>this.retention){const oldest=this.runs.keys().next().value as string|undefined;if(!oldest)break;this.runs.delete(oldest)}}
 private trimDetails(){while(this.details.size>this.detailRetention){const oldest=this.details.keys().next().value as string|undefined;if(!oldest)break;this.details.delete(oldest)}}
 private persist(){this.saveChain=this.saveChain.then(async()=>{await mkdir(this.root,{recursive:true});await this.atomic("runs.json",[...this.runs.values()]);await this.atomic("run-items.json",[...this.details.values()])}).catch(()=>undefined);return this.saveChain}
 private async atomic(name:string,data:unknown){const file=path.join(this.root,name),temp=`${file}.${process.pid}.tmp`;await writeFile(temp,JSON.stringify(data),{mode:0o600});await rename(temp,file)}
 async shutdown(timeoutMs=30000){this.stopping=true;for(const queue of this.queues.values())for(const invocation of queue)this.finish(invocation.record,"cancelled");this.queues.clear();await this.persist();const active=Promise.allSettled(this.active.values());await Promise.race([active,new Promise(resolve=>setTimeout(resolve,timeoutMs))]);await this.saveChain}
 get activeCount(){return this.active.size} get retainedCount(){return this.runs.size}
}

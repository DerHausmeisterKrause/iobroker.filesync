import path from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {pipeline} from "node:stream/promises";
import {Transform} from "node:stream";
import {runContext,type RunProgress} from "../runs/manager";
import type {Job,FileMetadata,TransferResult} from "../types";
import type {StorageProvider} from "../storage/provider";
import {matches,changed} from "./filter";
import {retry} from "../utils/retry";
import type {PersistentStore} from "../persistence/store";
import {stableSince,targetNeedsRepair} from "./reconciliation";
import {TargetPathLock} from "../jobs/path-lock";

const MAX_RESULT_ITEMS=500;

async function scan(p:StorageProvider,root:string,recursive:boolean):Promise<FileMetadata[]>{
 const out:FileMetadata[]=[];const queue=[root];
 while(queue.length){const current=queue.shift()!;for(const item of await p.list(current)){if(item.type==="symlink")continue;if(item.type==="directory"&&recursive)queue.push(item.path);else if(item.type==="file")out.push({...item,path:path.posix.relative(root,item.path)})}}
 return out;
}
async function hash(p:StorageProvider,file:string){const h=createHash("sha256"),stream=await p.createReadStream(file);for await(const chunk of stream)h.update(chunk as Buffer);return h.digest("hex")}

export class SyncEngine{
 constructor(private readonly store:PersistentStore,private readonly now:()=>number=Date.now,private readonly checkpointSize=25,private readonly transfer:<T>(operation:()=>Promise<T>)=>Promise<T>=operation=>operation(),private readonly checkpointFailed:(error:unknown)=>void=()=>undefined,private readonly targetLock=new TargetPathLock()){}
 async run(job:Job,source:StorageProvider,target:StorageProvider,dryRunOverride?:boolean):Promise<TransferResult>{
  const dryRun=job.dryRun||dryRunOverride===true;
  const result:TransferResult={copied:0,overwritten:0,versioned:0,moved:0,skipped:0,stabilityDeferred:0,failed:0,deleted:0,bytes:0,scanned:0,dryRun,totalActions:0,resultTruncated:false,items:[]};
  const record=runContext.getStore(),progress:RunProgress={phase:"scan",scanned:0,processed:0,bytes:0,bytesPerSecond:0};
  if(record)record.progress=progress;
  const action=(filePath:string,kind:string,detail?:string,remainingSeconds?:number)=>{if(progress.phase==="transfer")progress.processed++;result.totalActions++;if(result.items.length<MAX_RESULT_ITEMS)result.items.push({path:filePath,action:kind,...(detail?{detail}:{}),...(remainingSeconds!==undefined?{remainingSeconds}:{})});else result.resultTruncated=true};
  let snapshot=await this.store.load(job.id),dirty=0;
  const checkpoint=async(force=false)=>{if(!dryRun&&(force||dirty>=this.checkpointSize)){await this.store.save(job.id,snapshot);dirty=0}};
  try{
   await source.connect();await target.connect();
   if(job.sourceLocationId===job.targetLocationId){const a=source.normalizePath(job.sourcePath),b=target.normalizePath(job.targetPath);if(!a||!b||a===b||a.startsWith(`${b}/`)||b.startsWith(`${a}/`))throw new Error("Source and target overlap")}
   const files=(await scan(source,job.sourcePath,job.recursive)).filter(f=>matches(f,job.filters));snapshot.pending??={};result.scanned=files.length;progress.scanned=files.length;progress.phase="transfer";
   const sourceSet=new Set(files.map(f=>f.path));
   for(const file of files){
    progress.currentFile=file.path;progress.fileSize=file.size;progress.fileBytes=0;progress.bytesPerSecond=0;
    const old=snapshot.files[file.path];const src=path.posix.join(job.sourcePath,file.path);const canonical=path.posix.join(job.targetPath,file.path);
    const previousTarget=old?.targetPath??canonical;const previousTargetMeta=await target.statOrUndefined(previousTarget);const canonicalTargetMeta=previousTarget===canonical?previousTargetMeta:await target.statOrUndefined(canonical);let repair=targetNeedsRepair(file,previousTargetMeta);
    if(job.hashCheck&&!repair&&previousTargetMeta)repair=await hash(source,src)!==await hash(target,previousTarget);
    if(job.mode==="incremental"&&!changed(file,old)&&!repair){action(file.path,"skip");result.skipped++;continue}
    if(job.stabilitySeconds>0){const pending=snapshot.pending[file.path];const unchanged=pending&&pending.size===file.size&&pending.mtimeMs===file.mtimeMs;const observedAt=unchanged?pending.observedAt:this.now();if(!stableSince(file,pending,job.stabilitySeconds*1000,this.now())){snapshot.pending[file.path]={size:file.size,mtimeMs:file.mtimeMs,observedAt};dirty++;await checkpoint();const remaining=Math.max(1,Math.ceil((observedAt+job.stabilitySeconds*1000-this.now())/1000));action(file.path,"wait-stable","Datei muss noch unverändert bleiben",remaining);result.stabilityDeferred++;continue}}
    delete snapshot.pending[file.path];
    let canonicalExists=canonicalTargetMeta!==undefined,final=canonical,kind: "copy"|"overwrite"|"version"=canonicalExists&&job.conflict==="version"?"version":canonicalExists?"overwrite":"copy";
    if(dryRun){if(canonicalExists&&job.conflict==="never"){action(file.path,"skip","Wegen Konfliktregel übersprungen");result.skipped++;continue}if(canonicalExists&&job.conflict==="error")throw new Error(`Target conflict: ${file.path}`);if(kind==="version")final=`${canonical}.${this.now()}`}
    if(!dryRun){
     const outcome=await this.targetLock.run(`${job.targetLocationId}:${target.normalizePath(canonical)}`,()=>this.transfer(async()=>{
      // The conflict decision and destination selection must use state observed while holding the path lock.
      canonicalExists=(await target.statOrUndefined(canonical))!==undefined;
      if(canonicalExists&&job.conflict==="never")return {skipped:true,final:canonical,kind:"copy" as const};
      if(canonicalExists&&job.conflict==="error")throw new Error(`Target conflict: ${file.path}`);
      kind=canonicalExists&&job.conflict==="version"?"version":canonicalExists?"overwrite":"copy";final=kind==="version"?`${canonical}.${this.now()}`:canonical;
      await target.mkdir(path.posix.dirname(final));await retry(async()=>{const temp=path.posix.join(path.posix.dirname(final),`.${path.posix.basename(final)}.filesync-${randomUUID()}.tmp`);try{const before=await source.stat(src);if(before.type!=="file"||(job.mode==="move"&&changed(before,file)))throw new Error("Source changed since scan");progress.fileSize=before.size;progress.fileBytes=0;progress.bytes=result.bytes;progress.bytesPerSecond=0;const transferStarted=Date.now();await pipeline(await source.createReadStream(src),new Transform({transform(chunk,_encoding,callback){const fileBytes=(progress.fileBytes??0)+Buffer.byteLength(chunk);progress.fileBytes=fileBytes;progress.bytes=result.bytes+fileBytes;progress.bytesPerSecond=fileBytes/Math.max(0.001,(Date.now()-transferStarted)/1000);callback(null,chunk)}}),await target.createWriteStream(temp));progress.bytesPerSecond=0;const written=await target.stat(temp);const after=await source.stat(src);if(written.type!=="file"||after.type!=="file"||written.size!==before.size||changed(before,after))throw new Error("Source changed during transfer or size verification failed");if((job.hashCheck||job.mode==="move")&&await hash(source,src)!==await hash(target,temp))throw new Error("SHA-256 verification failed");await target.replace(temp,final);if(job.preserveTimestamps&&target.setMtime)await target.setMtime(final,before.mtimeMs)}catch(e){await target.remove(temp).catch(()=>undefined);throw e}},job.retry);return {skipped:false,final,kind}
     }));
     if(outcome.skipped){action(file.path,"skip");result.skipped++;continue}final=outcome.final;kind=outcome.kind;
     snapshot.files[file.path]={...file,syncedAt:this.now(),hash:job.hashCheck?await hash(source,src):undefined,targetPath:final};dirty++;await checkpoint();if(job.mode==="move")await this.targetLock.run(`${job.targetLocationId}:${target.normalizePath(canonical)}`,async()=>{
      const before=await source.stat(src),destination=await target.stat(final);
      if(before.type!=="file"||destination.type!=="file"||changed(before,file)||before.size!==destination.size)throw new Error("Move aborted: source or destination changed");
      if(await hash(source,src)!==await hash(target,final))throw new Error("Move aborted: destination content differs");
      const after=await source.stat(src),lastTarget=await target.stat(final);
      if(after.type!=="file"||lastTarget.type!=="file"||changed(after,before)||changed(lastTarget,destination))throw new Error("Move aborted: source or destination changed");
      await source.remove(src);
     });
    }
    action(file.path,kind);result.copied++;if(kind==="overwrite")result.overwritten++;if(kind==="version")result.versioned++;if(job.mode==="move")result.moved++;result.bytes+=file.size;if(!dryRun)progress.bytes=result.bytes;progress.fileBytes=undefined;progress.fileSize=undefined;progress.bytesPerSecond=0;
   }
   progress.currentFile=undefined;progress.fileBytes=undefined;progress.fileSize=undefined;progress.bytesPerSecond=0;
   if(job.mode==="mirror"&&job.mirrorDeleteConfirmed){progress.phase="mirror";for(const targetFile of (await scan(target,job.targetPath,job.recursive)).filter(file=>matches(file,job.filters))){if(!sourceSet.has(targetFile.path)){const removePath=path.posix.join(job.targetPath,targetFile.path);if(await source.statOrUndefined(path.posix.join(job.sourcePath,targetFile.path)))continue;let removed=dryRun;if(!dryRun)removed=await this.targetLock.run(`${job.targetLocationId}:${target.normalizePath(removePath)}`,async()=>{const current=await target.statOrUndefined(removePath);if(!current||current.type!=="file"||current.size!==targetFile.size||current.mtimeMs!==targetFile.mtimeMs)return false;if(await source.statOrUndefined(path.posix.join(job.sourcePath,targetFile.path)))return false;await target.remove(removePath);return true});if(removed){action(targetFile.path,"delete");result.deleted++}}}}
   if(!dryRun){snapshot={version:1,files:Object.fromEntries(Object.entries(snapshot.files).filter(([p])=>sourceSet.has(p))),pending:Object.fromEntries(Object.entries(snapshot.pending).filter(([p])=>sourceSet.has(p)))};dirty++;await checkpoint(true)}
   return result;
  }catch(error){if(!dryRun&&dirty>0){try{await checkpoint(true)}catch(checkpointError){this.checkpointFailed(checkpointError)}}throw error
  }finally{await Promise.allSettled([source.disconnect(),target.disconnect()])}
 }
}

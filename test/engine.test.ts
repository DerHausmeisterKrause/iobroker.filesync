import {mkdtemp,readFile,rm,stat,utimes,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {SyncEngine} from "../src/lib/sync/engine";
import {PersistentStore} from "../src/lib/persistence/store";
import {LocalStorageProvider} from "../src/lib/storage/local";
import type {Job,LocalLocation} from "../src/lib/types";

const roots:string[]=[];
const sourceId="00000000-0000-4000-8000-000000000001";
const targetId="00000000-0000-4000-8000-000000000002";
const jobId="00000000-0000-4000-8000-000000000003";
async function root(){const value=await mkdtemp(path.join(tmpdir(),"filesync-engine-"));roots.push(value);return value}
function location(id:string,basePath:string):LocalLocation{return{id,name:id,type:"local",enabled:true,readOnly:false,timeoutMs:1000,basePath}}
function job(overrides:Partial<Job>={}):Job{return{id:jobId,name:"test",enabled:true,sourceLocationId:sourceId,sourcePath:"",targetLocationId:targetId,targetPath:"",mode:"incremental",mirrorDeleteConfirmed:false,dryRun:false,recursive:true,preserveTimestamps:false,hashCheck:false,stabilitySeconds:0,conflict:"changed",trigger:{type:"manual",intervalSeconds:30},filters:{include:[],exclude:[]},retry:{attempts:0,baseDelayMs:100,exponential:false,maxDelayMs:100},notificationGroupIds:[],createdAt:"2026-01-01T00:00:00.000Z",updatedAt:"2026-01-01T00:00:00.000Z",...overrides}}
async function setup(now:()=>number=Date.now){const source=await root(),target=await root(),indexes=await root();return{source,target,store:new PersistentStore(indexes),engine:new SyncEngine(new PersistentStore(indexes),now),sourceProvider:new LocalStorageProvider(location(sourceId,source)),targetProvider:new LocalStorageProvider(location(targetId,target))}}
afterEach(async()=>{await Promise.all(roots.splice(0).map(value=>rm(value,{recursive:true,force:true})))})

describe("SyncEngine",()=>{
 it("persists an unchanged pending observation until the stability window expires",async()=>{
  let now=0;const x=await setup(()=>now);await writeFile(path.join(x.source,"file.pdf"),"stable");await utimes(path.join(x.source,"file.pdf"),1,1);const j=job({stabilitySeconds:10});
  expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(0);expect((await x.store.load(jobId)).pending?.["file.pdf"].observedAt).toBe(0);
  now=5000;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(0);expect((await x.store.load(jobId)).pending?.["file.pdf"].observedAt).toBe(0);
  now=11000;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect((await x.store.load(jobId)).pending?.["file.pdf"]).toBeUndefined();expect(await readFile(path.join(x.target,"file.pdf"),"utf8")).toBe("stable");
 });
 it("restarts the stability observation when source metadata changes",async()=>{
  let now=0;const x=await setup(()=>now);const file=path.join(x.source,"file.pdf");await writeFile(file,"one");await utimes(file,1,1);const j=job({stabilitySeconds:10});await x.engine.run(j,x.sourceProvider,x.targetProvider);
  now=5000;await writeFile(file,"changed-size");await utimes(file,2,2);await x.engine.run(j,x.sourceProvider,x.targetProvider);expect((await x.store.load(jobId)).pending?.["file.pdf"].observedAt).toBe(5000);
  now=11000;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(0);now=16000;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);
 });
 it("deletes only in-scope orphan files in mirror mode",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"a.pdf"),"source");for(const [name,data] of [["a.pdf","old"],["wichtig.xlsx","keep"],["private.pdf","keep"],["old.pdf","delete"]])await writeFile(path.join(x.target,name),data);
  const result=await x.engine.run(job({mode:"mirror",mirrorDeleteConfirmed:true,filters:{include:["**/*.pdf"],exclude:["private.pdf"]}}),x.sourceProvider,x.targetProvider);
  expect(result.deleted).toBe(1);expect(await readFile(path.join(x.target,"a.pdf"),"utf8")).toBe("source");expect(await readFile(path.join(x.target,"wichtig.xlsx"),"utf8")).toBe("keep");expect(await readFile(path.join(x.target,"private.pdf"),"utf8")).toBe("keep");await expect(stat(path.join(x.target,"old.pdf"))).rejects.toMatchObject({code:"ENOENT"});
 });
 it("reconciles a deleted or size-mismatched target despite an unchanged snapshot",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"test.pdf"),"correct");const j=job();expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);
  await rm(path.join(x.target,"test.pdf"));expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);
  await writeFile(path.join(x.target,"test.pdf"),"x");expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"test.pdf"),"utf8")).toBe("correct");
 });
 it("uses hashes to repair equal-size target corruption",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"test.pdf"),"right!");const j=job({hashCheck:true});await x.engine.run(j,x.sourceProvider,x.targetProvider);await writeFile(path.join(x.target,"test.pdf"),"wrong!");expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"test.pdf"),"utf8")).toBe("right!");
 });
});

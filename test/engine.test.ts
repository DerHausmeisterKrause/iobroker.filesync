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
 it("does not mirror-delete descendants when recursion is disabled",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"a.pdf"),"source");await writeFile(path.join(x.target,"a.pdf"),"old");await writeFile(path.join(x.target,"old.pdf"),"delete");await import("node:fs/promises").then(fs=>fs.mkdir(path.join(x.target,"sub")));await writeFile(path.join(x.target,"sub","wichtig.pdf"),"keep");
  const result=await x.engine.run(job({mode:"mirror",recursive:false,mirrorDeleteConfirmed:true,filters:{include:["**/*.pdf"],exclude:[]}}),x.sourceProvider,x.targetProvider);
  expect(result.deleted).toBe(1);await expect(stat(path.join(x.target,"old.pdf"))).rejects.toMatchObject({code:"ENOENT"});expect(await readFile(path.join(x.target,"sub","wichtig.pdf"),"utf8")).toBe("keep");
 });
 it("reconciles a deleted or size-mismatched target despite an unchanged snapshot",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"test.pdf"),"correct");const j=job();expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);
  await rm(path.join(x.target,"test.pdf"));expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);
  await writeFile(path.join(x.target,"test.pdf"),"x");expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"test.pdf"),"utf8")).toBe("correct");
 });
 it("uses hashes to repair equal-size target corruption",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"test.pdf"),"right!");const j=job({hashCheck:true});await x.engine.run(j,x.sourceProvider,x.targetProvider);await writeFile(path.join(x.target,"test.pdf"),"wrong!");expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"test.pdf"),"utf8")).toBe("right!");
 });
 it("never writes or deletes for a configured mirror dry-run",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"new.txt"),"new");await writeFile(path.join(x.target,"orphan.txt"),"keep");
  const result=await x.engine.run(job({mode:"mirror",mirrorDeleteConfirmed:true,dryRun:true}),x.sourceProvider,x.targetProvider,false);
  expect(result.dryRun).toBe(true);expect(result.deleted).toBe(1);expect(await readFile(path.join(x.target,"orphan.txt"),"utf8")).toBe("keep");await expect(stat(path.join(x.target,"new.txt"))).rejects.toMatchObject({code:"ENOENT"});
 });
 it("never removes the source for a configured move dry-run",async()=>{
  const x=await setup();await writeFile(path.join(x.source,"move.txt"),"keep");
  await x.engine.run(job({mode:"move",dryRun:true}),x.sourceProvider,x.targetProvider,false);
  expect(await readFile(path.join(x.source,"move.txt"),"utf8")).toBe("keep");await expect(stat(path.join(x.target,"move.txt"))).rejects.toMatchObject({code:"ENOENT"});
 });
 it("remembers the actual version target and creates no duplicate until source changes",async()=>{
  let now=100;const x=await setup(()=>now);await writeFile(path.join(x.source,"file.pdf"),"new");await writeFile(path.join(x.target,"file.pdf"),"old");const j=job({conflict:"version"});
  expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"file.pdf.100"),"utf8")).toBe("new");
  now=200;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(0);await expect(stat(path.join(x.target,"file.pdf.200"))).rejects.toMatchObject({code:"ENOENT"});
  await writeFile(path.join(x.source,"file.pdf"),"changed");now=300;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"file.pdf.300"),"utf8")).toBe("changed");
 });
 it("never overwrites canonical when a recorded version disappears",async()=>{
  let now=100;const x=await setup(()=>now);await writeFile(path.join(x.source,"file.pdf"),"NEW");await writeFile(path.join(x.target,"file.pdf"),"ORIGINAL");const j=job({conflict:"version"});await x.engine.run(j,x.sourceProvider,x.targetProvider);await rm(path.join(x.target,"file.pdf.100"));now=200;expect((await x.engine.run(j,x.sourceProvider,x.targetProvider)).copied).toBe(1);expect(await readFile(path.join(x.target,"file.pdf"),"utf8")).toBe("ORIGINAL");expect(await readFile(path.join(x.target,"file.pdf.200"),"utf8")).toBe("NEW")
 });
 it("bounds inline result details",async()=>{const x=await setup();for(let i=0;i<501;i++)await writeFile(path.join(x.source,`f${i}.txt`),"x");const result=await x.engine.run(job({dryRun:true}),x.sourceProvider,x.targetProvider);expect(result.totalActions).toBe(501);expect(result.items).toHaveLength(500);expect(result.resultTruncated).toBe(true)});
 it("checkpoints completed files when a later transfer fails",async()=>{
  const x=await setup();for(let i=1;i<=11;i++)await writeFile(path.join(x.source,`${String(i).padStart(2,"0")}.txt`),String(i));
  let writes=0;const target=Object.create(x.targetProvider) as LocalStorageProvider;target.createWriteStream=async p=>{if(++writes===11)throw new Error("intentional transfer failure");return x.targetProvider.createWriteStream(p)};
  const engine=new SyncEngine(x.store,Date.now,25);await expect(engine.run(job(),x.sourceProvider,target)).rejects.toThrow("intentional transfer failure");expect(Object.keys((await x.store.load(jobId)).files)).toHaveLength(10);
 });
 it("evaluates conflict=never atomically for concurrent runs",async()=>{
  const x=await setup(),secondSource=await root();await writeFile(path.join(x.source,"test.pdf"),"A");await writeFile(path.join(secondSource,"test.pdf"),"B");
  const secondProvider=new LocalStorageProvider(location("00000000-0000-4000-8000-000000000009",secondSource));
  const results=await Promise.all([x.engine.run(job({conflict:"never"}),x.sourceProvider,x.targetProvider),x.engine.run(job({id:"00000000-0000-4000-8000-000000000008",sourceLocationId:"00000000-0000-4000-8000-000000000009",conflict:"never"}),secondProvider,x.targetProvider)]);
  expect(results.reduce((sum,result)=>sum+result.copied,0)).toBe(1);expect(["A","B"]).toContain(await readFile(path.join(x.target,"test.pdf"),"utf8"));
 });
 it("reports conflict=error for the losing concurrent run",async()=>{
  const x=await setup(),secondSource=await root();await writeFile(path.join(x.source,"test.pdf"),"A");await writeFile(path.join(secondSource,"test.pdf"),"B");
  const secondProvider=new LocalStorageProvider(location("00000000-0000-4000-8000-000000000009",secondSource));
  const results=await Promise.allSettled([x.engine.run(job({conflict:"error"}),x.sourceProvider,x.targetProvider),x.engine.run(job({id:"00000000-0000-4000-8000-000000000008",sourceLocationId:"00000000-0000-4000-8000-000000000009",conflict:"error"}),secondProvider,x.targetProvider)]);
  expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
 });
});

import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {RunManager} from "../src/lib/runs/manager";

const roots:string[]=[];
afterEach(async()=>Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true}))));
async function manager(retention=500){const root=await mkdtemp(path.join(os.tmpdir(),"filesync-runs-"));roots.push(root);const value=new RunManager(root,String,retention,20);await value.load();return{root,value}}

describe("RunManager",()=>{
 it("keeps a queued invocation tied to its run id until it really executes",async()=>{const {value}=await manager();let release!:()=>void;const first=value.enqueue("job","manual",false,()=>new Promise(resolve=>{release=()=>resolve({summary:{first:true}})}));const second=value.enqueue("job","preview",true,async()=>({summary:{second:true},items:[],total:0}));await new Promise(resolve=>setTimeout(resolve,10));expect(value.get(first.runId)?.status).toBe("running");expect(value.get(second.runId)?.status).toBe("queued");release();await new Promise(resolve=>setTimeout(resolve,20));expect(value.get(second.runId)?.status).toBe("success");await value.shutdown()});
 it("removes old records from memory and its atomic persistent history",async()=>{const {root,value}=await manager(500);for(let i=0;i<1000;i++)value.enqueue(`job-${i}`,"schedule",false,async()=>({summary:{}}));await value.shutdown();expect(value.retainedCount).toBe(500);const saved=JSON.parse(await readFile(path.join(root,"runs.json"),"utf8")) as unknown[];expect(saved).toHaveLength(500)});
 it("redacts errors and caps result pagination",async()=>{const {value}=await manager();const run=value.enqueue("job","preview",true,async()=>{throw new Error("secret")});await new Promise(resolve=>setTimeout(resolve,20));expect(value.get(run.runId)?.redactedError).toContain("secret");expect(value.getItems(run.runId,0,999).limit).toBe(500);await value.shutdown()});
});

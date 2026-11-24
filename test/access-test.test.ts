import {mkdtemp,readdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {LocalStorageProvider} from "../src/lib/storage/local";
import {testAccess,withAccessTest} from "../src/lib/storage/access-test";

const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))});
async function setup(){
 const root=await mkdtemp(path.join(tmpdir(),"filesync-access-"));roots.push(root);
 await writeFile(path.join(root,"important.txt"),"keep");
 const provider=new LocalStorageProvider({id:"local",name:"test",type:"local",basePath:root,enabled:true,readOnly:false,timeoutMs:1000,groupIds:[]});
 await provider.connect();return {root,provider};
}
describe("explicit storage access tests",()=>{
 it("checks list/write/read/rename/delete and removes only its own file",async()=>{
  const {root,provider}=await setup();const report=await testAccess(provider,false);
  expect(report.ok).toBe(true);expect(report.checks.map(c=>c.status)).toEqual(["ok","ok","ok","ok","ok"]);expect(await readdir(root)).toEqual(["important.txt"]);expect(await readFile(path.join(root,"important.txt"),"utf8")).toBe("keep");
 });
 it("never writes when configured read-only",async()=>{
  const {root,provider}=await setup();provider.createWriteStream=async()=>{throw new Error("Must not write")};
  const report=await testAccess(provider,true);expect(report.ok).toBe(true);expect(report.checks.map(c=>c.status)).toEqual(["ok","skipped","skipped","skipped","skipped"]);expect(await readdir(root)).toEqual(["important.txt"]);
 });
 it("reports denied writes without disclosing credentials",async()=>{
  const {root,provider}=await setup();provider.createWriteStream=async()=>{throw Object.assign(new Error("EACCES: permission denied confidential123"),{code:"EACCES"})};
  const report=await testAccess(provider,false,["confidential123"]);expect(report.ok).toBe(false);expect(report.checks[1]).toMatchObject({step:"write",status:"error",message:"EACCES: permission denied [REDACTED]"});expect(await readdir(root)).toEqual(["important.txt"]);
 });
 it("cleans up its temporary file after a rename error",async()=>{
  const {root,provider}=await setup();provider.rename=async()=>{throw new Error("Permission denied")};
  const report=await testAccess(provider,false);expect(report.ok).toBe(false);expect(report.checks[3]).toMatchObject({step:"rename",status:"error"});expect(report.cleanupError).toBeUndefined();expect(await readdir(root)).toEqual(["important.txt"]);
 });
 it("reports a remaining probe if delete and cleanup both fail",async()=>{
  const {root,provider}=await setup();provider.remove=async()=>{throw new Error("Permission denied")};
  const report=await testAccess(provider,false);expect(report.ok).toBe(false);expect(report.checks[4]).toMatchObject({step:"delete",status:"error"});expect(report.cleanupError).toContain("Permission denied");expect((await readdir(root)).length).toBe(2);
 });
 it("leaves ordinary background health checks unchanged",async()=>{
  const {provider}=await setup();provider.testConnection=async()=>({latencyMs:1,freeBytes:100});
  const wrapped=withAccessTest(provider,true,[]);expect(await wrapped.testConnection()).toEqual({latencyMs:1,freeBytes:100});expect(await wrapped.testConnection(true)).toMatchObject({readOnly:true,ok:true});
 });
});

"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const {Readable}=require("node:stream");
const {pipeline}=require("node:stream/promises");
const IsolatedSmbClient=require("../../src/lib/storage/smb-worker.cjs");
const fixture=path.resolve(__dirname,"../fixtures/smb-worker-client.cjs");
const options={host:"example",share:"share",domain:"",username:"test",password:"test",port:445,autoCloseTimeout:1000};
describe("isolated SMB client",function(){
 this.timeout(8000);
 let clients=[];
 const create=()=>{const client=new IsolatedSmbClient(options,fixture);clients.push(client);return client};
 afterEach(async()=>{await Promise.all(clients.splice(0).map(c=>c.disconnect()))});
 it("keeps asynchronous crypto exceptions out of the adapter process",async()=>{
  const broken=create();
  await assert.rejects(broken.readdir("crash"),{code:"ERR_OSSL_EVP_UNSUPPORTED"});
  const healthy=create();
  assert.deepEqual(await healthy.readdir(""),["original.txt"]);
 });
 it("terminates an unresponsive worker and rejects pending calls",async()=>{
  const broken=create();
  const result=Promise.allSettled([broken.readdir("hang"),broken.stat("original.txt")]);
  const outcomes=await result;
  for(const outcome of outcomes){assert.equal(outcome.status,"rejected");assert.equal(outcome.reason.code,"ETIMEDOUT")}
  assert.deepEqual(await create().readdir(""),["original.txt"]);
 });
 it("preserves SMB error codes and supports subsequent requests",async()=>{
  const client=create();
  await assert.rejects(client.readdir("denied"),{code:"STATUS_ACCESS_DENIED"});
  await assert.rejects(client.stat("absent"),{code:"STATUS_OBJECT_NAME_NOT_FOUND"});
  assert.equal((await client.stat("original.txt")).size,11);
 });
 it("uses share-relative paths, rejects traversal and reports reparse points",async()=>{
  const client=create();await client.connect();
  await assert.rejects(client.stat("../other"),{code:"EINVAL"});
  await assert.rejects(client.stat("link"),{code:"SMB_REPARSE_POINT"});
  assert.deepEqual(await client.readdir("."),["original.txt"]);
 });
 it("streams data in both directions with correct metadata and renaming",async()=>{
  const client=create();
  const parts=[];for await(const chunk of await client.createReadStream("original.txt"))parts.push(chunk);
  assert.equal(Buffer.concat(parts).toString(),"sample data");
  await pipeline(Readable.from([Buffer.from("part "),Buffer.from("two")]),await client.createWriteStream("temp"));
  await client.rename("temp","target");const info=await client.stat("target");
  assert.equal(info.size,8);assert.equal(info.mtime.getTime(),1000);assert.equal(info.isDirectory(),false);
  const result=[];for await(const chunk of await client.createReadStream("target"))result.push(chunk);
  assert.equal(Buffer.concat(result).toString(),"part two");await client.unlink("target");
  await assert.rejects(client.stat("target"),{code:"STATUS_OBJECT_NAME_NOT_FOUND"});
 });
});

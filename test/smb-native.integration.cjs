"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID,randomBytes,createHash}=require("node:crypto");
const {Readable}=require("node:stream");
const {pipeline}=require("node:stream/promises");
const Client=require("../src/lib/storage/smb-worker.cjs");
const opts={host:process.env.SMB_TEST_HOST||"127.0.0.1",port:Number(process.env.SMB_TEST_PORT||1445),share:"filesync",domain:"WORKGROUP",username:process.env.SMB_TEST_USER,password:process.env.SMB_TEST_PASSWORD,autoCloseTimeout:20000};
if(!opts.username||!opts.password)throw new Error("Set SMB_TEST_USER and SMB_TEST_PASSWORD for a disposable test share");
test("native signed SMB: authentication, directory operations, streaming, error recovery",{timeout:180000},async()=>{
 const bad=new Client({...opts,password:randomUUID()});
 try{await assert.rejects(bad.connect())}finally{await bad.disconnect()}
 const client=new Client(opts),dir="filesync-"+randomUUID(),temp=dir+"/temp.bin",target=dir+"/target.bin";
 const hash=b=>createHash("sha256").update(b).digest("hex");
 const payload=randomBytes(2*1024*1024);
 try{
  await client.connect();
  if(process.env.SMB_TEST_DIALECT){assert.equal(client.negotiatedDialect,process.env.SMB_TEST_DIALECT);const forced=new Client({...opts,dialect:process.env.SMB_TEST_DIALECT});try{await forced.connect();assert.equal(forced.negotiatedDialect,process.env.SMB_TEST_DIALECT);await forced.readdir("")}finally{await forced.disconnect()}}
  await client.mkdir(dir);assert.equal((await client.stat(dir)).isDirectory(),true);
  await pipeline(Readable.from([payload.subarray(0,65536),payload.subarray(65536)]),await client.createWriteStream(temp));
  assert.equal((await client.stat(temp)).size,payload.length);
  await client.rename(temp,target);assert.deepEqual(await client.readdir(dir),["target.bin"]);
  const digest=createHash("sha256");for await(const chunk of await client.createReadStream(target))digest.update(chunk);
  assert.equal(digest.digest("hex"),hash(payload));
  await client.unlink(target);await assert.rejects(client.stat(target),{code:"ENOENT"});
  await pipeline(Readable.from([]),await client.createWriteStream(dir+"/empty"));assert.equal((await client.stat(dir+"/empty")).size,0);
  await client.unlink(dir+"/empty");await client.rmdir(dir);
 }finally{await client.disconnect()}
});

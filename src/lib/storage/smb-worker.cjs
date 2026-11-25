"use strict";
const {Worker,isMainThread,parentPort,workerData}=require("node:worker_threads");
const {Readable,Writable}=require("node:stream");
const {finished}=require("node:stream/promises");
const {getCiphers,getHashes}=require("node:crypto");

function failure(message,code){return Object.assign(new Error(message),{code})}
function safeError(error){
 const message=error?.code==="ERR_OSSL_EVP_UNSUPPORTED"
  ?"SMB authentication requires legacy NTLM crypto unavailable in this Node.js runtime. Use a mounted SMB share or a modern SMB client."
  :String(error?.message??error);
 const result={message};
 for(const key of ["code","errno","status"])if(typeof error?.[key]==="string"||typeof error?.[key]==="number")result[key]=error[key];
 return result;
}

if(!isMainThread&&workerData?.fileSyncSmb===true){
 const port=parentPort,options=workerData.options,streams=new Map();
 let client,sequence=0;
 const factory=workerData.testModule?require(workerData.testModule):require("@marsaud/smb2");
 const getClient=()=>{
  if(!client){
   if(!workerData.testModule&&(!getCiphers().includes("des-ecb")||!getHashes().includes("md4")))throw failure("SMB authentication requires legacy NTLM crypto unavailable in this Node.js runtime. Use a mounted SMB share or a modern SMB client.","ERR_OSSL_EVP_UNSUPPORTED");
   client=new factory(options);
  }
  return client;
 };
 async function execute(op,args){
  if(op==="close"){for(const entry of streams.values())entry.stream.destroy();streams.clear();client?.disconnect();return}
  if(op==="read-next"){
   const entry=streams.get(args[0]);if(!entry)throw failure("SMB read stream closed","SMB_STREAM_CLOSED");
   const next=await entry.iterator.next();if(next.done)streams.delete(args[0]);
   return next.done?{done:true}:{done:false,chunk:Buffer.from(next.value)};
  }
  if(op==="write-chunk"){
   const entry=streams.get(args[0]);if(!entry)throw failure("SMB write stream closed","SMB_STREAM_CLOSED");
   if(entry.error)throw entry.error;
   await new Promise((resolve,reject)=>entry.stream.write(Buffer.from(args[1]),error=>error?reject(error):resolve()));return;
  }
  if(op==="write-end"){
   const entry=streams.get(args[0]);if(!entry)throw failure("SMB write stream closed","SMB_STREAM_CLOSED");
   try{if(entry.error)throw entry.error;const completed=finished(entry.stream,{cleanup:true,readable:false});entry.stream.end();await completed;if(entry.error)throw entry.error}finally{streams.delete(args[0])}return;
  }
  if(op==="stream-close"){const entry=streams.get(args[0]);if(entry){streams.delete(args[0]);entry.stream.destroy()}return}
  const c=getClient();
  if(op==="stat"){const s=await c.stat(args[0]);return {size:s.size,mtime:s.mtime,isDirectory:s.isDirectory()}}
  if(op==="read-open"||op==="write-open"){
   const stream=await (op==="read-open"?c.createReadStream(args[0]):c.createWriteStream(args[0]));
   const id=++sequence,entry={stream};stream.on("error",error=>{entry.error=error});
   if(op==="read-open")entry.iterator=stream[Symbol.asyncIterator]();
   streams.set(id,entry);return id;
  }
  if(["readdir","mkdir","rename","rmdir","unlink"].includes(op))return c[op](...args);
  throw failure("Unknown SMB worker operation","SMB_BAD_REQUEST");
 }
 // Only one operation is sent to this legacy client at a time.
 let queue=Promise.resolve();
 port.on("message",({id,op,args})=>{queue=queue.then(async()=>{try{port.postMessage({id,ok:true,data:await execute(op,args)})}catch(error){port.postMessage({id,ok:false,error:safeError(error)})}})});
}else{
 class IsolatedSmbClient{
  constructor(options,testModule){
   this.timeout=Math.max(1000,Math.min(300000,options.autoCloseTimeout||10000));
   this.pending=new Map();this.sequence=0;this.dead=null;
   this.worker=new Worker(__filename,{workerData:{fileSyncSmb:true,options:{...options,autoCloseTimeout:0},testModule}});
   this.worker.on("message",message=>{
    const item=this.pending.get(message.id);if(!item)return;
    this.pending.delete(message.id);clearTimeout(item.timer);
    if(message.ok)item.resolve(message.data);else item.reject(Object.assign(new Error(message.error.message),message.error));
   });
   this.worker.on("error",error=>this.fail(Object.assign(new Error(safeError(error).message),safeError(error))));
   this.worker.on("exit",code=>this.fail(failure("SMB worker stopped (exit "+code+")","SMB_WORKER_EXIT")));
  }
  fail(error){
   if(this.dead)return;this.dead=error;
   for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error)}this.pending.clear();
   void this.worker.terminate().catch(()=>{});
  }
  rpc(op,...args){
   if(this.dead)return Promise.reject(this.dead);
   const id=++this.sequence;
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>this.fail(failure("SMB operation timed out after "+this.timeout+" ms ("+op+")","ETIMEDOUT")),this.timeout);
    this.pending.set(id,{resolve,reject,timer});
    try{this.worker.postMessage({id,op,args})}catch(error){this.fail(error)}
   });
  }
  async disconnect(){
   // A timed-out or crashed worker has already been terminated.
   if(!this.dead){try{await this.rpc("close")}catch{}}
   this.fail(failure("SMB connection closed","SMB_WORKER_CLOSED"));
  }
  readdir(p){return this.rpc("readdir",p)}
  async stat(p){const s=await this.rpc("stat",p);return {...s,isDirectory:()=>s.isDirectory}}
  mkdir(p){return this.rpc("mkdir",p)}
  rename(a,b){return this.rpc("rename",a,b)}
  rmdir(p){return this.rpc("rmdir",p)}
  unlink(p){return this.rpc("unlink",p)}
  async createReadStream(p){
   const id=await this.rpc("read-open",p),self=this;
   return Readable.from((async function*(){try{for(;;){const result=await self.rpc("read-next",id);if(result.done)return;yield Buffer.from(result.chunk)}}finally{await self.rpc("stream-close",id).catch(()=>{})}})(),{objectMode:false});
  }
  async createWriteStream(p){
   const id=await this.rpc("write-open",p),self=this;
   return new Writable({
    write(chunk,_encoding,callback){self.rpc("write-chunk",id,chunk).then(()=>callback(),callback)},
    final(callback){self.rpc("write-end",id).then(()=>callback(),callback)},
    destroy(error,callback){self.rpc("stream-close",id).then(()=>callback(error),()=>callback(error))}
   });
  }
 }
 module.exports=IsolatedSmbClient;
}

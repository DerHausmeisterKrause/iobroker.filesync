"use strict";
const {Worker,isMainThread,parentPort,workerData}=require("node:worker_threads");
const {Readable,Writable}=require("node:stream");
const {finished}=require("node:stream/promises");


function failure(message,code){return Object.assign(new Error(message),{code})}
function safeError(error){
 const message=String(error?.message??error);
 const result={message};
 for(const key of ["code","errno","status","statusName"])if(typeof error?.[key]==="string"||typeof error?.[key]==="number")result[key]=error[key];
 return result;
}

if(!isMainThread&&workerData?.fileSyncSmb===true){
 const port=parentPort,options=workerData.options,streams=new Map();
 let client,sequence=0;
 const share=options.share;
 // All API paths are share-relative. Never pass UNC or traversal segments to the library.
 function smbPath(relative){
  if(typeof relative!=="string"||relative.includes("\0"))throw failure("Invalid SMB path","EINVAL");
  const parts=relative.replace(/\\/g,"/").split("/").filter(part=>part&&part!==".");
  if(parts.some(part=>part===".."||part.includes(":")))throw failure("Invalid SMB path","EINVAL");
  return [share,...parts].join("/");
 }
 let connection;
 const getClient=()=>connection??=(async()=>{
  const Client=workerData.testModule?require(workerData.testModule):(await import("smb3-client")).Client;
  client=new Client({host:options.host,port:options.port,domain:options.domain,username:options.username,password:options.password,connectTimeout:options.autoCloseTimeout,requestTimeout:options.autoCloseTimeout,signing:"required",encryption:"if-offered"});
  await client.connect();
  return client;
 })();
 async function execute(op,args){
  if(op==="close"){for(const entry of streams.values())entry.stream.destroy();streams.clear();await client?.close();return}
  if(op==="read-next"){
   const entry=streams.get(args[0]);if(!entry)throw failure("SMB read stream closed","SMB_STREAM_CLOSED");
   if(entry.error)throw entry.error;
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
  const c=await getClient();
  if(op==="connect")return;
  if(op==="stat"){const s=await c.stat(smbPath(args[0]));return {size:s.size,mtime:s.mtime,isDirectory:s.isDirectory,attributes:s.attributes}}
  if(op==="read-open"||op==="write-open"){
   const stream=await (op==="read-open"?c.createReadStream(smbPath(args[0])):c.createWriteStream(smbPath(args[0])));
   const id=++sequence,entry={stream};stream.on("error",error=>{entry.error=error});
   if(op==="read-open")entry.iterator=stream[Symbol.asyncIterator]();
   streams.set(id,entry);return id;
  }
  if(op==="unlink")return c.rm(smbPath(args[0]));
  if(["readdir","mkdir","rename","rmdir"].includes(op))return c[op](...args.map(smbPath));
  throw failure("Unknown SMB worker operation","SMB_BAD_REQUEST");
 }
 // Serialize requests within this connection; keep crash isolation and deadlines.
 let queue=Promise.resolve();
 port.on("message",({id,op,args})=>{queue=queue.then(async()=>{try{port.postMessage({id,ok:true,data:await execute(op,args)})}catch(error){port.postMessage({id,ok:false,error:safeError(error)})}})});
}else{
 class IsolatedSmbClient{
  constructor(options,testModule){
   this.timeout=Math.max(1000,Math.min(300000,options.autoCloseTimeout||10000));
   this.pending=new Map();this.sequence=0;this.dead=null;
   this.worker=new Worker(__filename,{workerData:{fileSyncSmb:true,options:{...options,autoCloseTimeout:this.timeout},testModule}});
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
  connect(){return this.rpc("connect")}
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

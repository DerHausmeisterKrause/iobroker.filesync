"use strict";
const {Readable,Writable}=require("node:stream");
module.exports=class FakeSmbClient{
 constructor(){this.files=new Map([["original.txt",Buffer.from("sample data")]])}
 disconnect(){}
 async readdir(p){
  if(p==="crash"){setImmediate(()=>{throw Object.assign(new Error("unsupported cipher"),{code:"ERR_OSSL_EVP_UNSUPPORTED"})});return new Promise(()=>{})}
  if(p==="hang")return new Promise(()=>{});
  if(p==="denied")throw Object.assign(new Error("access denied"),{code:"STATUS_ACCESS_DENIED"});
  return [...this.files.keys()];
 }
 async stat(p){if(!this.files.has(p))throw Object.assign(new Error("not found"),{code:"STATUS_OBJECT_NAME_NOT_FOUND"});return {size:this.files.get(p).length,mtime:new Date(1000),isDirectory:()=>false}}
 async createReadStream(p){return Readable.from([this.files.get(p)])}
 async createWriteStream(p){const parts=[],files=this.files;return new Writable({write(chunk,enc,cb){parts.push(Buffer.from(chunk));cb()},final(cb){files.set(p,Buffer.concat(parts));cb()}})}
 async rename(a,b){this.files.set(b,this.files.get(a));this.files.delete(a)}
 async unlink(p){this.files.delete(p)}
};

"use strict";
const {Readable,Writable}=require("node:stream");
module.exports=class FakeSmbClient{
 constructor(options){if(options.host!=="example"||options.port!==445||options.signing!=="required"||options.encryption!=="if-offered")throw Error("Unexpected SMB3 configuration");this.files=new Map([["share/original.txt",Buffer.from("sample data")]])}
 async connect(){}
 async close(){}
 async readdir(p){
  if(p==="share/crash"){setImmediate(()=>{throw Object.assign(new Error("unsupported cipher"),{code:"ERR_OSSL_EVP_UNSUPPORTED"})});return new Promise(()=>{})}
  if(p==="share/hang")return new Promise(()=>{});
  if(p==="share/denied")throw Object.assign(new Error("access denied"),{code:"STATUS_ACCESS_DENIED"});
  if(p!=="share")throw Error("Unexpected share path: "+p);return [...this.files.keys()].map(name=>name.slice(6));
 }
 async stat(p){if(p==="share/link")return {size:0,mtime:new Date(1000),isDirectory:false,attributes:0x400};if(!this.files.has(p))throw Object.assign(new Error("not found"),{code:"STATUS_OBJECT_NAME_NOT_FOUND"});return {size:this.files.get(p).length,mtime:new Date(1000),isDirectory:false,attributes:0}}
 async createReadStream(p){return Readable.from([this.files.get(p)])}
 async createWriteStream(p){const parts=[],files=this.files;return new Writable({write(chunk,enc,cb){parts.push(Buffer.from(chunk));cb()},final(cb){files.set(p,Buffer.concat(parts));cb()}})}
 async rename(a,b){this.files.set(b,this.files.get(a));this.files.delete(a)}
 async rm(p){this.files.delete(p)}
};

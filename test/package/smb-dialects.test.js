"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const moduleUrl=pathToFileURL(path.resolve(__dirname,"../../src/lib/storage/smb-dialects.mjs")).href;
describe("SMB dialect compatibility",()=>{
 let dialectOffer,connectCompatible;
 before(async()=>{({dialectOffer,connectCompatible}=await import(moduleUrl))});
 function fixture(responses){
  const offers=[],sent=[],clients=[],credits=[];
  class Connection {
   credits={take:async n=>credits.push(n)};
   async open(options){offers.push(options);const value=responses.shift();if(value instanceof Error)throw value;return {dialect:value,maxReadSize:1048576,maxWriteSize:1048576,maxTransactSize:1048576}}
   async send(command,body,options){sent.push({command,body,options});return {}}
  }
  class Client {
   constructor(options){this.options=options;this.conn=new Connection();clients.push(this)}
   async connect(){this.state=await this.conn.open({capabilities:68,ciphers:[2,1],securityMode:3});await this.conn.send(1,"auth",{creditCharge:1})}
   async close(){this.closed=true}
  }
  return {Connection,Client,offers,sent,clients,credits};
 }
 it("offers all five supported dialects and disallows SMB1",()=>{
  assert.deepEqual(dialectOffer(),[0x0202,0x0210,0x0300,0x0302,0x0311]);
  for(const [key,value] of [["2.0.2",0x0202],["2.1",0x0210],["3.0",0x0300],["3.0.2",0x0302],["3.1.1",0x0311]])assert.deepEqual(dialectOffer(key),[value]);
  assert.throws(()=>dialectOffer("1.0"));
 });
 it("uses the original modern request path on a modern server",async()=>{
  const f=fixture([0x0311]),original=f.Connection.prototype.open,result=await connectCompatible(f.Client,f.Connection,{});
  assert.equal(result.dialect,"3.1.1");assert.equal(result.client.options.signing,"required");
  assert.equal(result.client.state.maxReadSize,1048576);assert.equal(f.sent[0].options.creditCharge,1);assert.equal(f.offers[0].securityMode,3);assert.equal(f.offers[0].capabilities,68);assert.equal(f.Connection.prototype.open,original);
 });
 it("uses zero wire credit charge but consumes a local credit on 2.0.2",async()=>{
  const f=fixture([0x0202]);const result=await connectCompatible(f.Client,f.Connection,{},"2.0.2");
  assert.equal(result.dialect,"2.0.2");assert.equal(f.offers[0].capabilities,0);assert.deepEqual(f.offers[0].ciphers,[]);assert.equal(result.client.state.maxReadSize,65536);assert.equal(result.client.state.maxWriteSize,65536);
  const signing={sign:()=>Buffer.alloc(16)};await result.client.conn.send(8,"read",{creditCharge:1,signing});
  assert.deepEqual(f.credits,[1,1]);assert.equal(f.sent[0].options.creditCharge,0);assert.equal(f.sent[1].options.creditCharge,0);assert.equal(f.sent[1].options.signing,signing);
 });
 it("retries only explicit negotiate-not-supported on a fresh connection",async()=>{
  const error=Object.assign(new Error("NEGOTIATE failed: 0xC00000BB"),{status:0xc00000bb});
  const f=fixture([error,0x0202]);const result=await connectCompatible(f.Client,f.Connection,{});
  assert.equal(result.dialect,"2.0.2");assert.equal(f.clients.length,2);assert.equal(f.clients[0].closed,true);assert.deepEqual(f.offers[1].dialects,[0x0202]);assert.equal(f.clients[1].options.signing,"required");
 });
 it("does not retry authentication failures or override a manual dialect",async()=>{
  for(const [error,mode] of [[Object.assign(new Error("SESSION_SETUP AUTH failed"),{status:0xc000006d}),"auto"],[Object.assign(new Error("NEGOTIATE failed: 0xC00000BB"),{status:0xc00000bb}),"3.1.1"]]){
   const f=fixture([error,0x0202]);await assert.rejects(connectCompatible(f.Client,f.Connection,{},mode),error);assert.equal(f.clients.length,1);assert.equal(f.clients[0].closed,true);
  }
 });
 it("rejects an unoffered server dialect instead of silently downgrading",async()=>{
  const f=fixture([0x0202]);await assert.rejects(connectCompatible(f.Client,f.Connection,{},"3.1.1"),/unoffered/);assert.equal(f.clients.length,1);
 });
});

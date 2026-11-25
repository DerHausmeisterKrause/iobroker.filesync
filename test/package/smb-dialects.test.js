"use strict";
const assert=require("node:assert/strict");
const path=require("node:path");
const {pathToFileURL}=require("node:url");
const moduleUrl=pathToFileURL(path.resolve(__dirname,"../../src/lib/storage/smb-dialects.mjs")).href;
describe("SMB dialect compatibility",()=>{
 let dialectOffer,connectCompatible,normalizeDirectoryRequest;
 before(async()=>{({dialectOffer,connectCompatible,normalizeDirectoryRequest}=await import(moduleUrl))});
 function fixture(responses){
  const offers=[],sent=[],clients=[],credits=[];
  class Connection {
   credits={take:async n=>credits.push(n)};
   async open(options){offers.push(options);const value=responses.shift();if(value instanceof Error)throw value;return {dialect:value,maxReadSize:1048576,maxWriteSize:1048576,maxTransactSize:1048576}}
   async send(command,body,options){sent.push({command,body,options});return {header:{status:this.responseStatus??0}}}
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
 function directoryBody(pattern){
  const bytes=Buffer.from(pattern,"utf16le"),body=Buffer.alloc(32+Math.max(1,bytes.length));
  body.writeUInt16LE(33,0);body[2]=37;body[3]=pattern?1:0;
  body.writeUInt16LE(96,24);body.writeUInt16LE(bytes.length,26);body.writeUInt32LE(65536,28);bytes.copy(body,32);
  return body;
 }
 it("corrects the empty continuation offset without changing the original or restarting the search",()=>{
  const original=directoryBody(""),fixed=normalizeDirectoryRequest(14,original,65536);
  assert.equal(original.readUInt16LE(24),96);assert.equal(fixed.readUInt16LE(24),0);
  assert.equal(fixed.readUInt16LE(26),0);assert.equal(fixed[3],0);assert.equal(fixed.length,33);
  const first=directoryBody("*");assert.equal(normalizeDirectoryRequest(14,first,65536),first);
  const capped=normalizeDirectoryRequest(14,first,16384);assert.equal(capped.readUInt32LE(28),16384);assert.equal(capped.readUInt16LE(24),96);assert.equal(capped.subarray(32).toString("utf16le"),"*");
  assert.equal(normalizeDirectoryRequest(8,first,16384),first);
 });
 it("repeats the wildcard for legacy continuation without altering flags, file index or handle",()=>{
  const original=directoryBody("");original.fill(0xab,8,24);
  const fixed=normalizeDirectoryRequest(14,original,16384,true);
  assert.equal(fixed.length,34);assert.equal(fixed.readUInt16LE(24),96);assert.equal(fixed.readUInt16LE(26),2);assert.equal(fixed.readUInt32LE(28),16384);assert.equal(fixed.subarray(32).toString("utf16le"),"*");
  assert.deepEqual(fixed.subarray(0,24),original.subarray(0,24));assert.equal(fixed[3],0);
  assert.equal(original.length,33);assert.equal(original.readUInt16LE(26),0);
 });
 it("completes legacy enumeration against a simulated server requiring an explicit wildcard",async()=>{
  const f=fixture([0x0202]),result=await connectCompatible(f.Client,f.Connection,{}),conn=result.client.conn;
  let page=0;
  // Each query advances the existing enumeration; a restart or empty wildcard is rejected.
  const first=directoryBody("*"),next=directoryBody("");
  for(const input of [first,next,next]){
   conn.responseStatus=page===2?0x80000006:0;
   const response=await conn.send(14,input,{creditCharge:1});
   const packet=f.sent.at(-1).body;
   assert.equal(packet.readUInt16LE(26),2);
   assert.equal(packet.subarray(32).toString("utf16le"),"*");
   assert.equal(packet[3],page===0?1:0);
   assert.equal(response.header.status,page===2?0x80000006:0);page++;
  }
  assert.equal(page,3);
 });
 it("corrects requests before the upstream signing path for every dialect and preserves errors",async()=>{
  for(const dialect of [0x0202,0x0210,0x0300,0x0302,0x0311]){
   const f=fixture([dialect]);const result=await connectCompatible(f.Client,f.Connection,{});const conn=result.client.conn;
   const signing={sign:()=>Buffer.alloc(16)};await conn.send(14,directoryBody(""),{creditCharge:1,signing});
   assert.equal(f.sent.at(-1).body.readUInt16LE(24),dialect===0x0202?96:0);assert.equal(f.sent.at(-1).options.signing,signing);assert.equal(f.sent.at(-1).options.creditCharge,dialect===0x0202?0:1);
   conn.responseStatus=0xc0000033;await assert.rejects(conn.send(14,directoryBody(""),{creditCharge:1}),/Fortsetzung/);await assert.rejects(conn.send(14,directoryBody("*"),{creditCharge:1}),/erste Anfrage/);
   conn.responseStatus=0x80000006;assert.equal((await conn.send(14,directoryBody(""),{})).header.status,0x80000006);
  }
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

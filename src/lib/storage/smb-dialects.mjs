// Compatibility layer for the pinned smb3-client 0.2.0. Loaded only in the isolated worker.
const DIALECTS=Object.freeze({"2.0.2":0x0202,"2.1":0x0210,"3.0":0x0300,"3.0.2":0x0302,"3.1.1":0x0311});
export function dialectOffer(mode="auto"){
 if(mode==="auto")return Object.values(DIALECTS);
 if(!Object.hasOwn(DIALECTS,mode))throw new Error("Invalid SMB protocol selection");
 return [DIALECTS[mode]];
}
// Normalize QUERY_DIRECTORY before the upstream sender signs/encrypts the PDU.
export function normalizeDirectoryRequest(command,body,maxTransactSize){
 if(command!==0x000e)return body;
 if(!Buffer.isBuffer(body)||body.length<33||body.readUInt16LE(0)!==33)throw new Error("Malformed SMB QUERY_DIRECTORY request");
 const length=body.readUInt16LE(26),offset=body.readUInt16LE(24);
 const limit=body.readUInt32LE(28);
 const max=Number.isSafeInteger(maxTransactSize)&&maxTransactSize>0?Math.min(limit,maxTransactSize):limit;
 if(length!==0&&(offset<96||offset-64+length>body.length||length%2!==0))throw new Error("Malformed SMB directory search pattern");
 if((length!==0||offset===0)&&max===limit)return body;
 const result=Buffer.from(body);
 // MS-SMB2 2.2.33: when no pattern is present both offset and length MUST be zero.
 if(length===0)result.writeUInt16LE(0,24);
 result.writeUInt32LE(max,28);
 return result;
}
export function installNegotiation(Connection,offer){
 const original=Connection.prototype.open;
 if(typeof original!=="function"||typeof Connection.prototype.send!=="function")throw new Error("Incompatible SMB library");
 let selected;
 Connection.prototype.open=async function(options={}){
  const legacyOnly=offer.length===1&&offer[0]===0x0202;
  const result=await original.call(this,{...options,dialects:[...offer],...(legacyOnly?{capabilities:0,ciphers:[]}:{})});
  if(!offer.includes(result.dialect))throw new Error("Server selected an unoffered SMB dialect");
  selected=Object.keys(DIALECTS).find(key=>DIALECTS[key]===result.dialect);
  const send=this.send,legacy=result.dialect===0x0202;
  if(legacy){
   if(typeof this.credits?.take!=="function")throw new Error("Incompatible SMB credit implementation");
   result.maxReadSize=Math.min(result.maxReadSize,65536);
   result.maxWriteSize=Math.min(result.maxWriteSize,65536);
   result.maxTransactSize=Math.min(result.maxTransactSize,65536);
  }
  this.send=async function(command,body,opts={}){
   const request=normalizeDirectoryRequest(command,body,result.maxTransactSize);
   if(legacy&&command!==0)await this.credits.take(1);
   const response=await send.call(this,command,request,legacy?{...opts,creditCharge:0}:opts);
   if(command===0x000e&&response?.header?.status===0xc0000033){
    const stage=request.readUInt16LE(26)===0?"Fortsetzung":"erste Anfrage";
    // Never turn a failed or incomplete enumeration into an empty directory.
    throw Object.assign(new Error("QUERY_DIRECTORY failed: STATUS_OBJECT_NAME_INVALID (0xC0000033; "+stage+")"),{status:0xc0000033,code:"EINVAL"});
   }
   return response;
  };
  return result;
 };
 return {restore(){Connection.prototype.open=original},selected(){return selected}};
}
export async function connectCompatible(Client,Connection,options,mode="auto"){
 const offer=dialectOffer(mode);
 async function attempt(dialects){
  const patch=installNegotiation(Connection,dialects);
  const client=new Client({...options,signing:"required",encryption:"if-offered"});
  try{
   await client.connect();
   const dialect=patch.selected();
   if(!dialect)throw new Error("SMB dialect could not be verified");
   return {client,dialect};
  }catch(error){
   try{await client.close()}catch{}
   throw error;
  }finally{patch.restore()}
 }
 try{return await attempt(offer)}catch(error){
  // Some older servers reject negotiate contexts altogether. Retry once
  // on a fresh socket, only for explicit NEGOTIATE NOT_SUPPORTED, never auth.
  if(mode!=="auto"||Number(error?.status)!==0xc00000bb||!/^NEGOTIATE failed:/i.test(error.message||""))throw error;
  return attempt([DIALECTS["2.0.2"]]);
 }
}
export async function openNativeSmb(options,mode){
 const entry=import.meta.resolve("smb3-client");
 const [{Client},{Connection}]=await Promise.all([import(entry),import(new URL("./connection/connection.js",entry).href)]);
 return connectCompatible(Client,Connection,options,mode);
}

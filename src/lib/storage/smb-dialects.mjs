// Compatibility layer for the pinned smb3-client 0.2.0. Loaded only in the isolated worker.
const DIALECTS=Object.freeze({"2.0.2":0x0202,"2.1":0x0210,"3.0":0x0300,"3.0.2":0x0302,"3.1.1":0x0311});
export function dialectOffer(mode="auto"){
 if(mode==="auto")return Object.values(DIALECTS);
 if(!Object.hasOwn(DIALECTS,mode))throw new Error("Invalid SMB protocol selection");
 return [DIALECTS[mode]];
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
  if(result.dialect===0x0202){
   // SMB 2.0.2 reserves the wire CreditCharge field. Each operation still
   // consumes one local credit; the upstream sender signs the zero field.
   const send=this.send;
   if(typeof this.credits?.take!=="function")throw new Error("Incompatible SMB credit implementation");
   this.send=async function(command,body,opts={}){
    if(command!==0){await this.credits.take(1)}
    return send.call(this,command,body,{...opts,creditCharge:0});
   };
   // Do not advertise or issue multi-credit I/O on this dialect.
   result.maxReadSize=Math.min(result.maxReadSize,65536);
   result.maxWriteSize=Math.min(result.maxWriteSize,65536);
   result.maxTransactSize=Math.min(result.maxTransactSize,65536);
  }
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

declare module "@marsaud/smb2" {
 import { Readable, Writable } from "node:stream";
 interface Options { share:string; domain?:string; username:string; password:string; port?:number; autoCloseTimeout?:number; }
 export default class SMB2 { constructor(options:Options); readdir(path:string,options:unknown,cb:(error:Error|null,files?:Array<{name:string;isDirectory():boolean;isFile():boolean}> )=>void):void; stat(path:string,cb:(error:Error|null,stat?:{size:number;mtime:Date;isDirectory():boolean;isFile():boolean})=>void):void; mkdir(path:string,cb:(error?:Error|null)=>void):void; rename(a:string,b:string,cb:(error?:Error|null)=>void):void; unlink(path:string,cb:(error?:Error|null)=>void):void; rmdir(path:string,cb:(error?:Error|null)=>void):void; createReadStream(path:string):Readable; createWriteStream(path:string):Writable; close():void; }
}
declare module "ssh2-sftp-client" {
 import { Readable, Writable } from "node:stream";
 export interface ConnectOptions {host:string;port:number;username:string;password?:string;privateKey?:string;passphrase?:string;readyTimeout?:number;hostVerifier?:(key:Buffer)=>boolean;}
 export default class SftpClient { connect(o:ConnectOptions):Promise<void>; end():Promise<void>; list(path:string):Promise<Array<{name:string;type:string;size:number;modifyTime:number}>>; stat(path:string):Promise<{size:number;modifyTime:number;isDirectory:boolean;isFile:boolean}>; exists(path:string):Promise<false|string>; mkdir(path:string,recursive?:boolean):Promise<void>; rename(a:string,b:string):Promise<void>; delete(path:string):Promise<void>; rmdir(path:string,recursive?:boolean):Promise<void>; createReadStream(path:string):Readable; createWriteStream(path:string):Writable; utimes(path:string,atime:number,mtime:number):Promise<void>; }
}

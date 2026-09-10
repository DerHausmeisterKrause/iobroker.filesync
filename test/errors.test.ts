import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {isNotFoundError} from "../src/lib/storage/errors";
import {LocalStorageProvider} from "../src/lib/storage/local";

const roots:string[]=[];afterEach(async()=>{vi.restoreAllMocks();await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
describe("not-found handling",()=>{
 it("recognises only actual local, SFTP and SMB not-found codes",()=>{expect(isNotFoundError({code:"ENOENT"})).toBe(true);expect(isNotFoundError({code:2})).toBe(true);expect(isNotFoundError({status:"STATUS_OBJECT_NAME_NOT_FOUND"})).toBe(true);for(const code of ["EACCES","ECONNRESET","ETIMEDOUT","EHOSTUNREACH","AUTH_FAILED"])expect(isNotFoundError({code})).toBe(false)});
 it("returns undefined for a missing local file",async()=>{const basePath=await mkdtemp(path.join(tmpdir(),"filesync-errors-"));roots.push(basePath);const provider=new LocalStorageProvider({id:"00000000-0000-4000-8000-000000000001",name:"local",type:"local",enabled:true,readOnly:false,timeoutMs:1000,basePath});await expect(provider.statOrUndefined("missing")).resolves.toBeUndefined();await expect(provider.exists("missing")).resolves.toBe(false)});
 it.each(["EACCES","ECONNRESET","AUTH_FAILED"])("propagates %s rather than reporting absence",async code=>{const basePath=await mkdtemp(path.join(tmpdir(),"filesync-errors-"));roots.push(basePath);const provider=new LocalStorageProvider({id:"00000000-0000-4000-8000-000000000001",name:"local",type:"local",enabled:true,readOnly:false,timeoutMs:1000,basePath});const error=Object.assign(new Error(code),{code});vi.spyOn(provider,"stat").mockRejectedValue(error);await expect(provider.statOrUndefined("file")).rejects.toBe(error);await expect(provider.exists("file")).rejects.toBe(error)});
});

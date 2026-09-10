import {describe,expect,it,vi} from "vitest";
import {SftpStorageProvider} from "../src/lib/storage/sftp";

function provider(){
 const p=new SftpStorageProvider({id:"00000000-0000-4000-8000-000000000001",name:"sftp",type:"sftp",enabled:true,readOnly:false,timeoutMs:1000,host:"host",port:22,username:"user",auth:"password",credentialId:"credential",basePath:"/safe",hostFingerprint:"SHA256:test",allowInsecureHostKey:false},{});
 const api={realPath:vi.fn(),stat:vi.fn(),mkdir:vi.fn(),createWriteStream:vi.fn(),rename:vi.fn()};
 Object.assign(p as unknown as {c:unknown;realRoot:string},{c:api,realRoot:"/safe"});
 return {p,api};
}

describe("SFTP realPath confinement",()=>{
 it("treats an empty realPath result as a missing path",async()=>{const{p,api}=provider();api.realPath.mockResolvedValue("");await expect(p.statOrUndefined("new.txt")).resolves.toBeUndefined();expect(api.stat).not.toHaveBeenCalled()});
 it("walks to the nearest existing parent for a new nested target",async()=>{const{p,api}=provider();let created=false;api.mkdir.mockImplementation(async()=>{created=true});api.realPath.mockImplementation(async(value:string)=>value==="/safe"||created?value:"");await p.mkdir("new/nested");expect(api.realPath.mock.calls.map(([value])=>value)).toEqual(["/safe/new/nested","/safe/new","/safe","/safe/new/nested"]);expect(api.mkdir).toHaveBeenCalledWith("/safe/new/nested",true)});
 it("rejects a new path whose existing parent escapes through a symlink",async()=>{const{p,api}=provider();api.realPath.mockImplementation(async(value:string)=>value==="/safe/link"?"/outside":"");await expect(p.mkdir("link/new")).rejects.toThrow(/escape/i);expect(api.mkdir).not.toHaveBeenCalled()});
 it.each(["EACCES","ECONNRESET","ETIMEDOUT","AUTH_FAILED"])("does not disguise %s as not found",async code=>{const{p,api}=provider();const error=Object.assign(new Error(code),{code});api.realPath.mockRejectedValue(error);await expect(p.statOrUndefined("file")).rejects.toBe(error)})
});

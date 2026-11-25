
import {beforeEach,describe,expect,it,vi} from "vitest";
import {SmbStorageProvider} from "../src/lib/storage/smb";


const disconnect=vi.fn();
const readdir=vi.fn();
const stat=vi.fn();
const connect=vi.fn().mockResolvedValue(undefined);const client={connect,disconnect,readdir,stat};
const location={groupIds:[],id:"00000000-0000-4000-8000-000000000001",name:"smb",type:"smb" as const,enabled:true,readOnly:false,timeoutMs:1000,host:"server",port:445,share:"data",username:"user",basePath:"",credentialId:"00000000-0000-4000-8000-000000000002"};

describe("SMB provider",()=>{
 beforeEach(()=>{vi.clearAllMocks()});
 it("passes separate host/share credentials and connects explicitly",async()=>{const factory=vi.fn(()=>client as never);const provider=new SmbStorageProvider(location,{password:"secret"},factory);await provider.connect();expect(factory).toHaveBeenCalledWith({host:"server",share:"data",domain:"",username:"user",password:"secret",port:445,autoCloseTimeout:1000});expect(connect).toHaveBeenCalledOnce();await provider.disconnect()});
 it("passes an explicit protocol choice to the worker",async()=>{const factory=vi.fn(()=>client as never);const provider=new SmbStorageProvider({...location,dialect:"2.0.2"},{password:"secret"},factory);await provider.connect();expect(factory).toHaveBeenCalledWith(expect.objectContaining({dialect:"2.0.2"}));await provider.disconnect()});
 it("disconnects the SMB session rather than closing a file descriptor",async()=>{const provider=new SmbStorageProvider(location,{password:"secret"},()=>client as never);await provider.connect();await provider.disconnect();expect(disconnect).toHaveBeenCalledOnce()});
 it("treats readdir results as names and stats each entry",async()=>{readdir.mockResolvedValue(["folder","file.txt"]);stat.mockImplementation((name:string)=>Promise.resolve({size:name.endsWith("folder")?0:4,mtime:new Date(1000),isDirectory:()=>name.endsWith("folder")}));const provider=new SmbStorageProvider(location,{password:"secret"},()=>client as never);await provider.connect();await expect(provider.list("")).resolves.toEqual([{path:"folder",name:"folder",type:"directory",size:0,mtimeMs:1000},{path:"file.txt",name:"file.txt",type:"file",size:4,mtimeMs:1000}]);expect(stat).toHaveBeenCalledTimes(2)});
});

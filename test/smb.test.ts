import SMB2 from "@marsaud/smb2";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {SmbStorageProvider} from "../src/lib/storage/smb";

vi.mock("@marsaud/smb2",()=>({default:vi.fn()}));
const disconnect=vi.fn();
const readdir=vi.fn();
const stat=vi.fn();
const client={disconnect,readdir,stat};
const location={id:"00000000-0000-4000-8000-000000000001",name:"smb",type:"smb" as const,enabled:true,readOnly:false,timeoutMs:1000,host:"server",port:445,share:"data",username:"user",basePath:"",credentialId:"00000000-0000-4000-8000-000000000002"};

describe("SMB provider",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(SMB2).mockImplementation(()=>client as unknown as SMB2)});
 it("disconnects the SMB session rather than closing a file descriptor",async()=>{const provider=new SmbStorageProvider(location,{password:"secret"});await provider.connect();await provider.disconnect();expect(disconnect).toHaveBeenCalledOnce()});
 it("treats readdir results as names and stats each entry",async()=>{readdir.mockResolvedValue(["folder","file.txt"]);stat.mockImplementation((name:string)=>Promise.resolve({size:name.endsWith("folder")?0:4,mtime:new Date(1000),isDirectory:()=>name.endsWith("folder")}));const provider=new SmbStorageProvider(location,{password:"secret"});await provider.connect();await expect(provider.list("")).resolves.toEqual([{path:"folder",name:"folder",type:"directory",size:0,mtimeMs:1000},{path:"file.txt",name:"file.txt",type:"file",size:4,mtimeMs:1000}]);expect(stat).toHaveBeenCalledTimes(2)});
});

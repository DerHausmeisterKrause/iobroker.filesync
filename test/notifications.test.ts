import {mkdtemp,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {NotificationService,defaults,parsePreferences} from "../src/lib/notifications";
import type {AdapterConfig,Job,WebUser} from "../src/lib/types";
const roots:string[]=[];
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))});
async function setup(){
 const root=await mkdtemp(path.join(tmpdir(),"filesync-mail-"));roots.push(root);
 const user=(id:string,groupIds:string[],enabled=true):WebUser=>({id,username:id,displayName:id,admin:false,enabled,groupIds});
 const cfg={emailEnabled:true,emailInstance:"email.0",webUsers:[user("alice",["A"]),user("bob",["B"]),user("disabled",["A"],false)],webGroups:[{id:"A",enabled:true},{id:"B",enabled:true}],jobs:[{id:"job",name:"Backup",groupIds:["A"]} as Job]} as AdapterConfig;
 const send=vi.fn(async(_instance:string,_mail:{to:string;subject:string;text:string})=>undefined),warn=vi.fn();
 const service=new NotificationService(root,()=>cfg,send,warn);await service.load();
 return {root,cfg,service,send,warn};
}
describe("personal mail notifications",()=>{
 it("persists separate preferences and restricts recipients to currently authorized enabled users",async()=>{
  const {root,cfg,service,send,warn}=await setup();
  await Promise.all(cfg.webUsers.map(u=>service.save(u.id,parsePreferences({...defaults(),email:u.id+"@example.org",allJobs:true,failures:true}))));
  await service.notify("job","r1",false,false);
  expect(send).toHaveBeenCalledTimes(1);expect(send.mock.calls[0][1].to).toBe("alice@example.org");
  const restored=new NotificationService(root,()=>cfg,send,warn);await restored.load();expect(restored.get("bob").email).toBe("bob@example.org");
  expect((await stat(path.join(root,"notification-preferences.json"))).mode&0o777).toBe(0o600);
  cfg.webGroups[0].enabled=false;await restored.notify("job","r2",false,false);expect(send).toHaveBeenCalledTimes(1);
 });
 it("respects event subscriptions, cooldown, job selection and global enable",async()=>{
  const {cfg,service,send}=await setup();await service.save("alice",parsePreferences({...defaults(),email:"alice@example.org",jobIds:["job"],failures:true,recovery:true}));
  await service.notify("job","1",false,false);await service.notify("job","2",false,true);await service.notify("job","3",true,true);await service.notify("job","4",true,false);
  expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[1][1].subject).toContain("Wieder erfolgreich");
  cfg.emailEnabled=false;await service.notify("job","5",false,false);expect(send).toHaveBeenCalledTimes(2);
 });
 it("rejects multiple addresses and header injection",()=>{
  for(const email of ["a@example.org,b@example.org","a@example.org\nBcc: x@example.org","Name <a@example.org>"])expect(()=>parsePreferences({...defaults(),email,failures:true})).toThrow();
 });
 it("contains delivery failures rather than failing the run",async()=>{
  const {service,send,warn}=await setup();await service.save("alice",parsePreferences({...defaults(),email:"alice@example.org",allJobs:true,successes:true}));send.mockRejectedValueOnce(new Error("SMTP unavailable"));
  await service.notify("job","1",true,false);expect(warn).toHaveBeenCalledTimes(1);
 });
});

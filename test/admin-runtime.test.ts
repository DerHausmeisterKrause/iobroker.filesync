import {readFile} from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import {describe,expect,it} from "vitest";

const frontendCommands=["status","listLocations","listJobs","saveLocation","testLocation","browseLocation","saveJob","previewJob","runJob","getRunStatus","getRunItems"] as const;

async function sources(){
 const html=await readFile(path.join(process.cwd(),"admin/index_m.html"),"utf8");
 const main=await readFile(path.join(process.cwd(),"src/main.ts"),"utf8");
 return{html,main};
}

function callSource(html:string){
 const match=html.match(/function call\(command,message=\{\}\)\{[^\n]+\}/);
 if(!match)throw new Error("call() not found in legacy admin page");
 return match[0];
}

describe("legacy admin runtime",()=>{
 it("loads the official adapter settings helper in the required script order",async()=>{
  const {html}=await sources();
  const materialize=html.indexOf('../../lib/js/materialize.js');
  const translate=html.indexOf('../../js/translate.js');
  const settings=html.indexOf('../../js/adapter-settings.js');
  expect(materialize).toBeGreaterThan(0);
  expect(translate).toBeGreaterThan(materialize);
  expect(settings).toBeGreaterThan(translate);
 });

 it("rejects cleanly when the Admin sendTo API is absent",async()=>{
  const context=vm.createContext({adapterInstance:7});
  vm.runInContext(`${callSource((await sources()).html)};this.call=call`,context);
  await expect((context.call as (command:string)=>Promise<unknown>)("status")).rejects.toThrow("ioBroker Admin sendTo API is unavailable");
 });

 it("routes the complete Local-to-Local GUI command path through sendTo",async()=>{
  const {html,main}=await sources();
  const seen:Array<{target:string;command:string;message:unknown}>=[];
  const context=vm.createContext({adapterInstance:7,sendTo:(target:string,command:string,message:unknown,callback:(response:unknown)=>void)=>{seen.push({target,command,message});callback({ok:true,data:{command}})}});
  vm.runInContext(`${callSource(html)};this.call=call`,context);
  for(const command of frontendCommands)await (context.call as (command:string,message:unknown)=>Promise<unknown>)(command,{probe:true});
  expect(seen.map(item=>item.command)).toEqual(frontendCommands);
  expect(seen.every(item=>item.target==="filesync.7")).toBe(true);
  for(const command of frontendCommands)expect(main).toContain(`case"${command}"`);
 });

 it("guards Admin globals and sends schema-complete location and job objects",async()=>{
  const {html}=await sources();
  expect(html).toContain("typeof sendTo==='function'");
  expect(html).toContain("typeof instance!=='undefined'");
  expect(html).toContain("ioBroker Admin API konnte nicht geladen werden (sendTo unavailable).");
  for(const field of ["id","name","type","basePath","enabled","readOnly","timeoutMs"])expect(html).toMatch(new RegExp(`(?:${field}:|${field}[,}])`));
  for(const field of ["id","name","description","enabled","sourceLocationId","sourcePath","targetLocationId","targetPath","mode","mirrorDeleteConfirmed","dryRun","recursive","preserveTimestamps","hashCheck","stabilitySeconds","conflict","trigger","filters","retry","notificationGroupIds","createdAt","updatedAt"])expect(html).toMatch(new RegExp(`${field}:`));
 });
});

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {mkdtemp,rm} from "node:fs/promises";
import {chromium} from "playwright";
import {StandaloneWebServer} from "../../build/lib/web-server.js";
import {hashPassword} from "../../build/lib/web-auth.js";

const root=await mkdtemp(path.join(os.tmpdir(),"filesync-browser-"));
const group={id:"test",name:"Test",description:"",enabled:true,users:[],permissions:[],locationIds:[],jobIds:[]};
const cfg={configVersion:2,web:{enabled:true,port:0,secure:false,bind:"127.0.0.1",sessionTtlMinutes:60},webGroups:[group],webUsers:[{id:"admin",username:"admin",displayName:"Admin",enabled:true,admin:true,groupIds:[],passwordHash:await hashPassword("browser-password")}],locations:[],jobs:[],groups:[],notifications:[],maxConcurrentTransfers:2,healthIntervalSeconds:300,auditRetention:50,credentialVault:"{}"};
const api={config:()=>cfg,publicLocation:x=>({...x,target:x.basePath}),persistLocation:async x=>{const i=cfg.locations.findIndex(y=>y.id===x.id);i<0?cfg.locations.push(x):cfg.locations[i]=x;return x},deleteLocation:async()=>{},persistJob:async x=>{cfg.jobs.push(x);return x},deleteJob:async()=>{},testLocation:async()=>({}),browseLocation:async()=>({entries:[],hasMore:false}),startRun:()=>({}),run:()=>null,runs:()=>[],runItems:()=>[],status:()=>({version:"0.1.0",connected:true,webServer:true})};
const server=new StandaloneWebServer(api,path.resolve("web-dist"),false,60);let browser;
try{
 await server.start(0,"127.0.0.1");browser=await chromium.launch({headless:true});const page=await browser.newPage();const pageErrors=[],consoleErrors=[];
 page.on("pageerror",error=>pageErrors.push(error.message));page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text())});
 const responses=[];page.on("response",response=>{if(response.request().method()==="POST")responses.push([new URL(response.url()).pathname,response.status()])});
 await page.goto(`http://127.0.0.1:${server.port}`);await page.locator('[name="username"]').fill("admin");await page.locator('[name="password"]').fill("browser-password");await page.getByRole("button",{name:"Anmelden"}).click();
 await page.getByRole("button",{name:"Datenorte"}).click();await page.locator("#add-location").click();await page.locator(".modal").waitFor({state:"visible"});await page.locator('.modal [name="name"]').fill("Source");await page.locator('.modal [name="basePath"]').fill("/tmp/filesync-source");await page.locator('.modal button[type="submit"]').click();await page.getByText("Source",{exact:true}).waitFor();
 await page.locator("#add-location").click();await page.locator('.modal [name="name"]').fill("Target");await page.locator('.modal [name="basePath"]').fill("/tmp/filesync-target");await page.locator('.modal button[type="submit"]').click();await page.getByText("Target",{exact:true}).waitFor();
 await page.getByRole("button",{name:"Jobs"}).click();await page.locator("#add-job").click();await page.locator(".modal").waitFor({state:"visible"});assert.equal(await page.locator('.modal [name="dryRun"]').isChecked(),true);assert.deepEqual(await page.locator('.modal [name="sourceLocationId"] option').allTextContents(),["Bitte wählen","Source (LOCAL)","Target (LOCAL)"]);assert.deepEqual(await page.locator('.modal [name="targetLocationId"] option').allTextContents(),["Bitte wählen","Source (LOCAL)","Target (LOCAL)"]);await page.locator('.modal [name="name"]').fill("Source nach Target");await page.locator('.modal [name="sourceLocationId"]').selectOption({label:"Source (LOCAL)"});await page.locator('.modal [name="targetLocationId"]').selectOption({label:"Target (LOCAL)"});await page.locator('.modal button[type="submit"]').click();await page.getByText("Source nach Target",{exact:true}).waitFor();
 assert.deepEqual(responses.filter(x=>x[0]==="/api/locations"),[["/api/locations",201],["/api/locations",201]]);const locationList=await (await page.request.get(`http://127.0.0.1:${server.port}/api/locations`)).json();assert.deepEqual(locationList.data.map(x=>x.name),["Source","Target"]);assert.deepEqual(responses.filter(x=>x[0]==="/api/jobs"),[["/api/jobs",201]]);const jobList=await (await page.request.get(`http://127.0.0.1:${server.port}/api/jobs`)).json();assert.deepEqual(jobList.data.map(x=>x.name),["Source nach Target"]);assert.equal((await page.request.get(`http://127.0.0.1:${server.port}/app.js`)).headers()["cache-control"],"no-store");assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);
 console.log("Playwright browser smoke passed");
}finally{await browser?.close();await server.stop();await rm(root,{recursive:true,force:true})}

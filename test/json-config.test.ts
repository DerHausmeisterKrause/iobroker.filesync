import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("Admin JsonConfig schema regression",()=>{
 it("uses the current certificates collection control rather than an incomplete certificate control",()=>{
  const config=JSON.parse(readFileSync("admin/jsonConfig.json","utf8"));
  const controls=Object.values(config.items) as Array<Record<string,unknown>>;
  expect(config.items["web.certificates"]).toMatchObject({type:"certificates"});
  for(const control of controls)if(control.type==="certificate")expect(["public","private","chained"]).toContain(control.certType);
 });
});

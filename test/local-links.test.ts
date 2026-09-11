import {describe,expect,it} from "vitest";
import {localLinksEqual,localLinksForWeb} from "../src/lib/local-links";

describe("ioBroker localLinks",()=>{
 it("uses the configured HTTP port and leaves %ip% for Admin",()=>expect(localLinksForWeb({enabled:true,secure:false,port:8088})).toEqual({_default:{name:{en:"Open FileSync",de:"FileSync öffnen"},link:"http://%ip%:8088"}}));
 it("uses HTTPS and reflects a changed port",()=>{expect(localLinksForWeb({enabled:true,secure:true,port:9443})._default.link).toBe("https://%ip%:9443");expect(localLinksForWeb({enabled:true,secure:true,port:10443})._default.link).toBe("https://%ip%:10443")});
 it("removes a disabled/not-running link and avoids unchanged writes",()=>{expect(localLinksForWeb({enabled:false,secure:false,port:8095})).toEqual({});const links=localLinksForWeb({enabled:true,secure:false,port:8095});expect(localLinksEqual(structuredClone(links),links)).toBe(true);expect(localLinksEqual({},links)).toBe(false)});
});

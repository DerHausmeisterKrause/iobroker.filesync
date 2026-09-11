import type {WebConfig} from "./types";

export type FileSyncLocalLinks=Record<string,{name:{en:string;de:string};link:string}>;

export function localLinksForWeb(web:Pick<WebConfig,"enabled"|"secure"|"port">,running=true):FileSyncLocalLinks{
 if(!web.enabled||!running)return{};
 return{_default:{name:{en:"Open FileSync",de:"FileSync öffnen"},link:`${web.secure?"https":"http"}://%ip%:${web.port}`}};
}

export function localLinksEqual(current:unknown,wanted:FileSyncLocalLinks):boolean{
 return JSON.stringify(current??{})===JSON.stringify(wanted);
}

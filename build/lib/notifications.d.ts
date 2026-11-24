import type {AdapterConfig,Job,WebUser} from "./types";
export interface Preferences { email:string; failures:boolean; successes:boolean; recovery:boolean; allJobs:boolean; jobIds:string[]; cooldownMinutes:number }
export interface Mail { to:string; subject:string; text:string }
export declare function canNotify(user:WebUser,job:Job,cfg:AdapterConfig):boolean;
export declare function defaults():Preferences;
export declare function parsePreferences(raw:unknown):Preferences;
export declare class NotificationService {
 constructor(root:string,config:()=>AdapterConfig,send:(instance:string,mail:Mail)=>Promise<void>,warn:()=>void);
 load():Promise<void>;
 get(userId:string):Preferences;
 save(userId:string,pref:Preferences):Promise<Preferences>;
 notify(jobId:string,runId:string,success:boolean,wasFailed:boolean):Promise<void>;
}

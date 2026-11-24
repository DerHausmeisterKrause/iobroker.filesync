export type DeliveryStatus="pending"|"accepted"|"error";
export type DeliveryResult="accepted"|"error"|"limited"|"disabled"|"missing";
export interface DeliveryEntry {id:string;at:number;event:string;to:string;status:DeliveryStatus}
export declare class DeliveryJournal {
 constructor(root:string,warn:()=>void);
 load():Promise<void>;
 hasDigest(userId:string,kind:string,key:string):boolean;
 history(userId:string):DeliveryEntry[];
 deliver(userId:string,event:string,to:string,send:()=>Promise<void>,digest?:{kind:string;key:string}):Promise<DeliveryResult>;
}

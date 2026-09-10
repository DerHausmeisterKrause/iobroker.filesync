import type { FileMetadata } from "../types";
export interface PendingObservation { size:number; mtimeMs:number; observedAt:number }
export function stableSince(file:FileMetadata,pending:PendingObservation|undefined,windowMs:number,now=Date.now()):boolean{return windowMs===0||Boolean(pending&&pending.size===file.size&&pending.mtimeMs===file.mtimeMs&&now-pending.observedAt>=windowMs)}
export function targetNeedsRepair(source:FileMetadata,target:FileMetadata|undefined):boolean{return !target||source.size!==target.size}

export interface PendingRun { dryRun:boolean }
export class JobLock{
 private running=new Set<string>();private pending=new Map<string,PendingRun>();
 tryAcquire(id:string,dryRun:boolean){if(this.running.has(id)){const queued=this.pending.get(id);this.pending.set(id,{dryRun:Boolean(queued?.dryRun||dryRun)});return false}this.running.add(id);return true}
 release(id:string):PendingRun|undefined{this.running.delete(id);const invocation=this.pending.get(id);this.pending.delete(id);return invocation}
 count(){return this.running.size}queued(){return this.pending.size}clear(){this.running.clear();this.pending.clear()}
}

export interface PendingRun { realRequested:boolean; previewRequested:boolean }
export class JobLock{
 private running=new Set<string>();private pending=new Map<string,PendingRun>();
 tryAcquire(id:string,dryRun:boolean){if(this.running.has(id)){const queued=this.pending.get(id)??{realRequested:false,previewRequested:false};if(dryRun)queued.previewRequested=true;else queued.realRequested=true;this.pending.set(id,queued);return false}this.running.add(id);return true}
 release(id:string):PendingRun|undefined{this.running.delete(id);const invocation=this.pending.get(id);this.pending.delete(id);return invocation}
 count(){return this.running.size}queued(){return this.pending.size}clear(){this.running.clear();this.pending.clear()}
}

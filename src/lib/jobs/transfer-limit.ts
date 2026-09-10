export class TransferLimiter {
 private active=0;private closed=false;
 private readonly waiting:Array<{resolve:()=>void;reject:(error:Error)=>void}>=[];
 private readonly idleWaiters=new Set<()=>void>();
 constructor(private readonly concurrency:number,private readonly changed:()=>void=()=>undefined){if(!Number.isInteger(concurrency)||concurrency<1)throw new Error("Concurrency must be at least one")}
 get pendingCount(){return this.waiting.length}
 get activeCount(){return this.active}
 async run<T>(operation:()=>Promise<T>):Promise<T>{
  if(this.closed)throw new Error("Transfer limiter is closed");
  if(this.active>=this.concurrency)await new Promise<void>((resolve,reject)=>{this.waiting.push({resolve,reject});this.changed()});
  if(this.closed)throw new Error("Transfer limiter is closed");
  this.active++;this.changed();
  try{return await operation()}finally{this.active--;if(!this.closed)this.waiting.shift()?.resolve();if(this.active===0){for(const resolve of this.idleWaiters)resolve();this.idleWaiters.clear()}this.changed()}
 }
 close(){if(this.closed)return;this.closed=true;for(const waiter of this.waiting.splice(0))waiter.reject(new Error("Transfer limiter is closed"));this.changed()}
 async waitForIdle(timeoutMs:number){if(this.active===0)return;await Promise.race([new Promise<void>(resolve=>this.idleWaiters.add(resolve)),new Promise<void>(resolve=>setTimeout(resolve,timeoutMs))])}
}

export class TransferLimiter {
 private active=0;
 private readonly waiting:Array<()=>void>=[];
 constructor(private readonly concurrency:number,private readonly changed:()=>void=()=>undefined){if(!Number.isInteger(concurrency)||concurrency<1)throw new Error("Concurrency must be at least one")}
 get pendingCount(){return this.waiting.length}
 get activeCount(){return this.active}
 async run<T>(operation:()=>Promise<T>):Promise<T>{
  if(this.active>=this.concurrency)await new Promise<void>(resolve=>{this.waiting.push(resolve);this.changed()});
  this.active++;this.changed();
  try{return await operation()}finally{this.active--;this.waiting.shift()?.();this.changed()}
 }
}

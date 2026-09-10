/** A fair keyed mutex. Entries disappear as soon as the final waiter exits. */
export class TargetPathLock {
 private readonly tails=new Map<string,Promise<void>>();
 async run<T>(key:string,operation:()=>Promise<T>):Promise<T>{
  const previous=this.tails.get(key)??Promise.resolve();let release!:()=>void;
  const current=new Promise<void>(resolve=>{release=resolve});const tail=previous.then(()=>current);this.tails.set(key,tail);await previous;
  try{return await operation()}finally{release();if(this.tails.get(key)===tail)this.tails.delete(key)}
 }
 get size(){return this.tails.size}
}

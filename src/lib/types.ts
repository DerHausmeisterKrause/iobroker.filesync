export type LocationStatus = "online" | "offline" | "degraded" | "disabled";
export interface LocationBase { id:string; name:string; description?:string; enabled:boolean; readOnly:boolean; timeoutMs:number; }
export interface LocalLocation extends LocationBase { type:"local"; basePath:string; }
export interface SmbLocation extends LocationBase { type:"smb"; host:string; port:number; share:string; domain?:string; username:string; basePath:string; credentialId:string; }
export interface SftpLocation extends LocationBase { type:"sftp"; host:string; port:number; username:string; auth:"password"|"privateKey"; basePath:string; hostFingerprint:string; allowInsecureHostKey:boolean; credentialId:string; }
export type DataLocation = LocalLocation | SmbLocation | SftpLocation;
export interface SecretRecord { password?:string; privateKey?:string; passphrase?:string; }
export interface PublicLocation extends Omit<LocationBase,"type"> { type:DataLocation["type"]; target:string; hasPassword:boolean; hasPrivateKey:boolean; hasPassphrase:boolean; }
export interface FileMetadata { path:string; name:string; type:"file"|"directory"|"symlink"; size:number; mtimeMs:number; }
export type JobStatus = "idle"|"scanning"|"transferring"|"success"|"warning"|"error"|"paused"|"disabled";
export type Permission = "admin"|"locations.view"|"locations.edit"|"credentials.edit"|"jobs.view"|"jobs.create"|"jobs.edit"|"jobs.delete"|"jobs.run"|"jobs.pause"|"logs.view"|"notifications.edit";
export interface FileSyncGroup { id:string; name:string; users:string[]; permissions:Permission[]; locationIds:string[]; jobIds:string[]; }
export interface NotificationSettings { userId:string; email:string; emailInstance:string; failures:boolean; recovery:boolean; warnings:boolean; successes:boolean; cooldownMinutes:number; jobIds:string[]; }
export interface Job { id:string; name:string; description?:string; enabled:boolean; sourceLocationId:string; sourcePath:string; targetLocationId:string; targetPath:string; mode:"incremental"|"full"|"mirror"|"move"; mirrorDeleteConfirmed:boolean; dryRun:boolean; recursive:boolean; preserveTimestamps:boolean; hashCheck:boolean; stabilitySeconds:number; conflict:"changed"|"always"|"never"|"error"|"version"; trigger:{type:"change"|"interval"|"manual"; intervalSeconds:number}; filters:{include:string[];exclude:string[];minSize?:number;maxSize?:number}; retry:{attempts:number;baseDelayMs:number;exponential:boolean;maxDelayMs:number}; notificationGroupIds:string[]; createdAt:string; updatedAt:string; }
export interface AdapterConfig { configVersion:number; locations:DataLocation[]; jobs:Job[]; groups:FileSyncGroup[]; notifications:NotificationSettings[]; maxConcurrentTransfers:number; healthIntervalSeconds:number; auditRetention:number; credentialVault:string; }
export interface TransferResult { copied:number; overwritten:number; versioned:number; moved:number; skipped:number; failed:number; deleted:number; bytes:number; scanned:number; dryRun:boolean; totalActions:number; resultTruncated:boolean; items:Array<{path:string;action:string}>; }

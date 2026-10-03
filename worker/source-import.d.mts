import type {FileHandle} from 'node:fs/promises'
import type {SourceImportJob,SourceImportResult} from './source-import-protocol.mjs'
export function createSourceImportRuntime(options:{root:string;probe:(file:string)=>Promise<Partial<SourceImportResult['probe']>>;download?:(url:string,options:{handle:FileHandle;signal:AbortSignal;progress:(bytes:number)=>void})=>Promise<Omit<SourceImportResult,'managedPath'|'probe'|'legalClearance'>>}):{start:(request:unknown)=>Promise<SourceImportJob>;status:(query:{id:string})=>Promise<SourceImportJob>;cancel:(query:{id:string})=>Promise<SourceImportJob>}

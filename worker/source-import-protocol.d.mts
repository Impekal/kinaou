import type { z } from 'zod'
export interface SourceImportRequest { id:string;projectId:string;name:string;downloadUrl:string;sourcePageUrl:string;creator:string;permissionBasis:'own'|'permission'|'license';evidence:string;attribution:string;intendedUse:string;acquisitionConfirmed:true;reuseConfirmed:true;reviewedAt:string }
export interface SourceImportResult { managedPath:string;sizeBytes:number;sha256:string;requestedUrl:string;finalUrl:string;redirectUrls:string[];retrievedAt:string;mimeType:'video/mp4';legalClearance:false;probe:{path:string;sizeBytes:number;durationMs:number;width:number;height:number;videoCodec:string;audioCodec?:string;fps?:number;sampleRate?:number;channels?:number} }
export interface SourceImportJob { request:SourceImportRequest;state:'queued'|'downloading'|'probing'|'committing'|'succeeded'|'failed'|'cancelled';createdAt:string;updatedAt:string;receivedBytes:number;result?:SourceImportResult;error?:string }
export const sourceImportLimits:Readonly<{bytes:number;timeoutMs:number;redirects:number}>
export const sourceImportIdSchema:z.ZodType<string>
export const sourceImportRequestSchema:z.ZodType<SourceImportRequest>
export const sourceImportResultSchema:z.ZodType<SourceImportResult>
export const sourceImportJobSchema:z.ZodType<SourceImportJob>
export function sourceDownloadUrl(value:unknown):string
export function sourceImportPath(id:string):string
export function validateSourceImportJob(value:unknown,request?:SourceImportRequest):SourceImportJob

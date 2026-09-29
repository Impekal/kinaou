import { validateSourceArchiveQuery, validateSourceArchiveJob, sourceArchiveDirectory, sourceAssetPath, projectSourceLimits as limits } from './project-source-protocol.mjs'
const sha = /^[a-f0-9]{64}$/
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export function restoreDirectory(id) { sourceArchiveDirectory(id); return `KINAOU/Archive/RestoredProjects/${id}` }
export function validateSourceRestoreQuery(value) {
  if (value?.schemaVersion !== 1 || typeof value.evidenceSha256 !== 'string' || !sha.test(value.evidenceSha256)) throw Error('Invalid restoration evidence')
  restoreDirectory(value.restoreId)
  return { schemaVersion: 1, restoreId: value.restoreId, source: validateSourceArchiveQuery(value.source), evidenceSha256: value.evidenceSha256 }
}
export function validateSourceRestoreRequest(value) {
  const query = validateSourceRestoreQuery(value)
  if (value.acknowledgeIsolatedCopy !== true || !['de','en','fr'].includes(value.language)) throw Error('Explicit private isolated-copy acknowledgement required')
  return { ...query, acknowledgeIsolatedCopy: true, language: value.language }
}
/** Stable source binding; checking again changes the timestamp, not the reviewed bytes. */
export function sourceRestoreEvidence(value) {
  const job = validateSourceArchiveJob(value, value?.query)
  if (job.state !== 'ready') throw Error('A fully verified source archive is required')
  return JSON.stringify({ source: job.query, files: job.result.files.map(({ sourcePath, sizeBytes, sha256 }) => ({ sourcePath, sizeBytes, sha256 })) })
}
export function validateSourceRestoreJob(value, lookup) {
  const query = validateSourceRestoreQuery(lookup)
  if (value?.schemaVersion !== 1 || !same(validateSourceRestoreQuery(value.query), query) || !['unknown','queued','copying','ready','failed','interrupted','integrityFailed'].includes(value.state)) throw Error('Restoration response differs from request')
  const job = { schemaVersion: 1, query, state: value.state }
  if (value.error !== undefined) {
    if (typeof value.error !== 'string' || !value.error.trim() || value.error.length > 4000 || /[\x00-\x1f\x7f]/.test(value.error)) throw Error('Invalid restoration error')
    job.error = value.error
  }
  if (value.copiedFiles !== undefined) {
    if (!Number.isSafeInteger(value.copiedFiles) || value.copiedFiles < 0 || value.copiedFiles > limits.assets) throw Error('Invalid restoration progress')
    job.copiedFiles = value.copiedFiles
  }
  if (value.state === 'ready') {
    const r = value.result, base = restoreDirectory(query.restoreId), managedRoot = `${base}/source/KINAOU`
    if (!r || r.directory !== base || r.managedRoot !== managedRoot || r.projectPath !== `${managedRoot}/Projects/project.json` || typeof r.projectTitle !== 'string' || !r.projectTitle.trim() || r.projectTitle.length > 1000 || /[\x00-\x1f\x7f]/.test(r.projectTitle)
      || !Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.integrityCheckedAt)) || !Array.isArray(r.files) || r.files.length > limits.assets) throw Error('Invalid restoration result')
    const seen = new Set()
    const files = r.files.map(file => {
      const sourcePath = sourceAssetPath(file?.sourcePath)
      if (seen.has(sourcePath.toLowerCase()) || file.path !== `${base}/source/${sourcePath}` || typeof file.sha256 !== 'string' || !sha.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 || file.sizeBytes > limits.fileBytes) throw Error('Invalid restored media')
      seen.add(sourcePath.toLowerCase())
      return { sourcePath, path: file.path, sizeBytes: file.sizeBytes, sha256: file.sha256 }
    })
    if (!Number.isSafeInteger(r.totalBytes) || r.totalBytes < 0 || r.totalBytes > limits.totalBytes || files.reduce((n, f) => n + f.sizeBytes, 0) !== r.totalBytes) throw Error('Invalid restored media total')
    job.result = { directory: base, managedRoot, projectPath: r.projectPath, projectTitle: r.projectTitle, createdAt: r.createdAt, integrityCheckedAt: r.integrityCheckedAt, totalBytes: r.totalBytes, files }
  } else if (value.result !== undefined) throw Error('Incomplete restoration cannot have results')
  return job
}

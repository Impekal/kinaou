export const projectSourceLimits = { projectBytes: 5 * 1024 ** 2, requestBytes: 12 * 1024 ** 2, assets: 500, fileBytes: 8 * 1024 ** 3, totalBytes: 32 * 1024 ** 3, reserveBytes: 64 * 1024 ** 2 }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const sha = /^[a-f0-9]{64}$/
const bytes = value => new TextEncoder().encode(value).length
const integer = (value, max) => { if (!Number.isSafeInteger(value) || value < 0 || value > max) throw Error('Invalid source archive bound'); return value }
const text = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw Error('Invalid source archive text'); return value }
export function sourceArchiveDirectory(id) { if (typeof id !== 'string' || !uuid.test(id)) throw Error('Invalid source archive ID'); return `KINAOU/Archive/ProjectSources/${id}` }
export function sourceAssetPath(value) {
  text(value, 1024)
  const parts = value.split('/')
  if (bytes(value) > 1024 || parts.length < 3 || parts[0] !== 'KINAOU' || !['Assets','Renders'].includes(parts[1]) || value !== value.normalize('NFC')
    || parts.some(part => !part || part === '.' || part === '..' || bytes(part) > 255 || /[\\<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw Error('Registered media must use a safe KINAOU/Assets or KINAOU/Renders path')
  return value
}
/** Registered media only. Inline captions live in project JSON; never follow arbitrary metadata URLs/paths. */
export function sourceProjectInventory(projectText) {
  if (typeof projectText !== 'string' || !projectText || bytes(projectText) > projectSourceLimits.projectBytes || new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(projectText)) !== projectText) throw Error('Project document exceeds 5 MiB or has invalid Unicode')
  const project = JSON.parse(projectText)
  if (project?.schemaVersion !== 1 || !Array.isArray(project.assets) || project.assets.length > projectSourceLimits.assets || !Array.isArray(project.tracks) || !Array.isArray(project.storyboard)) throw Error('Invalid or oversized source project')
  text(project.id, 200); text(project.title, 1000)
  const ids = new Set(), paths = new Map(), folded = new Map()
  let inlineCaptions = 0
  for (const asset of project.assets) {
    const id = text(asset?.id, 200)
    if (ids.has(id) || asset.managed !== true || asset.offline === true) throw Error('All registered assets need unique IDs and available managed sources')
    ids.add(id)
    if (asset.kind === 'caption' && asset.uri === `kinaou://caption/${id}` && typeof asset.metadata?.text === 'string') { inlineCaptions++; continue }
    const uri = sourceAssetPath(asset.uri), lower = uri.toLowerCase()
    if (folded.has(lower) && folded.get(lower) !== uri) throw Error('Case-colliding source media paths')
    folded.set(lower, uri); paths.set(uri, true)
  }
  for (const uri of paths.keys()) { const parts = uri.toLowerCase().split('/'); for (let index = 2; index < parts.length; index++) if (folded.has(parts.slice(0, index).join('/'))) throw Error('Conflicting source file/directory paths') }
  return { projectId: project.id, title: project.title, assetCount: project.assets.length, inlineCaptions, paths: [...paths.keys()].sort() }
}
export function validateSourceArchiveQuery(value) {
  if (value?.schemaVersion !== 1 || typeof value.requestId !== 'string' || !uuid.test(value.requestId) || typeof value.projectSha256 !== 'string' || !sha.test(value.projectSha256)) throw Error('Invalid source archive lookup')
  return { schemaVersion: 1, requestId: value.requestId, projectId: text(value.projectId, 200), projectSha256: value.projectSha256 }
}
export function validateSourceArchiveRequest(value) {
  const query = validateSourceArchiveQuery(value)
  if (value.acknowledgePrivateArchive !== true || !['de','en','fr'].includes(value.language)) throw Error('Explicit private source archive acknowledgement and language required')
  const inventory = sourceProjectInventory(value.projectText)
  if (inventory.projectId !== query.projectId) throw Error('Source archive project mismatch')
  return { ...query, acknowledgePrivateArchive: true, language: value.language, projectText: value.projectText }
}
export function validateSourceArchiveJob(value, lookup) {
  const query = validateSourceArchiveQuery(lookup)
  if (value?.schemaVersion !== 1 || JSON.stringify(validateSourceArchiveQuery(value.query)) !== JSON.stringify(query) || !['unknown','queued','copying','ready','failed','interrupted','integrityFailed'].includes(value.state)) throw Error('Source archive response does not match lookup')
  const job = { schemaVersion: 1, query, state: value.state }
  if (value.copiedFiles !== undefined) job.copiedFiles = integer(value.copiedFiles, projectSourceLimits.assets)
  if (value.error !== undefined) job.error = text(value.error, 4000)
  if (value.state === 'ready') {
    const result = value.result, base = sourceArchiveDirectory(query.requestId)
    if (!result || result.scope !== 'project-registered-assets-v1' || result.directory !== base || result.projectPath !== `${base}/source/KINAOU/Projects/project.json` || result.manifestPath !== `${base}/manifest.json`
      || result.projectSha256 !== query.projectSha256 || !Array.isArray(result.files) || result.files.length > projectSourceLimits.assets || !Number.isFinite(Date.parse(result.createdAt)) || !Number.isFinite(Date.parse(result.integrityCheckedAt))) throw Error('Invalid source archive result')
    const seen = new Set()
    const files = result.files.map(file => {
      const sourcePath = sourceAssetPath(file?.sourcePath)
      if (seen.has(sourcePath.toLowerCase()) || file.path !== `${base}/source/${sourcePath}` || typeof file.sha256 !== 'string' || !sha.test(file.sha256)) throw Error('Invalid source archive file')
      seen.add(sourcePath.toLowerCase())
      return { sourcePath, path: file.path, sizeBytes: integer(file.sizeBytes, projectSourceLimits.fileBytes), sha256: file.sha256 }
    })
    const totalBytes = integer(result.totalBytes, projectSourceLimits.totalBytes)
    if (files.reduce((sum, file) => sum + file.sizeBytes, 0) !== totalBytes) throw Error('Source archive total differs')
    job.result = { scope: result.scope, directory: base, projectPath: result.projectPath, manifestPath: result.manifestPath, projectSha256: query.projectSha256, createdAt: result.createdAt, integrityCheckedAt: result.integrityCheckedAt, totalBytes, files }
  } else if (value.result !== undefined) throw Error('Incomplete source archive cannot have a completed result')
  return job
}

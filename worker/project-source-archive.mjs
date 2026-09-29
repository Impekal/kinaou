import crypto from 'node:crypto'
import path from 'node:path'
import { constants } from 'node:fs'
import { lstat, realpath, mkdir, open, opendir, statfs, rename, link, unlink } from 'node:fs/promises'
import { projectSourceLimits as limits, sourceArchiveDirectory, sourceProjectInventory, validateSourceArchiveQuery, validateSourceArchiveRequest, validateSourceArchiveJob } from './project-source-protocol.mjs'
import { validateSourceLibraryQuery, validateSourceLibraryPage } from './project-source-library-protocol.mjs'

const now = () => new Date().toISOString()
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const stable = (before, after) => ['size','mtimeMs','ctimeMs','dev','ino'].every(key => before[key] === after[key])
const failure = error => String(error?.message ?? error).replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 4000) || 'Source archive failed'
async function canonical(root) {
  const resolved = await realpath(root)
  if (path.basename(resolved) !== 'KINAOU') throw Error('Invalid managed source root')
  return resolved
}
async function directory(root, parts, create = false) {
  let folder = root
  for (const part of parts) {
    folder = path.join(folder, part)
    if (create) await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(folder)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(folder) !== folder) throw Error('Unsafe source archive directory')
  }
  return folder
}
async function opened(root, parts, max) {
  const folder = await directory(root, parts.slice(0, -1)), file = path.join(folder, parts.at(-1))
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat(), present = await lstat(file)
    if (!info.isFile() || !present.isFile() || info.dev !== present.dev || info.ino !== present.ino || await realpath(file) !== file || !Number.isSafeInteger(info.size) || info.size < 0 || info.size > max) throw Error('Unsafe, changed or oversized source archive file')
    return { handle, info }
  } catch (error) { await handle.close(); throw error }
}
async function readRecord(root, parts, max = 2 * 1024 ** 2) {
  const { handle, info } = await opened(root, parts, max)
  try {
    const buffer = Buffer.alloc(info.size)
    for (let offset = 0; offset < buffer.length;) { const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset); if (!bytesRead) throw Error('Truncated archive record'); offset += bytesRead }
    if (!stable(info, await handle.stat())) throw Error('Archive record changed while reading')
    return buffer
  } finally { await handle.close() }
}
async function hashFile(root, parts, size) {
  const { handle, info } = await opened(root, parts, limits.fileBytes)
  try {
    if (info.size !== size) throw Error('Source archive file size differs')
    const digest = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 ** 2)
    for (let offset = 0; offset < size;) { const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - offset), offset); if (!bytesRead) throw Error('Truncated archive payload'); digest.update(buffer.subarray(0, bytesRead)); offset += bytesRead }
    if (!stable(info, await handle.stat())) throw Error('Archive payload changed while hashing')
    return digest.digest('hex')
  } finally { await handle.close() }
}
async function writeExclusive(folder, parts, bytes) {
  const parent = await directory(folder, parts.slice(0, -1), true), file = path.join(parent, parts.at(-1)), buffer = Buffer.from(bytes)
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(buffer); await handle.sync() } finally { await handle.close() }
  const sha256 = hash(buffer)
  if (await hashFile(folder, parts, buffer.length) !== sha256) throw Error('Archive record readback differs')
  return { name: parts.join('/'), sizeBytes: buffer.length, sha256 }
}
async function writeStatus(folder, job) {
  await writeExclusive(folder, ['status.next.json'], JSON.stringify(job))
  await rename(path.join(folder, 'status.next.json'), path.join(folder, 'status.json'))
}
const readme = {
  en: 'PRIVATE KINAOU PROJECT + REGISTERED MEDIA\nProject document and registered managed assets only; inline captions remain in the document. Not a full-machine, model, browser-history/settings or credential backup. Unregistered exports, external evidence/references and arbitrary metadata paths are not followed. No global filesystem snapshot or teaching approval. Keep private: scripts, answers, identity/voice provenance and paths may be included. Do not replace your live KINAOU root with this folder. Verify hashes and test restoration in a separate root first.\n',
  de: 'PRIVATE KINAOU-PROJEKT- UND MEDIENSICHERUNG\nNur Projektdokument und registrierte verwaltete Medien; Inline-Untertitel bleiben im Dokument. Keine Komplettsicherung von Rechner, Modellen, Browserverlauf/Einstellungen oder Zugangsdaten. Nicht registrierte Exporte, externe Nachweise/Referenzen und beliebige Metadatenpfade werden nicht verfolgt. Kein globaler Dateisystem-Snapshot oder fachliche Freigabe. Privat halten: Skripte, Lösungen, Identitäts-/Stimmnachweise und Pfade können enthalten sein. Nicht deinen aktiven KINAOU-Ordner ersetzen. Hashes prüfen und Wiederherstellung zuerst in getrenntem Speicher testen.\n',
  fr: 'ARCHIVE PRIVÉE KINAOU : PROJET ET MÉDIAS ENREGISTRÉS\nDocument du projet et médias gérés enregistrés uniquement ; sous-titres internes dans le document. Ni sauvegarde complète de machine, modèles, historique/réglages du navigateur ou identifiants. Exports non enregistrés, preuves/références externes et chemins arbitraires des métadonnées non suivis. Ni instantané global du disque ni validation pédagogique. Garder privé : scripts, réponses, provenance identitaire/vocale et chemins possibles. Ne remplacez pas votre dossier KINAOU actif. Vérifiez les empreintes et testez la restauration séparément.\n'
}
// Internal filesystem primitives shared with isolated restoration; never exposed as routes.
export const sourceArchiveIO = { canonical, directory, opened, readRecord, hashFile, writeExclusive, writeStatus, stable, hash, failure, equal, now }
export function createProjectSourceArchiveRuntime({ root }) {
  const active = new Map()
  async function folderFor(id, create = false) {
    const base = await canonical(root), parent = await directory(base, ['Archive','ProjectSources'], create)
    return create ? path.join(parent, id) : directory(parent, [id])
  }
  async function diskStatus(query) {
    let folder
    try { folder = await folderFor(query.requestId) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, query, state: 'unknown' }; throw error }
    let request
    try { request = JSON.parse((await readRecord(folder, ['request.json'])).toString('utf8')) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, query, state: 'interrupted', error: 'Reserved directory has no complete request; never overwrite it' }; throw error }
    if (!equal(validateSourceArchiveQuery(request), query) || !['de','en','fr'].includes(request.language) || request.acknowledgePrivateArchive !== true) throw Error('Source archive lookup conflicts with retained request')
    let manifest
    try { manifest = JSON.parse((await readRecord(folder, ['manifest.json'])).toString('utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (manifest) {
      try {
        const job = validateSourceArchiveJob(manifest.job, query), result = job.result
        if (manifest.kind !== 'private-project-registered-assets' || job.state !== 'ready' || !Array.isArray(manifest.records) || manifest.records.length !== 2) throw Error('Invalid source archive completion record')
        const projectBytes = await readRecord(folder, ['source','KINAOU','Projects','project.json'], limits.projectBytes)
        if (hash(projectBytes) !== query.projectSha256) throw Error('Archived project document hash differs')
        const inventory = sourceProjectInventory(projectBytes.toString('utf8'))
        if (inventory.projectId !== query.projectId || !equal(inventory.paths, result.files.map(file => file.sourcePath))) throw Error('Archived media set differs from registered assets')
        for (const file of result.files) if (await hashFile(folder, ['source', ...file.sourcePath.split('/')], file.sizeBytes) !== file.sha256) throw Error('Archived media hash differs')
        for (const [index, name] of ['README.txt','SHA256SUMS'].entries()) {
          const record = manifest.records[index]
          if (record?.name !== name || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 1 || record.sizeBytes > 1024 ** 2 || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)
            || hash(await readRecord(folder, [name])) !== record.sha256) throw Error('Archive information record differs')
        }
        return { ...job, result: { ...result, projectTitle: inventory.title, integrityCheckedAt: now() } }
      } catch (error) { return { schemaVersion: 1, query, state: 'integrityFailed', error: failure(error) } }
    }
    let status
    try { status = validateSourceArchiveJob(JSON.parse((await readRecord(folder, ['status.json'])).toString('utf8')), query) } catch (error) { if (error.code !== 'ENOENT') throw error }
    return status?.state === 'failed' ? status : { schemaVersion: 1, query, state: 'interrupted', error: 'No completed archive; no automatic resume or overwrite' }
  }
  async function snapshot(entry) {
    await entry.started
    if (['ready','failed'].includes(entry.job.state)) { await entry.finished; if (entry.job.state === 'ready') return diskStatus(entry.query) }
    return structuredClone(entry.job)
  }
  async function execute(entry, folder) {
    const { request, query } = entry, base = sourceArchiveDirectory(query.requestId)
    try {
      const canonicalRoot = await canonical(root), inventory = sourceProjectInventory(request.projectText), sources = []
      let totalBytes = 0
      for (const uri of inventory.paths) {
        const source = await opened(canonicalRoot, uri.split('/').slice(1), limits.fileBytes)
        try { totalBytes += source.info.size; sources.push({ uri, info: source.info }) } finally { await source.handle.close() }
        if (totalBytes > limits.totalBytes) throw Error('Registered media exceeds 32 GiB')
      }
      const disk = await statfs(folder)
      if (disk.bavail * disk.bsize < totalBytes + Buffer.byteLength(request.projectText) + limits.reserveBytes) throw Error('Not enough free space for source archive plus 64 MiB reserve')
      await writeExclusive(folder, ['source','KINAOU','Projects','project.json'], request.projectText)
      const files = []
      for (const source of sources) {
        entry.job = { schemaVersion: 1, query, state: 'copying', copiedFiles: files.length }; await writeStatus(folder, entry.job)
        const input = await opened(canonicalRoot, source.uri.split('/').slice(1), limits.fileBytes)
        let output
        try {
          if (!stable(source.info, input.info)) throw Error('Source changed after archive preflight')
          const parts = ['source', ...source.uri.split('/')], parent = await directory(folder, parts.slice(0, -1), true)
          output = await open(path.join(parent, parts.at(-1)), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
          const digest = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 ** 2)
          for (let offset = 0; offset < input.info.size;) {
            const { bytesRead } = await input.handle.read(buffer, 0, Math.min(buffer.length, input.info.size - offset), offset)
            if (!bytesRead) throw Error('Source truncated during archive copy')
            digest.update(buffer.subarray(0, bytesRead))
            let written = 0
            while (written < bytesRead) { const { bytesWritten } = await output.write(buffer, written, bytesRead - written, offset + written); if (!bytesWritten) throw Error('Archive copy made no progress'); written += bytesWritten }
            offset += bytesRead
          }
          if (!stable(input.info, await input.handle.stat())) throw Error('Source changed while copying')
          await output.sync(); await output.close(); output = undefined
          const sha256 = digest.digest('hex')
          if (await hashFile(folder, parts, input.info.size) !== sha256) throw Error('Archive media readback hash differs')
          files.push({ sourcePath: source.uri, path: `${base}/${parts.join('/')}`, sizeBytes: input.info.size, sha256 })
        } finally { await input.handle.close(); await output?.close() }
      }
      const sums = [`${query.projectSha256}  source/KINAOU/Projects/project.json`, ...files.map(file => `${file.sha256}  source/${file.sourcePath}`)].join('\n') + '\n'
      const records = [await writeExclusive(folder, ['README.txt'], readme[request.language]), await writeExclusive(folder, ['SHA256SUMS'], sums)]
      const result = { scope: 'project-registered-assets-v1', directory: base, projectPath: `${base}/source/KINAOU/Projects/project.json`, manifestPath: `${base}/manifest.json`, projectSha256: query.projectSha256, createdAt: now(), integrityCheckedAt: now(), totalBytes, files }
      const job = validateSourceArchiveJob({ schemaVersion: 1, query, state: 'ready', result }, query)
      await writeExclusive(folder, ['manifest.next.json'], JSON.stringify({ kind: 'private-project-registered-assets', job, records }))
      await link(path.join(folder, 'manifest.next.json'), path.join(folder, 'manifest.json')); await unlink(path.join(folder, 'manifest.next.json'))
      entry.job = job; await writeStatus(folder, job)
    } catch (error) {
      entry.job = { schemaVersion: 1, query, state: 'failed', error: failure(error) }
      await writeStatus(folder, entry.job).catch(() => {}) // Incomplete files remain; never delete sources or restart.
    } finally { active.delete(query.requestId) }
  }
  return {
    async list(value) {
      const input = validateSourceLibraryQuery(value), page = { schemaVersion: 1, ...input, entries: [], scanned: 0, skipped: 0 }
      const base = await canonical(root) // Missing/disconnected root is an error, not an empty library.
      let parent
      try { parent = await directory(base, ['Archive', 'ProjectSources']) }
      catch (error) { if (error.code === 'ENOENT') return page; throw error }
      const ids = []; let count = 0
      for await (const item of await opendir(parent)) {
        if (++count > 10000) throw Error('Source archive library exceeds 10000 entries; inspect known folders manually')
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.name) && (!input.after || item.name > input.after)) ids.push(item.name)
      }
      ids.sort(); const selected = ids.slice(0, 20)
      if (ids.length > selected.length) page.nextCursor = selected.at(-1)
      for (const requestId of selected) {
        page.scanned++
        try {
          const folder = await folderFor(requestId)
          const retained = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readRecord(folder, ['request.json'], 4096)))
          const query = validateSourceArchiveQuery(retained)
          if (query.requestId !== requestId || retained.acknowledgePrivateArchive !== true || !['de', 'en', 'fr'].includes(retained.language)) throw Error('Archive request differs from directory')
          let hasCompletionRecord = false
          try { const info = await lstat(path.join(folder, 'manifest.json')); hasCompletionRecord = info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= 2 * 1024 ** 2 }
          catch (error) { if (error.code !== 'ENOENT') throw error }
          let titleHint
          try {
            const document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readRecord(folder, ['source', 'KINAOU', 'Projects', 'project.json'], limits.projectBytes)))
            if (document?.id === query.projectId && typeof document.title === 'string' && document.title.trim() && document.title.length <= 1000 && !/[\x00-\x1f\x7f]/.test(document.title)) titleHint = document.title
          } catch { /* Missing/unsafe project metadata does not hide a recoverable request. */ }
          page.entries.push({ query, hasCompletionRecord, ...(titleHint === undefined ? {} : { titleHint }) })
        } catch { page.skipped++ } // Discovery never repairs, removes, hashes payloads or follows unsafe records.
      }
      return validateSourceLibraryPage(page, input)
    },
    async start(value) {
      const request = validateSourceArchiveRequest(value), query = validateSourceArchiveQuery(request)
      if (hash(request.projectText) !== query.projectSha256) throw Error('Submitted project hash differs')
      const previous = active.get(query.requestId)
      if (previous) { if (!equal(previous.request, request)) throw Error('Archive ID conflicts'); return snapshot(previous) }
      if (active.size) throw Error('Only one source archive may copy at a time')
      const entry = { request, query, job: { schemaVersion: 1, query, state: 'queued' } }; active.set(query.requestId, entry)
      entry.started = (async () => {
        const folder = await folderFor(query.requestId, true)
        try { await mkdir(folder, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error; entry.job = await diskStatus(query); active.delete(query.requestId); return }
        await writeExclusive(folder, ['request.json'], JSON.stringify({ ...query, language: request.language, acknowledgePrivateArchive: true }))
        await writeStatus(folder, entry.job); entry.finished = execute(entry, folder)
      })()
      try { return await snapshot(entry) } catch (error) { active.delete(query.requestId); throw error }
    },
    async status(value) {
      const query = validateSourceArchiveQuery(value), entry = active.get(query.requestId)
      if (entry) { if (!equal(entry.query, query)) throw Error('Archive lookup conflicts'); return snapshot(entry) }
      return diskStatus(query)
    }
  }
}

import crypto from 'node:crypto'
import path from 'node:path'
import { constants } from 'node:fs'
import { mkdir, open, statfs, link, unlink } from 'node:fs/promises'
import { createProjectSourceArchiveRuntime, sourceArchiveIO as io } from './project-source-archive.mjs'
import { sourceArchiveDirectory, sourceProjectInventory, projectSourceLimits as limits } from './project-source-protocol.mjs'
import { restoreDirectory, sourceRestoreEvidence, validateSourceRestoreQuery, validateSourceRestoreRequest, validateSourceRestoreJob } from './project-source-restore-protocol.mjs'
const description = {
  de: 'PRIVATE ISOLIERTE KINAOU-ARBEITSKOPIE\nNur gesichertes Projektdokument und registrierte Medien. Modelle, Browserzustand und externe Referenzen fehlen. Kein aktiver Speicher wurde ersetzt. Vor produktiver Verwendung separat prüfen. Das Originalarchiv unverändert behalten. Hashprüfung ist eine Momentaufnahme; spätere Bearbeitungen ändern diese Kopie.\n',
  en: 'PRIVATE ISOLATED KINAOU WORKING COPY\nArchived project document and registered media only. Models, browser state and external references are excluded. No active storage was replaced. Verify separately before production use. Keep the original archive unchanged. Hash verification is point-in-time; later editing changes this copy.\n',
  fr: 'COPIE DE TRAVAIL KINAOU PRIVÉE ET ISOLÉE\nDocument archivé et médias enregistrés uniquement. Modèles, état du navigateur et références externes exclus. Aucun stockage actif remplacé. Vérifiez séparément avant utilisation. Gardez l’archive originale intacte. La vérification est ponctuelle ; les modifications ultérieures changent cette copie.\n'
}
export function createProjectSourceRestoreRuntime({ root, sourceRuntime = createProjectSourceArchiveRuntime({ root }) }) {
  const active = new Map()
  const projectParts = ['source', 'KINAOU', 'Projects', 'project.json']
  async function folderFor(id, create = false) {
    const base = await io.canonical(root), parent = await io.directory(base, ['Archive', 'RestoredProjects'], create)
    return create ? path.join(parent, id) : io.directory(parent, [id])
  }
  async function diskStatus(query) {
    await io.canonical(root) // An unavailable storage root must not look like an unused ID.
    let folder
    try { folder = await folderFor(query.restoreId) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, query, state: 'unknown' }; throw error }
    let retained
    try { retained = validateSourceRestoreRequest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await io.readRecord(folder, ['request.json'], 4096)))) }
    catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, query, state: 'interrupted', error: 'Reserved restoration directory has no complete request; never overwrite it' }; throw error }
    if (!io.equal(validateSourceRestoreQuery(retained), query)) throw Error('Restoration ID conflicts with retained request')
    let manifest
    try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await io.readRecord(folder, ['manifest.json']))) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (manifest) {
      try {
        const job = validateSourceRestoreJob(manifest.job, query), result = job.result
        if (manifest.kind !== 'isolated-project-source-restoration-v1' || job.state !== 'ready' || !Array.isArray(manifest.records) || manifest.records.length !== 2) throw Error('Invalid restoration manifest')
        const bytes = await io.readRecord(folder, projectParts, limits.projectBytes)
        if (io.hash(bytes) !== query.source.projectSha256) throw Error('Restored project document hash differs')
        const inventory = sourceProjectInventory(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        if (inventory.projectId !== query.source.projectId || inventory.title !== result.projectTitle || !io.equal(inventory.paths, result.files.map(file => file.sourcePath))) throw Error('Restored project inventory differs')
        const evidence = JSON.stringify({ source: query.source, files: result.files.map(({ sourcePath, sizeBytes, sha256 }) => ({ sourcePath, sizeBytes, sha256 })) })
        if (io.hash(evidence) !== query.evidenceSha256) throw Error('Restored media differs from reviewed source evidence')
        for (const file of result.files) if (await io.hashFile(folder, ['source', ...file.sourcePath.split('/')], file.sizeBytes) !== file.sha256) throw Error('Restored media hash differs')
        for (const [index, name] of ['README.txt', 'SHA256SUMS'].entries()) {
          const record = manifest.records[index]
          const bytes = await io.readRecord(folder, [name], 1024 ** 2)
          if (record?.name !== name || record.sizeBytes !== bytes.length || io.hash(bytes) !== record.sha256) throw Error('Restoration information record differs')
        }
        return { ...job, result: { ...result, integrityCheckedAt: io.now() } }
      } catch (error) { return { schemaVersion: 1, query, state: 'integrityFailed', error: io.failure(error) } }
    }
    let status
    try { status = validateSourceRestoreJob(JSON.parse((await io.readRecord(folder, ['status.json'])).toString('utf8')), query) } catch (error) { if (error.code !== 'ENOENT') throw error }
    return status?.state === 'failed' ? status : { schemaVersion: 1, query, state: 'interrupted', error: 'No completed restoration; partial copies are never resumed or overwritten' }
  }
  async function snapshot(entry) {
    await entry.started
    if (['ready','failed'].includes(entry.job.state)) { await entry.finished; if (entry.job.state === 'ready') return diskStatus(entry.query) }
    return structuredClone(entry.job)
  }
  async function execute(entry, folder, sourceJob, canonicalRoot) {
    const { query, request } = entry, base = restoreDirectory(query.restoreId)
    try {
      const sourceFolder = await io.directory(canonicalRoot, sourceArchiveDirectory(query.source.requestId).split('/').slice(1))
      const projectBytes = await io.readRecord(sourceFolder, projectParts, limits.projectBytes)
      if (io.hash(projectBytes) !== query.source.projectSha256) throw Error('Source project changed after verification')
      const inventory = sourceProjectInventory(new TextDecoder('utf-8', { fatal: true }).decode(projectBytes))
      const disk = await statfs(folder)
      if (disk.bavail * disk.bsize < sourceJob.result.totalBytes + projectBytes.length + limits.reserveBytes) throw Error('Not enough space for isolated restoration plus 64 MiB reserve')
      await io.writeExclusive(folder, projectParts, projectBytes)
      const files = []
      for (const expected of sourceJob.result.files) {
        entry.job = { schemaVersion: 1, query, state: 'copying', copiedFiles: files.length }; await io.writeStatus(folder, entry.job)
        const parts = ['source', ...expected.sourcePath.split('/')], input = await io.opened(sourceFolder, parts, limits.fileBytes)
        let output
        try {
          if (input.info.size !== expected.sizeBytes) throw Error('Source size changed after verification')
          const parent = await io.directory(folder, parts.slice(0, -1), true)
          output = await open(path.join(parent, parts.at(-1)), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
          const digest = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(1024 ** 2)
          for (let offset = 0; offset < input.info.size;) {
            const { bytesRead } = await input.handle.read(buffer, 0, Math.min(buffer.length, input.info.size - offset), offset)
            if (!bytesRead) throw Error('Source truncated during restoration')
            digest.update(buffer.subarray(0, bytesRead))
            let written = 0
            while (written < bytesRead) { const { bytesWritten } = await output.write(buffer, written, bytesRead - written, offset + written); if (!bytesWritten) throw Error('Restoration copy made no progress'); written += bytesWritten }
            offset += bytesRead
          }
          if (!io.stable(input.info, await input.handle.stat()) || digest.digest('hex') !== expected.sha256) throw Error('Source changed while restoring')
          await output.sync(); await output.close(); output = undefined
          if (await io.hashFile(folder, parts, expected.sizeBytes) !== expected.sha256) throw Error('Restored media readback differs')
          files.push({ ...expected, path: `${base}/${parts.join('/')}` })
        } finally { await input.handle.close(); await output?.close() }
      }
      const sums = [`${query.source.projectSha256}  source/KINAOU/Projects/project.json`, ...files.map(file => `${file.sha256}  source/${file.sourcePath}`)].join('\n') + '\n'
      const records = [await io.writeExclusive(folder, ['README.txt'], description[request.language]), await io.writeExclusive(folder, ['SHA256SUMS'], sums)]
      const result = { directory: base, managedRoot: `${base}/source/KINAOU`, projectPath: `${base}/source/KINAOU/Projects/project.json`, projectTitle: inventory.title, createdAt: io.now(), integrityCheckedAt: io.now(), totalBytes: sourceJob.result.totalBytes, files }
      const job = validateSourceRestoreJob({ schemaVersion: 1, query, state: 'ready', result }, query)
      await io.writeExclusive(folder, ['manifest.next.json'], JSON.stringify({ kind: 'isolated-project-source-restoration-v1', job, records }))
      await link(path.join(folder, 'manifest.next.json'), path.join(folder, 'manifest.json')); await unlink(path.join(folder, 'manifest.next.json'))
      entry.job = job; await io.writeStatus(folder, job)
    } catch (error) {
      entry.job = { schemaVersion: 1, query, state: 'failed', error: io.failure(error) }
      await io.writeStatus(folder, entry.job).catch(() => {}) // Preserve partial copies and original archive.
    } finally { active.delete(query.restoreId) }
  }
  return {
    async start(value) {
      const request = validateSourceRestoreRequest(value), query = validateSourceRestoreQuery(request), previous = active.get(query.restoreId)
      if (previous) { if (!io.equal(previous.request, request)) throw Error('Restoration ID conflicts'); return snapshot(previous) }
      if (active.size) throw Error('Only one isolated restoration may copy at a time')
      const entry = { query, request, job: { schemaVersion: 1, query, state: 'queued' } }; active.set(query.restoreId, entry)
      entry.started = (async () => {
        const existing = await diskStatus(query)
        if (existing.state !== 'unknown') { entry.job = existing; active.delete(query.restoreId); return }
        const source = await sourceRuntime.status(query.source)
        if (io.hash(sourceRestoreEvidence(source)) !== query.evidenceSha256) throw Error('Source archive differs from reviewed restoration evidence')
        const canonicalRoot = await io.canonical(root), folder = await folderFor(query.restoreId, true)
        try { await mkdir(folder, { mode: 0o700 }) }
        catch (error) { if (error.code !== 'EEXIST') throw error; entry.job = await diskStatus(query); active.delete(query.restoreId); return }
        await io.writeExclusive(folder, ['request.json'], JSON.stringify(request))
        await io.writeStatus(folder, entry.job); entry.finished = execute(entry, folder, source, canonicalRoot)
      })()
      try { return await snapshot(entry) } catch (error) { active.delete(query.restoreId); throw error }
    },
    async status(value) {
      const query = validateSourceRestoreQuery(value), entry = active.get(query.restoreId)
      if (entry) { if (!io.equal(query, entry.query)) throw Error('Restoration lookup conflicts'); return snapshot(entry) }
      return diskStatus(query)
    }
  }
}

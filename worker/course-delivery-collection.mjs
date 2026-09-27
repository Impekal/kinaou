import crypto from 'node:crypto'
import path from 'node:path'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, rename, statfs, unlink } from 'node:fs/promises'
import { createLessonDeliveryRuntime } from './course-lesson-delivery.mjs'
import { collectionDirectory, collectionSourceText, courseCollectionLimits, validateCourseCollectionJob, validateCourseCollectionRequest } from './course-collection-protocol.mjs'

const now = () => new Date().toISOString()
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const failure = error => String(error?.message ?? error).trim().slice(0, 4000).trim() || 'Collection operation failed'
async function folderFor(root, id, createParent = false) {
  let folder = await realpath(root)
  if (path.basename(folder) !== 'KINAOU') throw Error('Invalid collection managed root')
  for (const part of ['Renders', 'CourseCollections', ...(createParent ? [] : [id])]) {
    folder = path.join(folder, part)
    if (createParent) await mkdir(folder, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
    const info = await lstat(folder)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(folder) !== folder) throw Error('Unsafe collection directory')
  }
  return createParent ? path.join(folder, id) : folder
}
async function readBytes(file, expectedSize) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size <= 0 || before.size > 512 * 1024 || (expectedSize !== undefined && before.size !== expectedSize)) throw Error('Invalid collection record size/type')
    const bytes = Buffer.alloc(before.size); let offset = 0
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset); if (!bytesRead) throw Error('Truncated collection record'); offset += bytesRead }
    const after = await handle.stat()
    if (['size','mtimeMs','ctimeMs','ino','dev'].some(key => before[key] !== after[key])) throw Error('Collection record changed during read')
    return bytes
  } finally { await handle.close() }
}
const readJson = async file => JSON.parse((await readBytes(file)).toString('utf8'))
async function writeExclusive(folder, name, content) {
  const bytes = Buffer.from(content), file = path.join(folder, name)
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
  if (digest(await readBytes(file, bytes.length)) !== digest(bytes)) throw Error('Collection record differs after write')
  return { name, sizeBytes: bytes.length, sha256: digest(bytes) }
}
async function writeStatus(folder, job) {
  await writeExclusive(folder, 'status.next.json', JSON.stringify(job))
  await rename(path.join(folder, 'status.next.json'), path.join(folder, 'status.json'))
}
const readme = {
  en: 'PRIVATE KINAOU LESSON COLLECTION\nActual independent copies of the explicitly selected historical lesson packages, ordered by the reviewed current course outline. Not necessarily every lesson; inspect COURSE.json. Whole folders, child manifests and request records contain private answers, notes and paths. Never share the entire collection unchanged with learners. Verify all hashes and review teaching/subtitle quality before delivery. No full source-project backup, automatic publication, expert authentication or platform approval. Interrupted/failed collections are incomplete and never automatically resumed.\n',
  de: 'PRIVATE KINAOU-LEKTIONSSAMMLUNG\nEchte unabhängige Kopien der ausdrücklich ausgewählten historischen Lektionspakete, geordnet nach dem geprüften aktuellen Kursplan. Nicht unbedingt alle Lektionen; COURSE.json prüfen. Gesamtordner, Unter-Manifeste und Vorgangsakten enthalten private Lösungen, Notizen und Pfade. Niemals die ganze Sammlung unverändert an Lernende weitergeben. Alle Hashes und fachliche/Untertitelqualität vor Auslieferung prüfen. Kein vollständiges Quellprojektbackup, keine automatische Veröffentlichung, authentifizierte Fachprüfung oder Plattformfreigabe. Unterbrochene/fehlgeschlagene Sammlungen sind unvollständig und werden nie automatisch fortgesetzt.\n',
  fr: 'COLLECTION PRIVÉE DE LEÇONS KINAOU\nCopies indépendantes réelles des dossiers historiques explicitement sélectionnés, dans l’ordre du plan de cours actuel relu. Pas nécessairement toutes les leçons ; consultez COURSE.json. Dossiers, sous-manifestes et traces contiennent réponses, notes et chemins privés. Ne partagez jamais toute la collection inchangée avec les apprenants. Vérifiez toutes les empreintes et la qualité pédagogique/des sous-titres avant diffusion. Ni sauvegarde complète du projet, publication automatique, expertise authentifiée ni approbation de plateforme. Une collection interrompue/en échec reste incomplète, sans reprise automatique.\n'
}
function checkSource(input, selected, job) {
  if (job.state !== 'ready' || job.request.projectId !== input.projectId || job.request.requestId !== selected.sourceRequestId || digest(collectionSourceText(job)) !== selected.sourceFingerprint) throw Error('Selected package is changed, unverified or belongs to another project')
  const context = job.request.export.courseLesson, range = job.request.export.range
  if (context.courseId !== input.course.courseId || context.moduleId !== selected.moduleId || context.lessonId !== selected.lessonId || context.language !== input.course.language
    || range.inMs !== selected.range.inMs || range.outMs !== selected.range.outMs) throw Error('Selected package no longer matches the reviewed course identity/language/range')
}
function samePayload(source, copy) {
  if (copy.state !== 'ready' || source.result.sha256 !== copy.result.sha256 || source.result.sizeBytes !== copy.result.sizeBytes) throw Error('Copied lesson differs from reviewed video')
  const files = job => (job.result.files ?? []).map(file => ({ path: file.path.slice(job.result.directory.length + 1), sizeBytes: file.sizeBytes, sha256: file.sha256 }))
  if (!equal(files(source), files(copy))) throw Error('Copied materials differ from reviewed package')
}
/** One bounded, explicit collection at a time; durable IDs never resume/restart automatically. */
export function createCourseCollectionRuntime({ root, probe, lessonRuntime = createLessonDeliveryRuntime({ root, probe }) }) {
  const active = new Map()
  async function diskStatus(input) {
    let folder
    try { folder = await folderFor(root, input.requestId) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, request: input, state: 'unknown' }; throw error }
    let saved
    try { saved = validateCourseCollectionRequest(await readJson(path.join(folder, 'request.json'))) } catch (error) { if (error.code === 'ENOENT') return { schemaVersion: 1, request: input, state: 'interrupted', error: 'Reserved collection has no complete request; do not overwrite' }; throw error }
    if (!equal(saved, input)) throw Error('Collection ID conflicts with another request')
    let manifest
    try { manifest = await readJson(path.join(folder, 'manifest.json')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (manifest) {
      if (manifest.kind !== 'private-course-collection') throw Error('Invalid collection manifest')
      const job = validateCourseCollectionJob({ schemaVersion: 1, request: manifest.request, state: 'ready', result: manifest.result }, input)
      try {
        if (!Array.isArray(manifest.records) || manifest.records.length !== 3 || new Set(manifest.records.map(item => item.name)).size !== 3) throw Error('Invalid collection record hashes')
        for (const file of manifest.records) {
          if (!['COURSE.json','SHA256SUMS','README.txt'].includes(file.name) || !Number.isSafeInteger(file.sizeBytes) || digest(await readBytes(path.join(folder, file.name), file.sizeBytes)) !== file.sha256) throw Error('Collection index/checksum/readme file is missing or changed')
        }
        const children = createLessonDeliveryRuntime({ root, probe, collectionId: input.requestId })
        for (const item of job.result.lessons) {
          const child = await children.inspect({ projectId: input.projectId, requestId: item.sourceRequestId })
          if (child.state !== 'ready' || digest(collectionSourceText(child)) !== item.childFingerprint || child.result.mediaPath !== item.mediaPath || child.result.sha256 !== item.sha256 || child.result.sizeBytes !== item.sizeBytes || (child.result.files?.length ?? 0) !== item.materialFiles) throw Error('Collection child is missing, changed or incomplete')
        }
      } catch (error) { return { schemaVersion: 1, request: input, state: 'integrityFailed', error: failure(error) } }
      return { ...job, result: { ...job.result, integrityCheckedAt: now() } }
    }
    let status
    try { status = await readJson(path.join(folder, 'status.json')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    if (status?.state === 'failed') return validateCourseCollectionJob(status, input)
    return { schemaVersion: 1, request: input, state: 'interrupted', error: 'No completed collection manifest. Partial files are retained; no automatic resume, restart or overwrite.' }
  }
  async function execute(entry, folder) {
    const input = entry.input, base = collectionDirectory(input.requestId)
    try {
      entry.job = { schemaVersion: 1, request: input, state: 'checking', completedLessons: 0 }; await writeStatus(folder, entry.job)
      let totalMediaBytes = 0, metadataBytes = 0
      for (const selected of input.lessons) {
        const source = await lessonRuntime.inspect({ projectId: input.projectId, requestId: selected.sourceRequestId }); checkSource(input, selected, source)
        totalMediaBytes += source.result.sizeBytes; metadataBytes += Buffer.byteLength(JSON.stringify(source.request))
        if (totalMediaBytes > courseCollectionLimits.videoBytes || metadataBytes > courseCollectionLimits.sourceMetadataBytes) throw Error('Collection exceeds 32 GiB video / 8 MiB source-metadata limits')
      }
      const disk = await statfs(folder)
      if (disk.bavail * disk.bsize < totalMediaBytes + 64 * 1024 ** 2) throw Error('Insufficient space for selected videos plus 64 MiB metadata/reserve')
      const children = createLessonDeliveryRuntime({ root, probe, collectionId: input.requestId }), lessons = [], sums = []
      for (const selected of input.lessons) {
        entry.job = { schemaVersion: 1, request: input, state: 'copying', completedLessons: lessons.length }; await writeStatus(folder, entry.job)
        const source = await lessonRuntime.inspect({ projectId: input.projectId, requestId: selected.sourceRequestId }); checkSource(input, selected, source)
        const childRequest = { ...source.request, export: { ...source.request.export, outputRelativePath: source.result.mediaPath, sizeBytes: source.result.sizeBytes } }
        await children.start(childRequest); const child = await children.settledStatus(childRequest); samePayload(source, child)
        lessons.push({ sourceRequestId: selected.sourceRequestId, childFingerprint: digest(collectionSourceText(child)), directory: child.result.directory, mediaPath: child.result.mediaPath, sha256: child.result.sha256, sizeBytes: child.result.sizeBytes, materialFiles: child.result.files?.length ?? 0 })
        sums.push(`${child.result.sha256}  ${child.result.mediaPath.slice(base.length + 1)}`, ...(child.result.files ?? []).map(file => `${file.sha256}  ${file.path.slice(base.length + 1)}`))
      }
      const createdAt = now(), index = { schemaVersion: 1, private: true, fullSourceProjectBackup: false, teachingQualityApproved: false, request: input, createdAt, lessons }
      const records = [await writeExclusive(folder, 'COURSE.json', JSON.stringify(index, null, 2)), await writeExclusive(folder, 'SHA256SUMS', sums.join('\n') + '\n'), await writeExclusive(folder, 'README.txt', readme[input.course.language])]
      const result = { directory: base, manifestPath: `${base}/manifest.json`, indexPath: `${base}/COURSE.json`, checksumPath: `${base}/SHA256SUMS`, createdAt, integrityCheckedAt: now(), totalMediaBytes, lessons }
      const job = validateCourseCollectionJob({ schemaVersion: 1, request: input, state: 'ready', result }, input)
      await writeExclusive(folder, 'manifest.next.json', JSON.stringify({ kind: 'private-course-collection', request: input, result: job.result, records }, null, 2))
      await link(path.join(folder, 'manifest.next.json'), path.join(folder, 'manifest.json')); await unlink(path.join(folder, 'manifest.next.json')).catch(() => {})
      entry.job = job; await writeStatus(folder, job).catch(() => {})
    } catch (error) {
      entry.job = { schemaVersion: 1, request: input, state: 'failed', error: failure(error) }; await writeStatus(folder, entry.job).catch(() => {})
      // Retain this operation's partial copies/records for explicit inspection. Never remove source/foreign data.
    } finally { active.delete(input.requestId) }
  }
  async function snapshot(entry) {
    await entry.started
    if (['ready','failed'].includes(entry.job.state)) { await entry.finished; if (entry.job.state === 'ready') return diskStatus(entry.input) }
    return structuredClone(entry.job)
  }
  return {
    async start(value) {
      const input = validateCourseCollectionRequest(value), previous = active.get(input.requestId)
      if (previous) { if (!equal(previous.input, input)) throw Error('Collection ID conflicts'); return snapshot(previous) }
      if (active.size) throw Error('Only one collection may copy at a time')
      const entry = { input, job: { schemaVersion: 1, request: input, state: 'queued' } }; active.set(input.requestId, entry)
      entry.started = (async () => {
        const folder = await folderFor(root, input.requestId, true)
        try { await mkdir(folder, { mode: 0o700 }) } catch (error) { if (error.code !== 'EEXIST') throw error; entry.job = await diskStatus(input); active.delete(input.requestId); return }
        await writeExclusive(folder, 'request.json', JSON.stringify(input)); await writeStatus(folder, entry.job)
        entry.finished = execute(entry, folder)
      })()
      try { return await snapshot(entry) } catch (error) { active.delete(input.requestId); throw error }
    },
    async status(value) {
      const input = validateCourseCollectionRequest(value), entry = active.get(input.requestId)
      if (entry) { if (!equal(entry.input, input)) throw Error('Collection ID conflicts'); return snapshot(entry) }
      return diskStatus(input)
    }
  }
}

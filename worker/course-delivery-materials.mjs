import crypto from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import path from 'node:path'
export const MAX_DELIVERY_MATERIAL_BYTES = 512 * 1024
export const MAX_DELIVERY_REQUEST_BYTES = 1536 * 1024
const filePath = /^(?:learner\/(?:worksheet|material-[a-zA-Z0-9-]{1,100})\.txt|instructor\/(?:script|answer-key|material-[a-zA-Z0-9-]{1,100})\.txt|instructor\/lesson\.json)$/
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
export function validateDeliveryMaterials(value, receipt) {
  const source = value?.source, context = source?.context, original = receipt.courseLesson
  if (value?.acknowledgeTextVideoMatch !== true || !context || !Number.isSafeInteger(context.outlineRevision) || context.outlineRevision < 1) throw Error('Explicit text/video review is required')
  for (const key of ['courseId','moduleId','lessonId','language']) if (context[key] !== original[key]) throw Error('Material identity/language differs from video receipt')
  const normalizedContext = {}
  for (const key of ['courseId','moduleId','lessonId']) normalizedContext[key] = context[key]
  normalizedContext.outlineRevision = context.outlineRevision
  for (const key of ['courseTitle','moduleTitle','lessonTitle']) {
    const text = context[key]
    if (typeof text !== 'string' || !text.trim() || text !== text.trim() || text.length > 120) throw Error('Invalid material context title')
    normalizedContext[key] = text
  }
  normalizedContext.language = context.language
  if (source.range?.inMs !== receipt.range.inMs || source.range?.outMs !== receipt.range.outMs || !/^[a-f0-9]{64}$/.test(source.projectMetadataSha256)
    || typeof source.preparedAt !== 'string' || !Number.isFinite(Date.parse(source.preparedAt)) || new Date(source.preparedAt).toISOString() !== source.preparedAt) throw Error('Invalid material source snapshot')
  if (!Array.isArray(value.files) || !value.files.length || value.files.length > 14) throw Error('Material file count exceeds 14')
  let total = 0; const names = new Set()
  const files = value.files.map(file => {
    if (typeof file?.path !== 'string' || !filePath.test(file.path) || names.has(file.path.toLowerCase())) throw Error('Unsafe, duplicate or wrong-audience material path')
    names.add(file.path.toLowerCase())
    if (typeof file.text !== 'string' || !file.text.length || file.text.length > MAX_DELIVERY_MATERIAL_BYTES || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(file.text)) throw Error('Invalid material text')
    const bytes = Buffer.from(file.text, 'utf8'); total += bytes.length
    if (total > MAX_DELIVERY_MATERIAL_BYTES || bytes.toString('utf8') !== file.text) throw Error('Materials exceed 512 KiB or contain invalid Unicode')
    if (file.sha256 !== digest(bytes)) throw Error('Reviewed material hash does not match its text')
    return { path: file.path, text: file.text, sha256: file.sha256 }
  })
  return { acknowledgeTextVideoMatch: true, source: { context: normalizedContext, range: { inMs: source.range.inMs, outMs: source.range.outMs }, projectMetadataSha256: source.projectMetadataSha256, preparedAt: source.preparedAt }, files }
}
export async function writeDeliveryMaterials(folder, base, materials, owned, directories, hashFile) {
  const created = new Set(), results = []
  for (const file of materials.files) {
    const parent = file.path.split('/')[0], dir = path.join(folder, parent)
    if (!created.has(parent)) { await mkdir(dir, { mode: 0o700 }); created.add(parent); directories.add(parent) }
    const target = path.join(folder, file.path), bytes = Buffer.from(file.text, 'utf8')
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    owned.add(file.path)
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
    if (await hashFile(target, bytes.length) !== file.sha256) throw Error('Written material differs from reviewed bytes')
    results.push({ path: `${base}/${file.path}`, sizeBytes: bytes.length, sha256: file.sha256 })
  }
  return results
}
export async function verifyDeliveryMaterials(folder, base, materials, files, hashFile) {
  if (!Array.isArray(files) || files.length !== materials.files.length) throw Error('Missing material manifest entries')
  const seen = new Set()
  for (const file of files) {
    const source = materials.files.find(item => `${base}/${item.path}` === file.path)
    if (!source || seen.has(file.path) || file.sha256 !== source.sha256 || file.sizeBytes !== Buffer.byteLength(source.text)) throw Error('Material manifest differs from reviewed content')
    seen.add(file.path)
    const parent = path.join(folder, source.path.split('/')[0]), info = await lstat(parent)
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(parent) !== parent) throw Error('Unsafe material directory')
    if (await hashFile(path.join(folder, source.path), file.sizeBytes) !== file.sha256) throw Error('Material file is missing or changed')
  }
}
export const materialDeliveryReadme = {
  en: 'PRIVATE KINAOU LESSON PACKAGE\nVideo and reviewed saved texts. learner/ contains authored learner materials and worksheets; instructor/ contains private scripts, answers and saved lesson notes. Root records also contain private text and paths: NEVER share this whole package unchanged with learners. Inspect learner-authored hints/materials for answer disclosure. Recheck all hashes before delivery. Metadata review does not authenticate expertise or lock the original video. No separate subtitle file or full source-project backup; no teaching/platform approval.\n',
  de: 'PRIVATES KINAOU-LEKTIONSPAKET\nVideo und geprüfte gespeicherte Texte. learner/ enthält Lernmaterialien und Arbeitsblätter; instructor/ enthält private Skripte, Lösungen und Lektionsnotizen. Auch die Hauptverzeichnis-Belege enthalten private Texte und Pfade: Dieses Gesamtpaket NIE unverändert an Lernende weitergeben. Hinweise/Lernmaterialien auf verratene Antworten prüfen. Vor Weitergabe alle Hashes erneut prüfen. Metadatenprüfung bestätigt weder Fachwissen noch unverändertes Originalvideo. Keine separate Untertiteldatei, kein vollständiges Quellprojektbackup, keine fachliche/Plattformfreigabe.\n',
  fr: 'DOSSIER PRIVÉ DE LEÇON KINAOU\nVidéo et textes enregistrés relus. learner/ contient supports et exercices ; instructor/ contient scripts, corrigés et notes privés. Les documents à la racine contiennent aussi textes et chemins privés : ne partagez JAMAIS ce dossier complet tel quel avec les apprenants. Vérifiez que les indices/supports ne dévoilent pas les réponses. Revérifiez toutes les empreintes. La revue des métadonnées ne certifie ni expertise ni vidéo originale inchangée. Sans sous-titres séparés ni sauvegarde complète du projet ; aucune validation pédagogique/de plateforme.\n'
}

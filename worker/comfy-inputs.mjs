import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const COMFY_REFERENCE_ROLES = ['portrait', 'speech']
export const MAX_REFERENCE_BYTES = 32 * 1024 * 1024
const formats = { portrait: /\.(png|jpg|jpeg|webp)$/i, speech: /\.(wav|mp3|flac|ogg|m4a)$/i }
const loaders = { portrait: ['LoadImage', 'image'], speech: ['LoadAudio', 'audio'] }

export function validateReferenceBindings(template) {
  if (template.referenceInputs === undefined) return []
  const inputs = template.referenceInputs
  if (template.mediaType !== 'video' || !inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new Error('Reference inputs require a video template')
  for (const [role, binding] of Object.entries(inputs)) {
    if (!COMFY_REFERENCE_ROLES.includes(role)) throw new Error('Unsupported reference role')
    const [classType, input] = loaders[role]
    const node = template.workflow?.[binding?.nodeId]
    if (typeof binding?.nodeId !== 'string' || binding.input !== input || node?.class_type !== classType || typeof node.inputs?.[input] !== 'string') throw new Error(`Reference ${role} must bind ${classType}.${input}`)
    if (Object.values(template.bindings ?? {}).some((other) => other.nodeId === binding.nodeId && other.input === input)) throw new Error('Reference input overlaps a parameter binding')
  }
  return COMFY_REFERENCE_ROLES.filter((role) => Object.hasOwn(inputs, role))
}

export function validateReferences(template, value = {}) {
  const roles = validateReferenceBindings(template)
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((role) => !roles.includes(role))) throw new Error('Undeclared reference input')
  return roles.map((role) => {
    const ref = value[role]
    if (!ref || ref.authorized !== true) throw new Error(`Confirm authorization for ${role}`)
    if (typeof ref.assetId !== 'string' || !ref.assetId.trim() || ref.assetId.length > 200) throw new Error('Reference asset identity is required')
    if (typeof ref.path !== 'string' || !ref.path.startsWith('KINAOU/Assets/') || ref.path.length > 1000 || /[\\\x00-\x1f]/.test(ref.path) || ref.path.split('/').some((part) => !part || part === '.' || part === '..') || !formats[role].test(ref.path)) throw new Error(`Invalid managed ${role} reference path or format`)
    return { role, assetId: ref.assetId, sourcePath: ref.path, authorized: true }
  })
}

async function readReference(root, ref, signal) {
  signal?.throwIfAborted()
  // Reject symlink parents and final links, and read from the checked file handle.
  const canonicalRoot = await realpath(root)
  const parts = ref.sourcePath.slice('KINAOU/'.length).split('/')
  let current = canonicalRoot
  for (const part of parts) {
    current = path.join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Reference symlinks are not allowed')
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    if (await realpath(current) !== current) throw new Error('Reference path changed during validation')
    const info = await file.stat()
    if (!info.isFile() || info.size < 1 || info.size > MAX_REFERENCE_BYTES) throw new Error('Reference must be a nonempty regular file up to 32 MiB')
    const bytes = Buffer.alloc(info.size)
    let offset = 0
    while (offset < bytes.length) {
      signal?.throwIfAborted()
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) throw new Error('Reference changed while reading')
      offset += bytesRead
    }
    const after = await file.stat()
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error('Reference changed while reading')
    return bytes
  } finally { await file.close() }
}

/** ComfyUI's /upload/image accepts file bytes, including LoadAudio inputs. No remote redirects. */
export async function uploadComfyReferences({ root, baseUrl, jobId, references, template, workflow, signal, fetchImpl = fetch }) {
  const endpoint = new URL(baseUrl)
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('Reference upload requires a localhost HTTP endpoint')
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) throw new Error('Invalid reference job ID')
  const provenance = []
  for (const ref of references) {
    const bytes = await readReference(root, ref, signal)
    const filename = `kinaou-${jobId}-${ref.role}${path.extname(ref.sourcePath).toLowerCase()}`
    const form = new FormData()
    form.set('image', new Blob([bytes]), filename)
    form.set('type', 'input')
    form.set('overwrite', 'false')
    // Keep files at input root: core LoadImage discovery does not recurse.
    const response = await fetchImpl(`${baseUrl}/upload/image`, { method: 'POST', body: form, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Reference upload failed with HTTP ${response.status}`)
    const result = await response.json()
    if (result?.type !== 'input' || (result.subfolder ?? '') !== '' || result.name !== filename) throw new Error('ComfyUI returned an unexpected reference filename')
    signal?.throwIfAborted()
    const binding = template.referenceInputs[ref.role]
    workflow[binding.nodeId].inputs[binding.input] = filename
    provenance.push({ ...ref, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return provenance
}

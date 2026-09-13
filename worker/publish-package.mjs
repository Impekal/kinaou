import path from 'node:path'

const publishTargets = new Set(['youtube', 'instagram', 'tiktok', 'generic'])
const exportFormats = new Set(['landscape', 'vertical', 'square'])

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value
}

function text(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value !== value.trim() || value.length < minimum || value.length > maximum) throw new Error(`${label} must contain ${minimum}–${maximum} trimmed characters`)
  return value
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${label} must be an integer of at least ${minimum}`)
  return value
}

function isoDate(value, label) {
  text(value, label, 1, 100)
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(`${label} must be a canonical ISO date`)
  return value
}

function managedRenderPath(value) {
  text(value, 'Export path', 1, 500)
  if (value.includes('\\') || path.posix.normalize(value) !== value || !value.startsWith('KINAOU/Renders/') || !value.endsWith('.mp4')) throw new Error('Export path must be a canonical managed MP4 under KINAOU/Renders')
  return value
}

export function validatePublishPackageRequest(value) {
  const input = object(value, 'Publish package request')
  if (input.schemaVersion !== 1) throw new Error('Publish package schemaVersion must be 1')
  const source = object(input.export, 'Publish package export')
  if (source.schemaVersion !== 1) throw new Error('Export receipt schemaVersion must be 1')
  const range = object(source.range, 'Export range')
  const inMs = integer(range.inMs, 'Export In')
  const outMs = integer(range.outMs, 'Export Out', 1)
  if (outMs <= inMs) throw new Error('Export Out must be after In')
  if (!exportFormats.has(source.format)) throw new Error('Export format is not supported')
  if (!Array.isArray(source.sceneIds) || source.sceneIds.length > 100) throw new Error('Export scene ids must be an array of at most 100 items')
  const sceneIds = source.sceneIds.map((id) => text(id, 'Export scene id', 1, 200))
  if (!publishTargets.has(input.platform)) throw new Error('Publish target is not supported')
  if (!Array.isArray(input.tags) || input.tags.length > 30) throw new Error('Publish tags must be an array of at most 30 items')
  const tags = input.tags.map((tag) => text(tag, 'Publish tag', 1, 80))
  if (new Set(tags.map((tag) => tag.toLocaleLowerCase())).size !== tags.length) throw new Error('Publish tags must be unique')
  return {
    schemaVersion: 1,
    projectId: text(input.projectId, 'Project id', 1, 200),
    export: {
      schemaVersion: 1,
      jobId: text(source.jobId, 'Export job id', 1, 200),
      label: text(source.label, 'Export label', 1, 240),
      outputRelativePath: managedRenderPath(source.outputRelativePath),
      format: source.format,
      range: { inMs, outMs },
      sceneIds,
      durationMs: integer(source.durationMs, 'Export duration', 1),
      ...(source.sizeBytes === undefined ? {} : { sizeBytes: integer(source.sizeBytes, 'Export size') }),
      completedAt: isoDate(source.completedAt, 'Export completion time')
    },
    platform: input.platform,
    title: text(input.title, 'Publish title', 1, 200),
    description: text(input.description, 'Publish description', 0, 5000),
    tags
  }
}

export function publishPackageRelativePath(sourcePath, platform, createdAt, id) {
  managedRenderPath(sourcePath)
  if (!publishTargets.has(platform)) throw new Error('Publish target is not supported')
  isoDate(createdAt, 'Publish creation time')
  if (typeof id !== 'string' || !/^[a-f0-9-]{8,64}$/i.test(id)) throw new Error('Publish package id is invalid')
  const directory = path.posix.dirname(sourcePath)
  const stem = path.posix.basename(sourcePath, '.mp4')
  const timestamp = createdAt.replace(/[:.]/g, '-')
  return `${directory}/${stem}_${platform}_${timestamp}_${id}.publish.json`
}

export function buildPublishPackageDocument(input, options) {
  const request = validatePublishPackageRequest(input)
  const createdAt = isoDate(options?.createdAt, 'Publish creation time')
  const sourceSizeBytes = integer(options?.sourceSizeBytes, 'Source size', 1)
  return {
    schemaVersion: 1,
    kind: 'kinaou-publish-package',
    createdAt,
    projectId: request.projectId,
    platform: request.platform,
    title: request.title,
    description: request.description,
    tags: request.tags,
    media: { ...request.export, sizeBytes: sourceSizeBytes }
  }
}

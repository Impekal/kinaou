import { describe, expect, it } from 'vitest'
import { exportReceiptSchema } from '../src/core/exportHistory'
import { buildPublishPackageRequest, clearProjectPublishDefaults, parsePublishPreflightResult, parsePublishTags, projectPublishDefaults, publishFormatDimensions, publishIntegrityResultSchema, publishPackageEntrySchema, publishPackageListSchema, publishPackageResultSchema, publishPreflightMatchesReceipt, saveProjectPublishDefaults } from '../src/core/publishPackage'
import { createProject, parseProject } from '../src/core/project'

const receipt = exportReceiptSchema.parse({
  schemaVersion: 1,
  jobId: 'render-job-1',
  label: 'Hook + proof',
  outputRelativePath: 'KINAOU/Renders/demo_vertical.mp4',
  format: 'vertical',
  range: { inMs: 1000, outMs: 9000 },
  sceneIds: ['hook', 'proof'],
  durationMs: 8000,
  sizeBytes: 1234,
  completedAt: '2026-09-13T08:00:00.000Z'
})
const digest = 'a'.repeat(64)

describe('local publish packages', () => {
  it('derives preflight dimensions from the real full-quality render profiles', () => {
    expect(publishFormatDimensions).toEqual({ landscape: { width: 1920, height: 1080 }, vertical: { width: 1080, height: 1920 }, square: { width: 1080, height: 1080 } })
  })

  it('builds a bounded attributable request from a real export receipt', () => {
    const project = { ...createProject('Demo'), id: 'project-1' }
    const request = buildPublishPackageRequest(project, receipt, {
      platform: 'youtube',
      title: '  A reviewed title  ',
      description: '  Ready for handoff.  ',
      tags: '#Local AI, Editing\nlocal ai, KINAOU'
    })
    expect(request).toEqual({
      schemaVersion: 2,
      projectId: 'project-1',
      export: receipt,
      platform: 'youtube',
      placement: 'youtube-short',
      title: 'A reviewed title',
      description: 'Ready for handoff.',
      tags: ['Local AI', 'Editing', 'KINAOU']
    })
  })

  it('normalizes tag input but refuses unbounded publishing metadata', () => {
    expect(parsePublishTags(' one, #Two\none ')).toEqual(['one', 'Two'])
    expect(() => parsePublishTags(Array.from({ length: 31 }, (_, index) => `tag-${index}`).join(','))).toThrow()
    expect(() => buildPublishPackageRequest(createProject('Demo'), receipt, { platform: 'generic', title: '', description: '', tags: '' })).toThrow()
    expect(() => buildPublishPackageRequest(createProject('Demo'), { ...receipt, outputRelativePath: 'KINAOU/Assets/not-an-export.mp4' }, { platform: 'generic', title: 'Title', description: '', tags: '' })).toThrow()
  })

  it('accepts only managed non-empty publish-package results', () => {
    const result = { schemaVersion: 2, path: 'KINAOU/Renders/demo_youtube_1.publish.json', sourcePath: receipt.outputRelativePath, platform: 'youtube', createdAt: '2026-09-13T08:01:00.000Z', sizeBytes: 512, sourceSha256: digest }
    expect(publishPackageResultSchema.parse(result).sizeBytes).toBe(512)

    const placementResult = {
      schemaVersion: 3,
      path: 'KINAOU/Renders/demo_youtube_2.publish.json',
      sourcePath: receipt.outputRelativePath,
      platform: 'youtube',
      placement: 'youtube-short',
      createdAt: '2026-09-13T08:02:00.000Z',
      sizeBytes: 640,
      sourceSha256: digest
    }

    expect(publishPackageResultSchema.parse(placementResult).schemaVersion).toBe(3)
    expect(() => publishPackageResultSchema.parse({ ...result, path: 'KINAOU/Assets/demo.publish.json' })).toThrow()
    expect(() => publishPackageResultSchema.parse({ ...result, sizeBytes: 0 })).toThrow()
    expect(() => publishPackageResultSchema.parse({ ...result, sourceSha256: digest.toUpperCase() })).toThrow()
  })

  it('accepts only internally consistent preflight results for the selected receipt', () => {
    const result = {
      schemaVersion: 1 as const,
      sourcePath: receipt.outputRelativePath,
      checkedAt: '2026-09-13T08:01:00.000Z',
      ready: true,
      durationToleranceMs: 250 as const,
      expected: { jobId: receipt.jobId, format: 'vertical' as const, width: 1080, height: 1920, durationMs: 8000, sizeBytes: 1234 },
      actual: { width: 1080, height: 1920, durationMs: 8050, sizeBytes: 1234, videoCodec: 'h264', audioCodec: 'aac' },
      checks: { size: true, videoStream: true, dimensions: true, duration: true }
    }
    expect(parsePublishPreflightResult(result, receipt)).toEqual(result)
    expect(publishPreflightMatchesReceipt(parsePublishPreflightResult(result, receipt), receipt)).toBe(true)
    expect(publishPreflightMatchesReceipt(null, undefined)).toBe(false)
    expect(publishPreflightMatchesReceipt(parsePublishPreflightResult(result, receipt), { ...receipt, jobId: 'another-job' })).toBe(false)
    expect(() => parsePublishPreflightResult({ ...result, actual: { ...result.actual, width: 1920 } }, receipt)).toThrow(/inconsistent/)
    expect(() => parsePublishPreflightResult({ ...result, ready: false }, receipt)).toThrow(/inconsistent/)
    expect(() => parsePublishPreflightResult(result, { ...receipt, durationMs: 7000 })).toThrow(/does not match/)

    const noVideo = { ...result, ready: false, actual: { sizeBytes: 1234, durationMs: 8050 }, checks: { size: true, videoStream: false, dimensions: false, duration: true } }
    expect(parsePublishPreflightResult(noVideo, receipt).ready).toBe(false)
  })

  it('validates reopened package documents and their live source status', () => {
    const entry = publishPackageEntrySchema.parse({
      path: 'KINAOU/Renders/demo_youtube_1.publish.json',
      sizeBytes: 640,
      modifiedAt: '2026-09-13T08:02:00.000Z',
      sourceAvailable: false,
      document: {
        schemaVersion: 1,
        kind: 'kinaou-publish-package',
        createdAt: '2026-09-13T08:01:00.000Z',
        projectId: 'project-1',
        platform: 'youtube',
        title: 'Reviewed title',
        description: 'Reviewed description',
        tags: ['KINAOU'],
        media: { ...receipt, sizeBytes: 1234 }
      }
    })
    expect(entry.document.media.outputRelativePath).toBe(receipt.outputRelativePath)
    expect(entry.sourceAvailable).toBe(false)
    expect(() => publishPackageEntrySchema.parse({ ...entry, document: { ...entry.document, kind: 'unknown' } })).toThrow()
    expect(() => publishPackageEntrySchema.parse({ ...entry, document: { ...entry.document, media: { ...entry.document.media, outputRelativePath: '../outside.mp4' } } })).toThrow()
    expect(() => publishPackageListSchema.parse(Array.from({ length: 201 }, () => entry))).toThrow()

    const current = publishPackageEntrySchema.parse({
      ...entry,
      document: {
        ...entry.document,
        schemaVersion: 2,
        integrity: {
          checkedAt: '2026-09-13T08:01:00.000Z',
          actual: { sizeBytes: 1234, durationMs: 8050, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac' },
          sha256: digest
        }
      }
    })
    expect(current.document.schemaVersion).toBe(2)
    expect(() => publishPackageEntrySchema.parse({ ...current, document: { ...current.document, media: { ...current.document.media, sizeBytes: 1200 } } })).toThrow(/integrity size/)

    const placementAware = publishPackageEntrySchema.parse({
      ...entry,
      document: {
        ...entry.document,
        schemaVersion: 3,
        platform: 'youtube',
        placement: 'youtube-short',
        delivery: {
          checkedAt: '2026-09-13T08:01:00.000Z',
          ready: true,
          preferredFormat: 'vertical'
        },
        integrity: {
          checkedAt: '2026-09-13T08:01:00.000Z',
          actual: {
            sizeBytes: 1234,
            durationMs: 8050,
            width: 1080,
            height: 1920,
            videoCodec: 'h264',
            audioCodec: 'aac'
          },
          sha256: digest
        }
      }
    })

    expect(placementAware.document.schemaVersion).toBe(3)

    if (placementAware.document.schemaVersion === 3) {
      expect(placementAware.document.placement).toBe('youtube-short')
      expect(placementAware.document.delivery.ready).toBe(true)
      expect(placementAware.document.delivery.preferredFormat).toBe('vertical')
    }
  })

  it('strictly validates explicit package integrity outcomes', () => {
    const base = { schemaVersion: 1, packagePath: 'KINAOU/Renders/demo_youtube_1.publish.json', sourcePath: receipt.outputRelativePath, checkedAt: '2026-09-13T08:03:00.000Z' }
    expect(publishIntegrityResultSchema.parse({ ...base, status: 'unchanged', expectedSha256: digest, actualSha256: digest, sizeBytes: 1234 }).status).toBe('unchanged')
    expect(publishIntegrityResultSchema.parse({ ...base, status: 'modified', expectedSha256: digest, sizeBytes: 1300 }).status).toBe('modified')
    expect(publishIntegrityResultSchema.parse({ ...base, status: 'missing', expectedSha256: digest }).status).toBe('missing')
    expect(publishIntegrityResultSchema.parse({ ...base, status: 'unverifiable' }).status).toBe('unverifiable')
    expect(() => publishIntegrityResultSchema.parse({ ...base, status: 'unchanged', expectedSha256: digest, actualSha256: 'b'.repeat(64), sizeBytes: 1234 })).toThrow(/inconsistent/)
    expect(() => publishIntegrityResultSchema.parse({ ...base, status: 'unverifiable', expectedSha256: digest })).toThrow(/Legacy/)
  })

  it('persists normalized reusable publish defaults inside one project', () => {
    const project = createProject('Demo', new Date('2026-09-13T09:00:00.000Z'))
    const saved = saveProjectPublishDefaults(project, {
      platform: 'instagram',
      title: '  Repeatable title  ',
      description: '  Repeatable description.  ',
      tags: '#Local AI, Editing\nlocal ai'
    }, new Date('2026-09-13T09:01:00.000Z'))
    expect(projectPublishDefaults(saved)).toEqual({
      schemaVersion: 1,
      platform: 'instagram',
      title: 'Repeatable title',
      description: 'Repeatable description.',
      tags: ['Local AI', 'Editing'],
      updatedAt: '2026-09-13T09:01:00.000Z'
    })
    expect(saved.updatedAt).toBe('2026-09-13T09:01:00.000Z')
    expect(project.metadata.publishDefaults).toBeUndefined()
    expect(projectPublishDefaults(parseProject(JSON.parse(JSON.stringify(saved))))).toEqual(projectPublishDefaults(saved))
    expect(projectPublishDefaults(createProject('Another project'))).toBeNull()

    const unchanged = saveProjectPublishDefaults(saved, { platform: 'instagram', title: 'Repeatable title', description: 'Repeatable description.', tags: 'Local AI, Editing' }, new Date('2026-09-13T10:00:00.000Z'))
    expect(unchanged).toBe(saved)
  })

  it('ignores malformed defaults and clears stored defaults without touching form data', () => {
    const project = createProject('Demo', new Date('2026-09-13T09:00:00.000Z'))
    const malformed = { ...project, metadata: { publishDefaults: { platform: 'cloud' } } }
    expect(projectPublishDefaults(malformed)).toBeNull()
    const cleared = clearProjectPublishDefaults(malformed, new Date('2026-09-13T09:02:00.000Z'))
    expect(cleared.metadata.publishDefaults).toBeUndefined()
    expect(cleared.title).toBe(project.title)
    expect(cleared.updatedAt).toBe('2026-09-13T09:02:00.000Z')
    expect(clearProjectPublishDefaults(project)).toBe(project)
  })
})

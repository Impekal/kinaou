import { describe, expect, it } from 'vitest'
import { exportReceiptSchema } from '../src/core/exportHistory'
import { buildPublishPackageRequest, parsePublishTags, publishPackageResultSchema } from '../src/core/publishPackage'
import { createProject } from '../src/core/project'

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

describe('local publish packages', () => {
  it('builds a bounded attributable request from a real export receipt', () => {
    const project = { ...createProject('Demo'), id: 'project-1' }
    const request = buildPublishPackageRequest(project, receipt, {
      platform: 'youtube',
      title: '  A reviewed title  ',
      description: '  Ready for handoff.  ',
      tags: '#Local AI, Editing\nlocal ai, KINAOU'
    })
    expect(request).toEqual({
      schemaVersion: 1,
      projectId: 'project-1',
      export: receipt,
      platform: 'youtube',
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
    expect(publishPackageResultSchema.parse({ path: 'KINAOU/Renders/demo_youtube_1.publish.json', sourcePath: receipt.outputRelativePath, platform: 'youtube', createdAt: '2026-09-13T08:01:00.000Z', sizeBytes: 512 }).sizeBytes).toBe(512)
    expect(() => publishPackageResultSchema.parse({ path: 'KINAOU/Assets/demo.publish.json', sourcePath: receipt.outputRelativePath, platform: 'youtube', createdAt: '2026-09-13T08:01:00.000Z', sizeBytes: 512 })).toThrow()
    expect(() => publishPackageResultSchema.parse({ path: 'KINAOU/Renders/demo.publish.json', sourcePath: receipt.outputRelativePath, platform: 'youtube', createdAt: '2026-09-13T08:01:00.000Z', sizeBytes: 0 })).toThrow()
  })
})

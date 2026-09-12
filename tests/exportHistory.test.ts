import { describe, expect, it } from 'vitest'
import { forgetExportReceipt, projectExportHistory, recordSuccessfulExport, type SuccessfulExportReceiptInput } from '../src/core/exportHistory'
import { createProject, parseProject } from '../src/core/project'

function receipt(jobId: string, path = `KINAOU/Renders/${jobId}.mp4`): SuccessfulExportReceiptInput {
  return { jobId, label: `Export ${jobId}`, outputRelativePath: path, format: 'vertical', range: { inMs: 1000, outMs: 4000 }, sceneIds: ['scene-1'], durationMs: 3000, sizeBytes: 1234, completedAt: '2026-09-12T17:00:00.000Z' }
}

describe('persistent export history', () => {
  it('records a successful render once and survives project serialization', () => {
    const project = createProject('History', new Date('2026-09-12T16:00:00.000Z'))
    const updated = recordSuccessfulExport(project, receipt('job-1'), new Date('2026-09-12T17:00:01.000Z'))
    expect(projectExportHistory(updated)).toEqual([{ schemaVersion: 1, ...receipt('job-1') }])
    expect(projectExportHistory(parseProject(JSON.parse(JSON.stringify(updated))))).toEqual(projectExportHistory(updated))
    expect(recordSuccessfulExport(updated, receipt('job-1'))).toBe(updated)
  })

  it('ignores malformed stored entries and rejects paths outside managed renders', () => {
    const project = createProject('History')
    const valid = { schemaVersion: 1, ...receipt('job-1') }
    expect(projectExportHistory({ ...project, metadata: { exportHistory: [null, valid, valid, { ...valid, jobId: 'bad', outputRelativePath: 'KINAOU/Renders/../Assets/file.mp4' }] } })).toEqual([valid])
    expect(() => recordSuccessfulExport(project, receipt('bad', 'KINAOU/Assets/not-a-render.mp4'))).toThrow()
    expect(() => recordSuccessfulExport(project, receipt('bad', 'KINAOU/Renders/../Assets/not-a-render.mp4'))).toThrow()
  })

  it('keeps the newest fifty receipts and forgets only project metadata', () => {
    let project = createProject('History')
    for (let index = 0; index < 55; index += 1) project = recordSuccessfulExport(project, receipt(`job-${index}`))
    expect(projectExportHistory(project)).toHaveLength(50)
    expect(projectExportHistory(project).at(0)?.jobId).toBe('job-54')
    expect(projectExportHistory(project).at(-1)?.jobId).toBe('job-5')
    const forgotten = forgetExportReceipt(project, 'job-54', new Date('2026-09-12T18:00:00.000Z'))
    expect(projectExportHistory(forgotten).some((item) => item.jobId === 'job-54')).toBe(false)
    expect(projectExportHistory(forgotten).at(0)?.outputRelativePath).toBe('KINAOU/Renders/job-53.mp4')
    expect(forgetExportReceipt(forgotten, 'missing')).toBe(forgotten)
  })
})

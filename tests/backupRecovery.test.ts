import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BackupScope, runBackupAction, type BackupEntry, type BackupFeedback } from '../src/core/backupActions'
import { createProject } from '../src/core/project'
import { ProjectBackupPanel } from '../src/components/ProjectBackupPanel'
import { AppErrorBoundary, recoveryLanguage } from '../src/components/AppErrorBoundary'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { uiLanguages } from '../src/core/uiLanguage'
import { translateUi } from '../src/core/uiMessages'

const entry: BackupEntry = { id: 'source', title: 'Original title', path: 'KINAOU/Projects/source.json', sizeBytes: 100, modifiedAt: '2026-09-20T00:00:00Z', updatedAt: null }
function client() {
  return { saveProjectBackup: vi.fn().mockResolvedValue({ path: entry.path, sizeBytes: 100 }), listProjectBackups: vi.fn().mockResolvedValue([entry]), loadProjectBackup: vi.fn().mockResolvedValue({ id: 'source' }) }
}
afterEach(() => vi.unstubAllGlobals())

it.each(uiLanguages)('renders backup controls and disconnected help in %s without treating unread backups as empty', (language) => {
  const html = renderToStaticMarkup(createElement(UiLanguageProvider, { initialLanguage: language, children: createElement(ProjectBackupPanel, {
    project: createProject('Unchanged'), workerUrl: 'http://localhost:43117', workerToken: 'secret-not-rendered', workerConnected: false, onRestore: vi.fn()
  }) }))
  for (const key of ['backup.heading', 'backup.save', 'backup.list', 'backup.connect'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('KINAOU/Projects')
  expect(html).toContain('disabled=""')
  expect(html).not.toContain('secret-not-rendered')
  expect(html).not.toContain(translateUi(language, 'backup.empty'))
})

it.each(uiLanguages)('renders the error boundary fallback in %s, escaping diagnostics and warning about drafts', (language) => {
  const boundary = new AppErrorBoundary({ children: 'healthy', language })
  expect(boundary.render()).toBe('healthy')
  boundary.state = AppErrorBoundary.getDerivedStateFromError(new Error('<script>unsafe</script>'))
  const html = renderToStaticMarkup(boundary.render())
  for (const key of ['recovery.heading', 'recovery.help', 'recovery.retry', 'recovery.reload'] as const) expect(html).toContain(translateUi(language, key))
  expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain(`lang="${language}"`)
})

it('resolves fallback language even if the localStorage getter throws', () => {
  vi.stubGlobal('navigator', { languages: ['fr-CA'] })
  vi.stubGlobal('window', { get localStorage() { throw new Error('blocked') } })
  expect(recoveryLanguage()).toBe('fr')
  vi.stubGlobal('window', { localStorage: { getItem: () => 'de' } })
  expect(recoveryLanguage()).toBe('de')
})

it('saves the original project and lists actual results without rewriting content', async () => {
  const worker = client(), project = createProject('Original Français'), publish = vi.fn()
  const before = JSON.stringify(project)
  await runBackupAction({ kind: 'save', project }, () => worker, () => true, publish, vi.fn())
  expect(worker.saveProjectBackup).toHaveBeenCalledWith(project)
  expect(publish.mock.calls.map(([value]) => value)).toEqual([
    { message: { key: 'backup.saved', title: project.title, path: entry.path, sizeBytes: 100 } }, { backups: [entry] }
  ])
  expect(JSON.stringify(project)).toBe(before)
})

it('distinguishes a successful save followed by a failed list refresh', async () => {
  const worker = client(), updates: BackupFeedback[] = []
  worker.listProjectBackups.mockRejectedValue(new Error('offline'))
  await runBackupAction({ kind: 'save', project: createProject('Saved') }, () => worker, () => true, (value) => updates.push(value), vi.fn())
  expect(updates[0].message?.key).toBe('backup.saved')
  expect(updates[1]).toEqual({ backups: null, error: { key: 'backup.refreshFailed', detail: 'offline' } })
})

it('does not report save success or refresh after failed writes', async () => {
  const worker = client(), publish = vi.fn()
  worker.saveProjectBackup.mockRejectedValue(new Error('disk full'))
  await runBackupAction({ kind: 'save', project: createProject('Fail') }, () => worker, () => true, publish, vi.fn())
  expect(publish).toHaveBeenCalledExactlyOnceWith({ backups: null, error: { key: 'backup.saveFailed', detail: 'disk full' } })
  expect(worker.listProjectBackups).not.toHaveBeenCalled()
})

it('catches client construction errors and distinguishes failed lists from empty lists', async () => {
  const publish = vi.fn()
  await runBackupAction({ kind: 'list' }, () => { throw new Error('invalid connection') }, () => true, publish, vi.fn())
  expect(publish.mock.calls[0][0]).toEqual({ backups: null, error: { key: 'backup.listFailed', detail: 'invalid connection' } })
  const worker = client()
  worker.listProjectBackups.mockResolvedValue([])
  await runBackupAction({ kind: 'list' }, () => worker, () => true, publish, vi.fn())
  expect(publish.mock.calls[1][0]).toEqual({ backups: [] })
})

it('reports restore success only after the browser callback succeeds', async () => {
  const worker = client(), events: string[] = []
  await runBackupAction({ kind: 'restore', entry }, () => worker, () => true, (value) => events.push(value.message!.key), (payload) => { expect(payload).toEqual({ id: 'source' }); events.push('restored') })
  expect(events).toEqual(['restored', 'backup.restored'])
  const publish = vi.fn()
  await runBackupAction({ kind: 'restore', entry }, () => worker, () => true, publish, () => { throw new Error('storage quota') })
  expect(publish).toHaveBeenCalledExactlyOnceWith({ backups: null, error: { key: 'backup.restoreFailed', detail: 'storage quota' } })
})

it.each(['save', 'list', 'restore'] as const)('ignores stale %s responses after connection changes/unmount', async (kind) => {
  const worker = client(), scope = new BackupScope(), publish = vi.fn(), restore = vi.fn()
  let resolve!: (value: unknown) => void
  const pending = new Promise((done) => { resolve = done })
  const method = kind === 'save' ? worker.saveProjectBackup : kind === 'list' ? worker.listProjectBackups : worker.loadProjectBackup
  method.mockReturnValue(pending)
  const request = kind === 'save' ? { kind, project: createProject('Pending') } : kind === 'restore' ? { kind, entry } : { kind }
  const run = runBackupAction(request, () => worker, scope.capture(), publish, restore)
  scope.invalidate()
  resolve(kind === 'save' ? { path: entry.path, sizeBytes: 100 } : kind === 'list' ? [entry] : { id: entry.id })
  await run
  expect(publish).not.toHaveBeenCalled()
  expect(restore).not.toHaveBeenCalled()
  if (kind === 'save') expect(worker.listProjectBackups).not.toHaveBeenCalled()
  expect(scope.capture()()).toBe(true)
})

it('ignores stale failures without reactivating the old scope', async () => {
  const worker = client(), scope = new BackupScope(), publish = vi.fn()
  let reject!: (error: Error) => void
  worker.listProjectBackups.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const old = scope.capture()
  const run = runBackupAction({ kind: 'list' }, () => worker, old, publish, vi.fn())
  scope.invalidate()
  const fresh = scope.capture()
  reject(new Error('late failure'))
  await run
  expect(old()).toBe(false)
  expect(fresh()).toBe(true)
  expect(publish).not.toHaveBeenCalled()
})

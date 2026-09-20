import { useMemo, useState } from 'react'
import { AssetPlacementControl } from './components/AssetPlacementControl'
import { AssetAvailabilityControl } from './components/AssetAvailabilityControl'
import { AssetUploadPanel } from './components/AssetUploadPanel'
import { CaptionEditor } from './components/CaptionEditor'
import { RenderPanel } from './components/RenderPanel'
import { TimelineEditor } from './components/TimelineEditor'
import { VideoProxyControl } from './components/VideoProxyControl'
import { StudioProxyPreview } from './components/StudioProxyPreview'
import { VideoThumbnailControl } from './components/VideoThumbnailControl'
import { WaveformControl } from './components/WaveformControl'
import { TimelinePreview } from './components/TimelinePreview'
import { VersionHistoryPanel } from './components/VersionHistoryPanel'
import { DirectorPanel } from './components/DirectorPanel'
import { SttPanel } from './components/SttPanel'
import { AudioStudioPanel } from './components/AudioStudioPanel'
import { PortraitPresenterPanel } from './components/PortraitPresenterPanel'
import { ImageStudioPanel } from './components/ImageStudioPanel'
import { VideoStudioPanel } from './components/VideoStudioPanel'
import { CapturePanel } from './components/CapturePanel'
import { MediaPlanPanel } from './components/MediaPlanPanel'
import { ProjectBackupPanel } from './components/ProjectBackupPanel'
import { SceneVoiceoverPanel } from './components/SceneVoiceoverPanel'
import { ScriptCaptionsPanel } from './components/ScriptCaptionsPanel'
import { StoryboardAssemblyPanel } from './components/StoryboardAssemblyPanel'
import { AiEditorPanel } from './components/AiEditorPanel'
import { PublishPanel } from './components/PublishPanel'
import { CoursePanel } from './components/CoursePanel'
import { SettingsPanel } from './components/SettingsPanel'
import { UiLanguageSelector, useUiLanguage } from './components/UiLanguageProvider'
import { createProjectFromInput, type CreationInputKind } from './core/create'
import { importProbedMedia, type ImportableMediaKind } from './core/mediaImport'
import { ProjectRepository, StorageSettingsRepository } from './core/persistence'
import { parseProject, type KinaouProject } from './core/project'
import { configureWorkspaceRoot, type StorageBackend, type StorageSettings } from './core/storage'
import { WorkerClient } from './core/workerClient'
import type { MediaProbeResult, WorkerHandshake } from './core/workerProtocol'
import { PersistentVersionHistory } from './core/versioning'

const nav = ['Projects', 'Create', 'Director', 'Studio', 'Course', 'Assets', 'Avatar', 'Audio', 'Images', 'Video', 'Capture', 'Publish', 'Analytics', 'Settings'] as const
const creationKinds = ['idea', 'document', 'url', 'image', 'audio', 'video'] as const

export function App() {
  const { t, language } = useUiLanguage()
  const projectRepo = useMemo(() => new ProjectRepository(window.localStorage), [])
  const storageRepo = useMemo(() => new StorageSettingsRepository(window.localStorage), [])
  const versionHistory = useMemo(() => new PersistentVersionHistory(window.localStorage), [])
  const [projects, setProjects] = useState<KinaouProject[]>(() => projectRepo.list())
  const [project, setProject] = useState<KinaouProject | null>(() => projectRepo.list()[0] ?? null)
  const [section, setSection] = useState<typeof nav[number]>(projects.length ? 'Projects' : 'Create')
  const [newTitle, setNewTitle] = useState('')
  const [inputKind, setInputKind] = useState<CreationInputKind>('idea')
  const [inputContent, setInputContent] = useState('')
  const [storage, setStorage] = useState<StorageSettings>(() => storageRepo.load())
  const [workspaceRoot, setWorkspaceRoot] = useState(storage.workspaceRoot)
  const [storageBackend, setStorageBackend] = useState<StorageBackend>(storage.backend)
  const [workerUrl, setWorkerUrl] = useState('http://127.0.0.1:43117')
  const [workerToken, setWorkerToken] = useState('')
  const [workerHandshake, setWorkerHandshake] = useState<WorkerHandshake | null>(null)
  const [workerBusy, setWorkerBusy] = useState(false)
  const [workerError, setWorkerError] = useState('')
  const [assetPath, setAssetPath] = useState('KINAOU/Assets/')
  const [assetName, setAssetName] = useState('')
  const [assetKind, setAssetKind] = useState<ImportableMediaKind>('video')
  const [assetProbe, setAssetProbe] = useState<MediaProbeResult | null>(null)

  function refreshProjects(selected?: KinaouProject) {
    const next = projectRepo.list()
    setProjects(next)
    if (selected) setProject(selected)
  }

  function persistProject(next: KinaouProject) {
    projectRepo.save(next)
    setProject(next)
    refreshProjects(next)
  }

  function createNewProject() {
    const next = createProjectFromInput({ title: newTitle, kind: inputKind, content: inputContent })
    persistProject(next)
    setNewTitle('')
    setInputContent('')
    setSection('Studio')
  }

  function openProject(next: KinaouProject) {
    setProject(next)
    setSection('Studio')
  }

  function sourceKindLabel(item: KinaouProject) {
    const value = (item.metadata.sourceInput as { kind?: unknown } | undefined)?.kind
    const kind = creationKinds.find((candidate) => candidate === value)
    return kind ? t(`kind.${kind}`) : t('projects.library')
  }

  function saveStorageProfile() {
    const next = configureWorkspaceRoot(storage, workspaceRoot, storageBackend)
    storageRepo.save(next)
    setStorage(next)
  }

  function workerClient(): WorkerClient {
    return new WorkerClient({ baseUrl: workerUrl, token: workerToken })
  }

  async function testWorkerConnection() {
    setWorkerBusy(true)
    setWorkerError('')
    setWorkerHandshake(null)
    try {
      setWorkerHandshake(await workerClient().health())
    } catch (error) {
      setWorkerError(error instanceof Error ? error.message : 'Worker connection failed')
    } finally {
      setWorkerBusy(false)
    }
  }

  async function probeManagedAsset() {
    setWorkerBusy(true)
    setWorkerError('')
    setAssetProbe(null)
    try {
      const client = workerClient()
      if (!workerHandshake) setWorkerHandshake(await client.health())
      setAssetProbe(await client.probe(assetPath.trim()))
    } catch (error) {
      setWorkerError(error instanceof Error ? error.message : 'Media probe failed')
    } finally {
      setWorkerBusy(false)
    }
  }

  function restoreBackupProject(payload: unknown) {
    const parsed = parseProject(payload)
    const existing = projectRepo.load(parsed.id)
    if (existing) versionHistory.snapshot(existing, 'Before drive restore', 'system')
    persistProject(parsed)
  }

  function addProbedAssetToProject() {
    if (!project || !assetProbe) return
    const next = importProbedMedia(project, {
      kind: assetKind,
      managedPath: assetPath,
      name: assetName || assetPath.split('/').pop() || 'Imported media',
      probe: assetProbe
    })
    persistProject(next)
    setAssetProbe(null)
    setAssetName('')
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">KINAOU</div>
        <div className="tagline">{t('shell.tagline')}</div>
        <UiLanguageSelector />
        <nav>{nav.map((item) => <button key={item} className={item === section ? 'navItem active' : 'navItem'} onClick={() => setSection(item)}>{t(`nav.${item}`)}</button>)}</nav>
        <div className="buildInfo" title="Code state this page is actually running. After a git pull, restart the dev server and hard-reload until this matches the repository.">build {typeof __KINAOU_COMMIT__ === 'undefined' ? 'unknown' : __KINAOU_COMMIT__}{typeof __KINAOU_STARTED__ === 'undefined' ? '' : ` · served since ${new Date(__KINAOU_STARTED__).toLocaleTimeString()}`}</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{t(`nav.${section}`)}</div><h1>{project?.title ?? 'KINAOU Studio'}</h1></div>
          <span className="status">{t('shell.status')}</span>
        </header>
        <p className="note">{t('ui.partial')}</p>

        {section === 'Projects' && <section className="stack">
          <div className="sectionLead"><div><div className="eyebrow">{t('projects.library')}</div><h2>{t('projects.heading')}</h2></div><button className="primary" onClick={() => setSection('Create')}>{t('projects.new')}</button></div>
          {projects.length === 0 ? <div className="card emptyState">{t('projects.empty')}</div> : <div className="projectGrid">{projects.map((item) => <button className="projectCard card" key={item.id} onClick={() => openProject(item)}><div className="eyebrow">{sourceKindLabel(item)}</div><h3>{item.title}</h3><p>{t('projects.summary', { tracks: item.tracks.length, assets: item.assets.length })}</p><small>{t('projects.updated', { date: new Date(item.updatedAt).toLocaleString(language) })}</small></button>)}</div>}
          <ProjectBackupPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} onRestore={restoreBackupProject} />
        </section>}

        {section === 'Create' && <section className="hero card createPanel">
          <div><div className="eyebrow">{t('nav.Create')}</div><h2>{t('create.heading')}</h2><p>{t('create.help')}</p></div>
          <div className="formStack">
            <label>{t('create.title')}<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder={t('create.titleHint')} /></label>
            <label>{t('create.kind')}<select value={inputKind} onChange={(event) => setInputKind(event.target.value as CreationInputKind)}>{creationKinds.map((kind) => <option key={kind} value={kind}>{t(`kind.${kind}`)}</option>)}</select></label>
            <label>{t('create.brief')}<textarea value={inputContent} onChange={(event) => setInputContent(event.target.value)} placeholder={t('create.briefHint')} /></label>
            <button className="primary" onClick={createNewProject}>{t('create.submit')}</button>
          </div>
        </section>}

        {section === 'Director' && (project ? <section className="stack"><DirectorPanel project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /><MediaPlanPanel project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /></section> : <section className="card emptyState">{t('shell.openProject')}</section>)}
        {section === 'Audio' && (project ? <AudioStudioPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}
        {section === 'Avatar' && (project ? <PortraitPresenterPanel key={project.id} project={project} history={versionHistory} onProjectChange={persistProject} onOpenStudio={() => setSection('Studio')} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}
        {section === 'Images' && (project ? <ImageStudioPanel project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}
        {section === 'Video' && (project ? <VideoStudioPanel key={`${project.id}:${workerUrl}:${workerToken}`} project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}
        {section === 'Capture' && (project ? <CapturePanel project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}
        {section === 'Publish' && (project ? <PublishPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}

        {section === 'Course' && (project ? <CoursePanel key={project.id} project={project} history={versionHistory} onProjectChange={persistProject} onOpenStudio={() => setSection('Studio')} /> : <section className="card emptyState">{t('shell.openProject')}</section>)}

        {section === 'Studio' && <section className="stack">
          {!project ? <div className="card emptyState">{t('shell.openProject')}</div> : <>
            <div className="sectionLead"><div><div className="eyebrow">{t('timeline.heading')}</div><h2>Studio</h2></div><span className="status">{t('timeline.status')}</span></div>
            <StudioProxyPreview project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} />
            <TimelinePreview project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} />
            <VersionHistoryPanel key={project.id} project={project} history={versionHistory} onProjectChange={persistProject} />
            <AiEditorPanel project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} />
            <StoryboardAssemblyPanel project={project} history={versionHistory} onProjectChange={persistProject} />
            <ScriptCaptionsPanel key={`script-captions-${project.id}`} project={project} history={versionHistory} onProjectChange={persistProject} />
            <SceneVoiceoverPanel project={project} history={versionHistory} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} />
            <TimelineEditor key={`timeline-${project.id}`} project={project} history={versionHistory} onProjectChange={persistProject} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} />
            <CaptionEditor key={`captions-${project.id}`} project={project} history={versionHistory} onProjectChange={persistProject} />
            <RenderPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} />
            <div className="card note">{t('timeline.boundary')}</div>
          </>}
        </section>}

        {section === 'Assets' && <section className="stack">
          <div className="sectionLead"><div><div className="eyebrow">MANAGED MEDIA</div><h2>Assets</h2></div><span className={workerHandshake ? 'status online' : 'status'}>{workerHandshake ? 'WORKER ONLINE' : 'WORKER NOT CONNECTED'}</span></div>
          {!project ? <div className="card emptyState">{t('shell.openProject')}</div> : <>
            <SttPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} />
            <AssetUploadPanel project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} />
            <AssetAvailabilityControl project={project} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} onProjectChange={persistProject} />
            <div className="card settingsPanel">
              <div><div className="eyebrow">PROBE EXISTING MANAGED MEDIA</div><h3>Inspect a file already inside KINAOU/Assets</h3><p>The worker resolves only managed paths under the configured KINAOU root.</p></div>
              <div className="formStack">
                <label>Managed path<input value={assetPath} onChange={(event) => { setAssetPath(event.target.value); setAssetProbe(null) }} placeholder="KINAOU/Assets/clip.mp4" /></label>
                <label>Kind<select value={assetKind} onChange={(event) => setAssetKind(event.target.value as ImportableMediaKind)}><option value="video">Video</option><option value="audio">Audio</option><option value="image">Image</option></select></label>
                <label>Name<input value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="Optional display name" /></label>
                <button className="primary" disabled={workerBusy || !workerToken.trim()} onClick={probeManagedAsset}>{workerBusy ? 'Checking…' : 'Probe media'}</button>
              </div>
            </div>
            {workerError && <div className="card errorBox">{workerError}</div>}
            {assetProbe && <div className="card probeCard"><div><div className="eyebrow">PROBE RESULT</div><h3>{assetName || assetPath.split('/').pop()}</h3></div><div className="probeGrid"><span>Duration<strong>{assetProbe.durationMs !== undefined ? `${(assetProbe.durationMs / 1000).toFixed(2)} s` : '—'}</strong></span><span>Size<strong>{assetProbe.sizeBytes !== undefined ? `${(assetProbe.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '—'}</strong></span><span>Video<strong>{assetProbe.width !== undefined && assetProbe.height !== undefined ? `${assetProbe.width}×${assetProbe.height}` : '—'}</strong></span><span>Audio<strong>{assetProbe.sampleRate !== undefined ? `${assetProbe.sampleRate} Hz` : '—'}</strong></span></div><button className="primary" onClick={addProbedAssetToProject}>Add managed asset to project</button></div>}
            <div className="card"><div className="eyebrow">PROJECT ASSETS</div>{project.assets.length === 0 ? <p className="cardBody">No assets yet.</p> : <div className="assetList">{project.assets.map((asset) => <div className="assetRow assetRowWithPlacement" key={asset.id}><div><strong>{String(asset.metadata.name ?? asset.metadata.label ?? asset.id)}</strong><small>{asset.kind} · {asset.managed ? 'managed' : 'external/planning'}</small><VideoThumbnailControl project={project} asset={asset} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /><WaveformControl project={project} asset={asset} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /></div><code>{asset.uri}</code><span className={asset.offline ? 'badge offline' : 'badge'}>{asset.offline ? 'OFFLINE' : 'AVAILABLE'}</span><div><AssetPlacementControl project={project} asset={asset} onProjectChange={persistProject} /><VideoProxyControl project={project} asset={asset} workerUrl={workerUrl} workerToken={workerToken} workerConnected={Boolean(workerHandshake)} workerCapabilities={workerHandshake?.capabilities ?? []} onProjectChange={persistProject} /></div></div>)}</div>}</div>
          </>}
        </section>}

        {section === 'Settings' && <SettingsPanel
          workerUrl={workerUrl} workerToken={workerToken} workerBusy={workerBusy} workerError={workerError} workerHandshake={workerHandshake}
          onWorkerUrlChange={(value) => { setWorkerUrl(value); setWorkerHandshake(null); setWorkerError('') }}
          onWorkerTokenChange={(value) => { setWorkerToken(value); setWorkerHandshake(null); setWorkerError('') }}
          onTestConnection={testWorkerConnection} storage={storage} workspaceRoot={workspaceRoot} storageBackend={storageBackend}
          onWorkspaceRootChange={setWorkspaceRoot} onStorageBackendChange={setStorageBackend} onSaveStorage={saveStorageProfile}
        />}

        {!['Projects', 'Create', 'Director', 'Studio', 'Course', 'Assets', 'Avatar', 'Audio', 'Images', 'Video', 'Capture', 'Publish', 'Settings'].includes(section) && <section className="card emptyState"><div className="eyebrow">{t(`nav.${section}`)}</div><h2>{t('shell.reserved')}</h2><p>{t('shell.reservedHelp')}</p></section>}
      </main>
    </div>
  )
}

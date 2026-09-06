import { useMemo, useState } from 'react'
import { createProjectFromInput, type CreationInputKind } from './core/create'
import { importProbedMedia, type ImportableMediaKind } from './core/mediaImport'
import { ProjectRepository, StorageSettingsRepository } from './core/persistence'
import { touchProject, type KinaouAsset, type KinaouProject, type TimelineTrack } from './core/project'
import { configureWorkspaceRoot, storageTarget, type StorageBackend, type StorageSettings } from './core/storage'
import { applyTimelineOperation } from './core/timeline'
import { WorkerClient } from './core/workerClient'
import type { MediaProbeResult, WorkerHandshake } from './core/workerProtocol'

const nav = ['Projects', 'Create', 'Director', 'Studio', 'Assets', 'Avatar', 'Audio', 'Publish', 'Analytics', 'Settings']
const storageAreas = ['models', 'projects', 'assets', 'cache', 'temp', 'renders', 'archive'] as const

export function App() {
  const projectRepo = useMemo(() => new ProjectRepository(window.localStorage), [])
  const storageRepo = useMemo(() => new StorageSettingsRepository(window.localStorage), [])
  const [projects, setProjects] = useState<KinaouProject[]>(() => projectRepo.list())
  const [project, setProject] = useState<KinaouProject | null>(() => projectRepo.list()[0] ?? null)
  const [section, setSection] = useState(projects.length ? 'Projects' : 'Create')
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

  function addPlanningBlock(track: TimelineTrack) {
    if (!project) return
    const assetId = crypto.randomUUID()
    const asset: KinaouAsset = {
      id: assetId,
      kind: 'other',
      uri: `kinaou://planning/${assetId}`,
      managed: false,
      offline: false,
      metadata: { label: 'Planning block' }
    }
    const withAsset = touchProject({ ...project, assets: [...project.assets, asset] })
    const lastEnd = track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
    const next = applyTimelineOperation(withAsset, {
      type: 'add-clip',
      trackId: track.id,
      clip: {
        id: crypto.randomUUID(),
        assetId,
        startMs: lastEnd,
        durationMs: 5000,
        sourceOffsetMs: 0,
        gain: 1,
        speed: 1
      }
    })
    persistProject(next)
  }

  function moveClip(trackId: string, clipId: string, currentStart: number, delta: number) {
    if (!project) return
    persistProject(applyTimelineOperation(project, {
      type: 'move-clip', trackId, clipId, startMs: Math.max(0, currentStart + delta)
    }))
  }

  function removeClip(trackId: string, clipId: string) {
    if (!project) return
    persistProject(applyTimelineOperation(project, { type: 'remove-clip', trackId, clipId }))
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
        <div className="tagline">AI does the work. You stay in control.</div>
        <nav>{nav.map((item) => (
          <button key={item} className={item === section ? 'navItem active' : 'navItem'} onClick={() => setSection(item)}>{item}</button>
        ))}</nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><div className="eyebrow">{section}</div><h1>{project?.title ?? 'KINAOU Studio'}</h1></div>
          <span className="status">LOCAL-FIRST · WORKER BRIDGE</span>
        </header>

        {section === 'Projects' && (
          <section className="stack">
            <div className="sectionLead"><div><div className="eyebrow">PROJECT LIBRARY</div><h2>Your work survives reloads</h2></div><button className="primary" onClick={() => setSection('Create')}>New project</button></div>
            {projects.length === 0 ? <div className="card emptyState">No saved projects yet.</div> : <div className="projectGrid">{projects.map((item) => (
              <button className="projectCard card" key={item.id} onClick={() => openProject(item)}>
                <div className="eyebrow">{String((item.metadata.sourceInput as { kind?: string } | undefined)?.kind ?? 'project')}</div>
                <h3>{item.title}</h3><p>{item.tracks.length} tracks · {item.assets.length} assets</p><small>Updated {new Date(item.updatedAt).toLocaleString()}</small>
              </button>
            ))}</div>}
          </section>
        )}

        {section === 'Create' && (
          <section className="hero card createPanel">
            <div><div className="eyebrow">CREATE</div><h2>What do you want to make?</h2><p>This creates a real persistent KINAOU project with a non-destructive timeline foundation. AI generation is not simulated.</p></div>
            <div className="formStack">
              <label>Project title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Zanzibar documentary" /></label>
              <label>Starting point<select value={inputKind} onChange={(event) => setInputKind(event.target.value as CreationInputKind)}><option value="idea">Idea</option><option value="document">Document</option><option value="url">URL</option><option value="image">Image</option><option value="audio">Audio</option><option value="video">Video</option></select></label>
              <label>Source / brief<textarea value={inputContent} onChange={(event) => setInputContent(event.target.value)} placeholder="Describe the work, paste a URL, or note the source you want to use." /></label>
              <button className="primary" onClick={createNewProject}>Create persistent project</button>
            </div>
          </section>
        )}

        {section === 'Studio' && (
          <section className="stack">
            {!project ? <div className="card emptyState">Create or open a project first.</div> : <>
              <div className="sectionLead"><div><div className="eyebrow">NON-DESTRUCTIVE TIMELINE</div><h2>Studio</h2></div><span className="status">AUTO-SAVED</span></div>
              <div className="timeline card">{project.tracks.map((track) => (
                <div className="trackRow" key={track.id}>
                  <div className="trackLabel"><strong>{track.name}</strong><small>{track.type}</small><button onClick={() => addPlanningBlock(track)}>+ planning block</button></div>
                  <div className="trackLane">{track.clips.length === 0 ? <span className="laneHint">Empty track</span> : track.clips.map((clip) => {
                    const asset = project.assets.find((item) => item.id === clip.assetId)
                    return <div className="clip" key={clip.id} style={{ marginLeft: `${Math.min(clip.startMs / 100, 140)}px`, width: `${Math.max(90, Math.min(clip.durationMs / 25, 220))}px` }}>
                      <strong>{String(asset?.metadata.name ?? asset?.metadata.label ?? 'Clip')}</strong><small>{(clip.startMs / 1000).toFixed(1)}s · {(clip.durationMs / 1000).toFixed(1)}s</small>
                      <div className="clipActions"><button onClick={() => moveClip(track.id, clip.id, clip.startMs, -1000)}>← 1s</button><button onClick={() => moveClip(track.id, clip.id, clip.startMs, 1000)}>1s →</button><button onClick={() => removeClip(track.id, clip.id)}>Remove</button></div>
                    </div>
                  })}</div>
                </div>
              ))}</div>
              <div className="card note"><strong>Current boundary:</strong> timeline metadata and real managed assets are supported. Complex multi-track rendering and AI generation are not presented as complete yet.</div>
            </>}
          </section>
        )}

        {section === 'Assets' && (
          <section className="stack">
            <div className="sectionLead"><div><div className="eyebrow">MANAGED MEDIA</div><h2>Assets</h2></div><span className={workerHandshake ? 'status online' : 'status'}>{workerHandshake ? 'WORKER ONLINE' : 'WORKER NOT CONNECTED'}</span></div>
            {!project ? <div className="card emptyState">Create or open a project before importing media.</div> : <>
              <div className="card settingsPanel">
                <div><div className="eyebrow">PROBE EXISTING MANAGED MEDIA</div><h3>Inspect a file already inside KINAOU/Assets</h3><p>The worker is only allowed to resolve managed paths under the configured KINAOU root.</p></div>
                <div className="formStack">
                  <label>Managed path<input value={assetPath} onChange={(event) => { setAssetPath(event.target.value); setAssetProbe(null) }} placeholder="KINAOU/Assets/clip.mp4" /></label>
                  <label>Kind<select value={assetKind} onChange={(event) => setAssetKind(event.target.value as ImportableMediaKind)}><option value="video">Video</option><option value="audio">Audio</option><option value="image">Image</option></select></label>
                  <label>Name<input value={assetName} onChange={(event) => setAssetName(event.target.value)} placeholder="Optional display name" /></label>
                  <button className="primary" disabled={workerBusy || !workerToken.trim()} onClick={probeManagedAsset}>{workerBusy ? 'Checking…' : 'Probe media'}</button>
                </div>
              </div>
              {workerError && <div className="card errorBox">{workerError}</div>}
              {assetProbe && <div className="card probeCard"><div><div className="eyebrow">PROBE RESULT</div><h3>{assetName || assetPath.split('/').pop()}</h3></div><div className="probeGrid"><span>Duration<strong>{assetProbe.durationMs !== undefined ? `${(assetProbe.durationMs / 1000).toFixed(2)} s` : '—'}</strong></span><span>Size<strong>{assetProbe.sizeBytes !== undefined ? `${(assetProbe.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '—'}</strong></span><span>Video<strong>{assetProbe.video ? `${assetProbe.video.width}×${assetProbe.video.height}` : '—'}</strong></span><span>Audio<strong>{assetProbe.audio ? `${assetProbe.audio.sampleRate ?? '—'} Hz` : '—'}</strong></span></div><button className="primary" onClick={addProbedAssetToProject}>Add managed asset to project</button></div>}
              <div className="card"><div className="eyebrow">PROJECT ASSETS</div>{project.assets.length === 0 ? <p>No assets yet.</p> : <div className="assetList">{project.assets.map((asset) => <div className="assetRow" key={asset.id}><div><strong>{String(asset.metadata.name ?? asset.metadata.label ?? asset.id)}</strong><small>{asset.kind} · {asset.managed ? 'managed' : 'external/planning'}</small></div><code>{asset.uri}</code><span className={asset.offline ? 'badge offline' : 'badge'}>{asset.offline ? 'OFFLINE' : 'AVAILABLE'}</span></div>)}</div>}</div>
            </>}
          </section>
        )}

        {section === 'Settings' && (
          <section className="stack">
            <div className="card settingsPanel">
              <div><div className="eyebrow">LOCAL WORKER</div><h2>Connect the Mac worker</h2><p>The token stays in memory only. KINAOU accepts localhost HTTP endpoints only.</p></div>
              <div className="formStack"><label>Worker URL<input value={workerUrl} onChange={(event) => setWorkerUrl(event.target.value)} /></label><label>Session token<input type="password" value={workerToken} onChange={(event) => setWorkerToken(event.target.value)} placeholder="Paste the worker token" /></label><button className="primary" disabled={workerBusy || !workerToken.trim()} onClick={testWorkerConnection}>{workerBusy ? 'Connecting…' : 'Test connection'}</button></div>
            </div>
            {workerHandshake && <div className="card"><div className="sectionLead"><div><div className="eyebrow">WORKER ONLINE</div><h3>{workerHandshake.name}</h3></div><span className="status online">CONNECTED</span></div><p>{workerHandshake.platform}</p><div className="chipRow">{workerHandshake.capabilities.map((capability) => <span className="chip" key={capability}>{capability}</span>)}</div></div>}
            {workerError && <div className="card errorBox">{workerError}</div>}
            <div className="card settingsPanel">
              <div><div className="eyebrow">STORAGE PROFILE</div><h2>Internal or external storage</h2><p>KINAOU only owns paths below its managed <code>KINAOU/</code> directory. Existing folders beside it remain outside KINAOU's deletion boundary.</p></div>
              <div className="formStack"><label>Backend<select value={storageBackend} onChange={(event) => setStorageBackend(event.target.value as StorageBackend)}><option value="browser">Browser storage</option><option value="desktop-worker">Desktop worker / filesystem</option></select></label><label>Workspace root<input value={workspaceRoot} onChange={(event) => setWorkspaceRoot(event.target.value)} placeholder="/Volumes/YourSSD" /></label><button className="primary" onClick={saveStorageProfile}>Save storage profile</button></div>
            </div>
            <div className="card"><div className="eyebrow">MANAGED TARGETS</div><ul className="paths">{storageAreas.map((area) => <li key={area}><span>{area}</span><code>{storageTarget(storage, area)}</code></li>)}</ul><div className={storage.backend === 'desktop-worker' ? 'note' : 'note'}>{storage.backend === 'desktop-worker' ? 'External filesystem profile configured. Real media access is available when the local worker is running and authenticated.' : 'Browser mode stores project metadata locally. Heavy media should use the desktop worker / external SSD adapter.'}</div></div>
          </section>
        )}

        {!['Projects', 'Create', 'Studio', 'Assets', 'Settings'].includes(section) && <section className="card emptyState"><div className="eyebrow">{section.toUpperCase()}</div><h2>Engine slot reserved</h2><p>This area is intentionally not presented as functional until its underlying engine exists.</p></section>}
      </main>
    </div>
  )
}

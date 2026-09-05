import { useMemo, useState } from 'react'
import { createProjectFromInput, type CreationInputKind } from './core/create'
import { ProjectRepository, StorageSettingsRepository } from './core/persistence'
import { touchProject, type KinaouAsset, type KinaouProject, type TimelineTrack } from './core/project'
import { configureWorkspaceRoot, storageTarget, type StorageBackend, type StorageSettings } from './core/storage'
import { applyTimelineOperation } from './core/timeline'

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
    const next = applyTimelineOperation(project, {
      type: 'move-clip',
      trackId,
      clipId,
      startMs: Math.max(0, currentStart + delta)
    })
    persistProject(next)
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

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">KINAOU</div>
        <div className="tagline">AI does the work. You stay in control.</div>
        <nav>
          {nav.map((item) => (
            <button key={item} className={item === section ? 'navItem active' : 'navItem'} onClick={() => setSection(item)}>
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">{section}</div>
            <h1>{project?.title ?? 'KINAOU Studio'}</h1>
          </div>
          <span className="status">LOCAL-FIRST · PROJECT CORE</span>
        </header>

        {section === 'Projects' && (
          <section className="stack">
            <div className="sectionLead">
              <div><div className="eyebrow">PROJECT LIBRARY</div><h2>Your work survives reloads</h2></div>
              <button className="primary" onClick={() => setSection('Create')}>New project</button>
            </div>
            {projects.length === 0 ? <div className="card emptyState">No saved projects yet.</div> : (
              <div className="projectGrid">
                {projects.map((item) => (
                  <button className="projectCard card" key={item.id} onClick={() => openProject(item)}>
                    <div className="eyebrow">{String((item.metadata.sourceInput as { kind?: string } | undefined)?.kind ?? 'project')}</div>
                    <h3>{item.title}</h3>
                    <p>{item.tracks.length} tracks · {item.assets.length} assets</p>
                    <small>Updated {new Date(item.updatedAt).toLocaleString()}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {section === 'Create' && (
          <section className="hero card createPanel">
            <div>
              <div className="eyebrow">CREATE</div>
              <h2>What do you want to make?</h2>
              <p>This creates a real persistent KINAOU project with a non-destructive timeline foundation. AI generation is not simulated.</p>
            </div>
            <div className="formStack">
              <label>Project title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="e.g. Zanzibar documentary" /></label>
              <label>Starting point<select value={inputKind} onChange={(event) => setInputKind(event.target.value as CreationInputKind)}>
                <option value="idea">Idea</option><option value="document">Document</option><option value="url">URL</option><option value="image">Image</option><option value="audio">Audio</option><option value="video">Video</option>
              </select></label>
              <label>Source / brief<textarea value={inputContent} onChange={(event) => setInputContent(event.target.value)} placeholder="Describe the work, paste a URL, or note the source you want to use." /></label>
              <button className="primary" onClick={createNewProject}>Create persistent project</button>
            </div>
          </section>
        )}

        {section === 'Studio' && (
          <section className="stack">
            {!project ? <div className="card emptyState">Create or open a project first.</div> : <>
              <div className="sectionLead"><div><div className="eyebrow">NON-DESTRUCTIVE TIMELINE</div><h2>Studio</h2></div><span className="status">AUTO-SAVED</span></div>
              <div className="timeline card">
                {project.tracks.map((track) => (
                  <div className="trackRow" key={track.id}>
                    <div className="trackLabel"><strong>{track.name}</strong><small>{track.type}</small><button onClick={() => addPlanningBlock(track)}>+ planning block</button></div>
                    <div className="trackLane">
                      {track.clips.length === 0 ? <span className="laneHint">Empty track</span> : track.clips.map((clip) => (
                        <div className="clip" key={clip.id} style={{ marginLeft: `${Math.min(clip.startMs / 100, 140)}px`, width: `${Math.max(90, Math.min(clip.durationMs / 25, 220))}px` }}>
                          <strong>Planning block</strong><small>{(clip.startMs / 1000).toFixed(1)}s · {(clip.durationMs / 1000).toFixed(1)}s</small>
                          <div className="clipActions"><button onClick={() => moveClip(track.id, clip.id, clip.startMs, -1000)}>← 1s</button><button onClick={() => moveClip(track.id, clip.id, clip.startMs, 1000)}>1s →</button><button onClick={() => removeClip(track.id, clip.id)}>Remove</button></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card note"><strong>Current boundary:</strong> timeline metadata, project persistence and edit operations are real. Media decoding/rendering and AI generation are the next engine layers and are not faked here.</div>
            </>}
          </section>
        )}

        {section === 'Settings' && (
          <section className="stack">
            <div className="card settingsPanel">
              <div><div className="eyebrow">STORAGE PROFILE</div><h2>Internal or external storage</h2><p>KINAOU only owns paths below its managed <code>KINAOU/</code> directory. Existing folders beside it remain outside KINAOU's deletion boundary.</p></div>
              <div className="formStack">
                <label>Backend<select value={storageBackend} onChange={(event) => setStorageBackend(event.target.value as StorageBackend)}><option value="browser">Browser storage</option><option value="desktop-worker">Desktop worker / filesystem</option></select></label>
                <label>Workspace root<input value={workspaceRoot} onChange={(event) => setWorkspaceRoot(event.target.value)} placeholder="/Volumes/YourSSD" /></label>
                <button className="primary" onClick={saveStorageProfile}>Save storage profile</button>
              </div>
            </div>
            <div className="card">
              <div className="eyebrow">MANAGED TARGETS</div>
              <ul className="paths">{storageAreas.map((area) => <li key={area}><span>{area}</span><code>{storageTarget(storage, area)}</code></li>)}</ul>
              <div className={storage.backend === 'desktop-worker' ? 'warning' : 'note'}>{storage.backend === 'desktop-worker' ? 'External filesystem profile configured. Actual SSD reads/writes stay disabled until the desktop worker adapter is connected.' : 'Browser mode stores project metadata locally. Heavy media should later use the desktop worker / external SSD adapter.'}</div>
            </div>
          </section>
        )}

        {!['Projects', 'Create', 'Studio', 'Settings'].includes(section) && (
          <section className="card emptyState"><div className="eyebrow">{section.toUpperCase()}</div><h2>Engine slot reserved</h2><p>This area is intentionally not presented as functional until its underlying engine exists.</p></section>
        )}
      </main>
    </div>
  )
}

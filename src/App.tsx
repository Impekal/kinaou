import { useMemo, useState } from 'react'
import { createProject, type KinaouProject } from './core/project'
import { defaultStorageSettings } from './core/storage'

const nav = ['Projects', 'Create', 'Director', 'Studio', 'Assets', 'Avatar', 'Audio', 'Publish', 'Analytics', 'Settings']

export function App() {
  const [project, setProject] = useState<KinaouProject>(() => createProject('Untitled project'))
  const [title, setTitle] = useState(project.title)
  const [section, setSection] = useState('Projects')
  const storage = useMemo(() => defaultStorageSettings.locations, [])

  function saveTitle() {
    const next = title.trim() || 'Untitled project'
    setTitle(next)
    setProject((current) => ({ ...current, title: next, updatedAt: new Date().toISOString() }))
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
            <h1>{project.title}</h1>
          </div>
          <span className="status">LOCAL-FIRST · FOUNDATION</span>
        </header>

        <section className="hero card">
          <div>
            <div className="eyebrow">CREATE SOMETHING WORTH REMEMBERING</div>
            <h2>What do you want to make?</h2>
            <p>Start from an idea, document, URL, image, audio or existing video. KINAOU will build a non-destructive project around it.</p>
          </div>
          <div className="projectForm">
            <input value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle} aria-label="Project title" />
            <button className="primary" onClick={saveTitle}>Create project</button>
          </div>
        </section>

        <section className="grid">
          <article className="card">
            <div className="eyebrow">PROJECT ENGINE</div>
            <h3>Structured, not destructive</h3>
            <p>Script, storyboard, assets, tracks and edit decisions stay editable. Final media is rendered from the project state.</p>
            <div className="metric"><strong>{project.tracks.length}</strong><span>timeline tracks</span></div>
            <div className="metric"><strong>{project.assets.length}</strong><span>managed assets</span></div>
          </article>

          <article className="card">
            <div className="eyebrow">STORAGE</div>
            <h3>External-SSD ready</h3>
            <p>Every heavy storage area is independently relocatable while staying inside a managed KINAOU directory.</p>
            <ul className="paths">
              {Object.entries(storage).map(([key, value]) => <li key={key}><span>{key}</span><code>{value}</code></li>)}
            </ul>
          </article>

          <article className="card">
            <div className="eyebrow">AI ORCHESTRATOR</div>
            <h3>Models stay replaceable</h3>
            <p>Reasoning, image, video, STT, TTS, avatar and other capabilities plug in through adapters instead of being hard-wired.</p>
          </article>
        </section>
      </main>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { assemblyTargetTracks } from '../core/storyboardAssembly'
import { placeSceneNarration, planSceneVoiceovers, voiceoverTargetTracks, type NarratedScene, type SkippedVoiceoverScene } from '../core/sceneVoiceover'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

const terminal = new Set(['succeeded', 'failed', 'cancelled'])

export function SceneVoiceoverPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const visualTracks = useMemo(() => assemblyTargetTracks(project), [project])
  const voiceTracks = useMemo(() => voiceoverTargetTracks(project), [project])
  const [visualId, setVisualId] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [voices, setVoices] = useState<string[]>([])
  const [voice, setVoice] = useState('')
  const [busy, setBusy] = useState('')
  const [narrated, setNarrated] = useState<NarratedScene[] | null>(null)
  const [skipped, setSkipped] = useState<SkippedVoiceoverScene[]>([])
  const [error, setError] = useState('')

  const effectiveVisual = visualTracks.some((track) => track.id === visualId) ? visualId : visualTracks[0]?.id ?? ''
  const effectiveVoice = voiceTracks.some((track) => track.id === voiceId) ? voiceId : voiceTracks[0]?.id ?? ''
  const selectedVoiceTrack = voiceTracks.find((track) => track.id === effectiveVoice)
  const available = workerConnected && workerCapabilities.includes('text-to-speech')
  const client = () => new WorkerClient({ baseUrl: workerUrl, token: workerToken })

  const blockedReason = !project.storyboard.length
    ? 'This project has no storyboard scenes yet. Create a Director plan first.'
    : !available
      ? 'Local text-to-speech is not available. Install Piper and put a voice into KINAOU/Models, then reconnect the worker.'
      : !voiceTracks.length
        ? 'This project has no voice track.'
        : selectedVoiceTrack?.locked
          ? `"${selectedVoiceTrack.name}" is locked. Unlock it in the timeline below.`
          : !effectiveVisual
            ? 'No visual track to read scene timings from.'
            : !voice
              ? 'Detect a Piper voice first.'
              : ''

  async function detect() {
    setError('')
    try {
      const found = await client().listTtsVoices()
      setVoices(found)
      setVoice(found[0] ?? '')
      if (!found.length) setError('No managed Piper voice (an .onnx file with its .json) was found under KINAOU/Models.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Voice discovery failed')
    }
  }

  async function awaitJob(id: string) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const job = await client().ttsStatus(id)
      if (terminal.has(job.state)) return job
    }
    throw new Error('Narration did not finish in time')
  }

  async function narrate() {
    if (blockedReason || busy) return
    setError('')
    setNarrated(null)
    setSkipped([])
    let current = project
    const done: NarratedScene[] = []
    try {
      const plan = planSceneVoiceovers(current, effectiveVisual)
      setSkipped(plan.skipped)
      if (!plan.pending.length) {
        setNarrated([])
        return
      }
      history.snapshot(current, 'Before generating scene narration', 'system')

      for (const scene of plan.pending) {
        setBusy(`Narrating “${scene.title}” · ${done.length + 1} of ${plan.pending.length}`)
        const started = await client().startTts(scene.text, voice)
        const job = await awaitJob(started.id)
        if (job.state !== 'succeeded') {
          setSkipped((previous) => [...previous, { sceneId: scene.sceneId, title: scene.title, reason: job.error ?? `Narration ${job.state}` }])
          continue
        }
        const placed = placeSceneNarration(current, scene, job, effectiveVoice)
        current = placed.project
        done.push(placed.narrated)
        // Persist after every scene: a long run stays useful even if a later one fails.
        onProjectChange(current)
        setNarrated([...done])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generating narration failed')
    } finally {
      setBusy('')
      setNarrated((previous) => previous ?? done)
    }
  }

  return (
    <div className="card availabilityPanel">
      <div>
        <div className="eyebrow">SCRIPT → NARRATION</div>
        <h3>Speak each scene with a local voice</h3>
        <p>Reads every scene description aloud through your installed Piper voice and places the result under that scene on the voice track. Narration keeps its natural length — cutting a sentence to fit a picture would swallow words — so anything that runs past its scene is reported instead of trimmed. Scenes that already have narration are skipped, and restoring the automatic version removes the whole batch.</p>
      </div>
      <div className="directorActions">
        <button className="secondaryButton" disabled={!available || Boolean(busy)} onClick={detect}>Detect voices</button>
        <label>Voice<select aria-label="Piper voice" value={voice} onChange={(event) => setVoice(event.target.value)}><option value="">Detect a voice first</option>{voices.map((path) => <option key={path} value={path}>{path.split('/').pop()}</option>)}</select></label>
        <label>Scene timings from<select aria-label="Track to read scene timings from" value={effectiveVisual} onChange={(event) => setVisualId(event.target.value)}>{visualTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
        <label>Narration track<select aria-label="Track for the narration" value={effectiveVoice} onChange={(event) => setVoiceId(event.target.value)}>{voiceTracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</select></label>
        <button className="primary" disabled={Boolean(blockedReason) || Boolean(busy)} onClick={narrate}>{busy || 'Narrate the scenes'}</button>
      </div>
      {blockedReason && <div className="warning">{blockedReason}</div>}
      {error && <div className="errorBox">{error}</div>}
      {(narrated || skipped.length > 0) && <div className="assetList">
        {(narrated ?? []).map((entry) => <div className="assetRow" key={entry.sceneId}>
          <div><strong>{entry.title}</strong><small>{(entry.narrationMs / 1000).toFixed(1)}s of narration from {(entry.startMs / 1000).toFixed(1)}s{entry.overrunMs ? ` · ${(entry.overrunMs / 1000).toFixed(1)}s longer than the scene — extend the scene or shorten the text` : ''}</small></div>
          <span className={entry.overrunMs ? 'badge offline' : 'badge'}>{entry.overrunMs ? 'OVERRUNS' : 'NARRATED'}</span>
        </div>)}
        {skipped.map((entry) => <div className="assetRow" key={entry.sceneId}>
          <div><strong>{entry.title}</strong><small>{entry.reason}</small></div>
          <span className="badge offline">SKIPPED</span>
        </div>)}
      </div>}
    </div>
  )
}

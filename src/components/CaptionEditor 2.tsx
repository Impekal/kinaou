import { useState } from 'react'
import { addCaption, updateCaptionText } from '../core/captions'
import type { KinaouProject } from '../core/project'

export function CaptionEditor({ project, onProjectChange }: { project: KinaouProject; onProjectChange: (project: KinaouProject) => void }) {
  const [text, setText] = useState('')
  const [startSeconds, setStartSeconds] = useState('0')
  const [durationSeconds, setDurationSeconds] = useState('3')
  const captionTrack = project.tracks.find((track) => track.type === 'caption')
  const captions = captionTrack?.clips.map((clip) => ({ clip, asset: project.assets.find((asset) => asset.id === clip.assetId) })).filter((item) => item.asset?.kind === 'caption') ?? []

  function create() {
    onProjectChange(addCaption(project, { text, startMs: Math.round(Number(startSeconds) * 1000), durationMs: Math.round(Number(durationSeconds) * 1000) }))
    setText('')
    if (captionTrack) setStartSeconds(String(captionTrack.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0) / 1000))
  }

  return <div className="card captionEditor">
    <div><div className="eyebrow">CAPTIONS</div><h3>Burn-in subtitles</h3><p>Text stays structured in the project. Rendering creates and removes a temporary ASS file inside KINAOU/Temp.</p></div>
    <div className="captionCreate">
      <label>Caption text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Enter subtitle text…" /></label>
      <label>Start (seconds)<input type="number" min="0" step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(event.target.value)} /></label>
      <label>Duration (seconds)<input type="number" min="0.1" step="0.1" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} /></label>
      <button className="primary" disabled={!text.trim() || Number(startSeconds) < 0 || Number(durationSeconds) <= 0 || captionTrack?.locked} onClick={create}>Add caption</button>
    </div>
    {captions.length > 0 && <div className="captionList">{captions.map(({ clip, asset }) => <label key={clip.id}>{(clip.startMs / 1000).toFixed(1)}s–{((clip.startMs + clip.durationMs) / 1000).toFixed(1)}s<textarea defaultValue={String(asset?.metadata.text ?? '')} disabled={captionTrack?.locked} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== asset?.metadata.text) onProjectChange(updateCaptionText(project, clip.assetId, event.target.value)) }} /></label>)}</div>}
  </div>
}

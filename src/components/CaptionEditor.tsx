import { useState } from 'react'
import { addCaption, addTranscriptCaptions, updateCaptionText } from '../core/captions'
import type { KinaouProject } from '../core/project'
import { parseSttTranscript } from '../core/sttJobs'
import type { PersistentVersionHistory } from '../core/versioning'

export function CaptionEditor({ project, history, onProjectChange }: { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }) {
  const [text, setText] = useState('')
  const [startSeconds, setStartSeconds] = useState('0')
  const [durationSeconds, setDurationSeconds] = useState('3')
  const captionTrack = project.tracks.find((track) => track.type === 'caption')
  const captions = captionTrack?.clips.map((clip) => ({ clip, asset: project.assets.find((asset) => asset.id === clip.assetId) })).filter((item) => item.asset?.kind === 'caption') ?? []
  const transcripts = project.assets.flatMap((asset) => { try { return asset.kind === 'document' ? [{ asset, transcript: parseSttTranscript(asset.metadata.transcript) }] : [] } catch { return [] } })
  const [transcriptId, setTranscriptId] = useState('')
  const [selectedSegments, setSelectedSegments] = useState<number[]>([])
  const selectedTranscript = transcripts.find((item) => item.asset.id === transcriptId)

  function create() {
    onProjectChange(addCaption(project, { text, startMs: Math.round(Number(startSeconds) * 1000), durationMs: Math.round(Number(durationSeconds) * 1000) }))
    setText('')
    if (captionTrack) setStartSeconds(String(captionTrack.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0) / 1000))
  }

  function importSegments() {
    if (!selectedTranscript || !selectedSegments.length) return
    history.snapshot(project, `Before transcript captions: ${String(selectedTranscript.asset.metadata.name ?? selectedTranscript.asset.id)}`, 'system')
    onProjectChange(addTranscriptCaptions(project, selectedTranscript.asset.id, selectedSegments))
    setSelectedSegments([])
  }

  return <div className="card captionEditor">
    <div><div className="eyebrow">CAPTIONS</div><h3>Burn-in subtitles</h3><p>Text stays structured in the project. Rendering creates and removes a temporary ASS file inside KINAOU/Temp.</p></div>
    <div className="captionCreate">
      <label>Caption text<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Enter subtitle text…" /></label>
      <label>Start (seconds)<input type="number" min="0" step="0.1" value={startSeconds} onChange={(event) => setStartSeconds(event.target.value)} /></label>
      <label>Duration (seconds)<input type="number" min="0.1" step="0.1" value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)} /></label>
      <button className="primary" disabled={!text.trim() || Number(startSeconds) < 0 || Number(durationSeconds) <= 0 || captionTrack?.locked} onClick={create}>Add caption</button>
    </div>
    {transcripts.length > 0 && <div className="transcriptImport"><label>Transcript<select value={transcriptId} onChange={(event) => { setTranscriptId(event.target.value); setSelectedSegments([]) }}><option value="">Select transcript for review</option>{transcripts.map(({ asset }) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}</select></label>{selectedTranscript && <><div className="transcriptSegments">{selectedTranscript.transcript.segments.map((segment, index) => <label key={`${segment.startMs}-${index}`}><input type="checkbox" checked={selectedSegments.includes(index)} onChange={(event) => setSelectedSegments((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index))} /><span><strong>{(segment.startMs / 1000).toFixed(2)}s–{(segment.endMs / 1000).toFixed(2)}s</strong>{segment.text}</span></label>)}</div><button className="primary" disabled={!selectedSegments.length || captionTrack?.locked} onClick={importSegments}>Add {selectedSegments.length} reviewed segment{selectedSegments.length === 1 ? '' : 's'} as captions</button></>}</div>}
    {captions.length > 0 && <div className="captionList">{captions.map(({ clip, asset }) => <label key={clip.id}>{(clip.startMs / 1000).toFixed(1)}s–{((clip.startMs + clip.durationMs) / 1000).toFixed(1)}s<textarea defaultValue={String(asset?.metadata.text ?? '')} disabled={captionTrack?.locked} onBlur={(event) => { if (event.target.value.trim() && event.target.value.trim() !== asset?.metadata.text) onProjectChange(updateCaptionText(project, clip.assetId, event.target.value)) }} /></label>)}</div>}
  </div>
}

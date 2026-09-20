import { useState } from 'react'
import { addCaption, addTranscriptCaptions, updateCaptionText } from '../core/captions'
import { captionDraftInput, commitCaptionChange } from '../core/captionEditing'
import type { KinaouProject } from '../core/project'
import { parseSttTranscript } from '../core/sttJobs'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }

function CaptionTextDraft({ saved, locked, range, save }: { saved: string; locked: boolean; range: string; save: (text: string) => void }) {
  const { t } = useUiLanguage()
  const [draft, setDraft] = useState({ base: saved, text: saved })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const dirty = draft.text !== draft.base
  // External history/restore changes never silently overwrite a local text draft.
  const conflict = dirty && draft.base !== saved
  const text = dirty ? draft.text : saved
  function submit() {
    if (locked || conflict || !text.trim()) return
    setError(null); setSuccess(null)
    try { save(text); setDraft({ base: text.trim(), text: text.trim() }); setSuccess(text.trim()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  return <div>
    <label>{t('caption.text')} · {range}<textarea value={text} disabled={locked} onChange={(event) => { setDraft({ base: dirty ? draft.base : saved, text: event.target.value }); setSuccess(null); setError(null) }} /></label>
    {dirty && <small>{t('caption.draft')}</small>}
    {conflict && <p role="alert">{t('caption.conflict')}</p>}
    <div className="directorActions">
      <button className="secondaryButton" disabled={!dirty || !text.trim() || locked || conflict} onClick={submit}>{t('caption.save')}</button>
      <button className="secondaryButton" disabled={!dirty} onClick={() => { setDraft({ base: saved, text: saved }); setError(null); setSuccess(null) }}>{t('caption.discard')}</button>
    </div>
    {success !== null && success === saved && <div role="status">{t('caption.saved')}</div>}
    {error !== null && <CaptionError detail={error} />}
  </div>
}

function CaptionError({ detail }: { detail: string }) {
  const { t } = useUiLanguage()
  return <div className="errorBox" role="alert">{t('caption.failed')}<details><summary>{t('common.details')}</summary>{detail}</details></div>
}

export function CaptionEditor({ project, history, onProjectChange }: Props) {
  const { language, t } = useUiLanguage()
  const [text, setText] = useState('')
  const [startSeconds, setStartSeconds] = useState('0')
  const [durationSeconds, setDurationSeconds] = useState('3')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<'caption.saved' | 'caption.imported' | null>(null)
  const captionTrack = project.tracks.find((track) => track.type === 'caption')
  const captions = captionTrack?.clips.map((clip) => ({ clip, asset: project.assets.find((asset) => asset.id === clip.assetId) })).filter((item) => item.asset?.kind === 'caption') ?? []
  const transcripts = project.assets.flatMap((asset) => { try { return asset.kind === 'document' ? [{ asset, transcript: parseSttTranscript(asset.metadata.transcript) }] : [] } catch { return [] } })
  const [transcriptId, setTranscriptId] = useState('')
  const [selectedSegments, setSelectedSegments] = useState<number[]>([])
  const selectedTranscript = transcripts.find((item) => item.asset.id === transcriptId)
  const input = captionDraftInput(text, startSeconds, durationSeconds)
  const blocked = !captionTrack ? 'caption.noTrack' : captionTrack.locked ? 'caption.locked' : null
  const range = (start: number, end: number) => t('caption.range', {
    start: (start / 1000).toLocaleString(language, { maximumFractionDigits: 3 }),
    end: (end / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  })
  function clearFeedback() { setError(null); setMessage(null) }
  function commit(change: () => KinaouProject, label: string) { return commitCaptionChange(project, change, history, onProjectChange, label) }

  function create() {
    if (blocked || !input) return
    clearFeedback()
    try {
      const next = commit(() => addCaption(project, input), 'Before adding a caption')
      setText('')
      setTouched(false)
      const track = next.tracks.find((item) => item.type === 'caption')!
      setStartSeconds(String(track.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0) / 1000))
      setMessage('caption.saved')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  function importSegments() {
    if (blocked || !selectedTranscript || !selectedSegments.length) return
    clearFeedback()
    try {
      commit(() => addTranscriptCaptions(project, selectedTranscript.asset.id, selectedSegments), `Before transcript captions: ${String(selectedTranscript.asset.metadata.name ?? selectedTranscript.asset.id)}`)
      setSelectedSegments([]); setMessage('caption.imported')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  return <div className="card captionEditor">
    <div><div className="eyebrow">{t('caption.eyebrow')}</div><h3>{t('caption.heading')}</h3><p>{t('caption.help')}</p></div>
    {blocked && <p role="status">{t(blocked)}</p>}
    <div className="captionCreate">
      <label>{t('caption.text')}<textarea value={text} onChange={(event) => { setText(event.target.value); setTouched(true); clearFeedback() }} placeholder={t('caption.placeholder')} /></label>
      <label>{t('caption.start')}<input type="number" min="0" step="0.001" value={startSeconds} onChange={(event) => { setStartSeconds(event.target.value); setTouched(true); clearFeedback() }} /></label>
      <label>{t('caption.duration')}<input type="number" min="0.001" step="0.001" value={durationSeconds} onChange={(event) => { setDurationSeconds(event.target.value); setTouched(true); clearFeedback() }} /></label>
      <button className="primary" disabled={!input || Boolean(blocked)} onClick={create}>{t('caption.add')}</button>
    </div>
    {!input && touched && <p>{t('caption.invalid')}</p>}
    {message && <div className="successBox" role="status">{t(message)}</div>}
    {error !== null && <CaptionError detail={error} />}
    {transcripts.length > 0 && <div className="transcriptImport">
      <label>{t('caption.transcript')}<select value={selectedTranscript ? transcriptId : ''} onChange={(event) => { setTranscriptId(event.target.value); setSelectedSegments([]); clearFeedback() }}>
        <option value="">{t('caption.select')}</option>
        {transcripts.map(({ asset }) => <option key={asset.id} value={asset.id}>{String(asset.metadata.name ?? asset.id)}</option>)}
      </select></label>
      <p>{t('caption.importHelp')}</p>
      {selectedTranscript && <>
        <div className="transcriptSegments">{selectedTranscript.transcript.segments.map((segment, index) => <label key={`${segment.startMs}-${index}`}>
          <input type="checkbox" checked={selectedSegments.includes(index)} onChange={(event) => { setSelectedSegments((current) => event.target.checked ? [...current, index] : current.filter((item) => item !== index)); clearFeedback() }} />
          <span><strong>{range(segment.startMs, segment.endMs)}</strong>{segment.text}</span>
        </label>)}</div>
        <button className="primary" disabled={!selectedSegments.length || Boolean(blocked)} onClick={importSegments}>{t(selectedSegments.length === 1 ? 'caption.importOne' : 'caption.importMany', { count: selectedSegments.length })}</button>
      </>}
    </div>}
    {captions.length > 0 && <div className="captionList">{captions.map(({ clip, asset }) => <CaptionTextDraft
      key={clip.id} saved={String(asset?.metadata.text ?? '')} range={range(clip.startMs, clip.startMs + clip.durationMs)}
      locked={project.tracks.some((track) => track.locked && track.clips.some((item) => item.assetId === clip.assetId))}
      save={(value) => { clearFeedback(); commit(() => updateCaptionText(project, clip.assetId, value), 'Before editing caption text') }}
    />)}</div>}
  </div>
}

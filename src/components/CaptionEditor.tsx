import { useState } from 'react'
import { addCaption, addTranscriptCaptions, updateCaptionText } from '../core/captions'
import { captionDraftInput, commitCaptionChange } from '../core/captionEditing'
import { captionStyleForClip, clearCaptionClipStyle, setCaptionClipStyle } from '../core/captionStyle'
import type { CaptionStyle, KinaouProject } from '../core/project'
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


export function CaptionStyleDraft({
  saved,
  explicit,
  locked,
  save,
  reset
}: {
  saved: CaptionStyle
  explicit: boolean
  locked: boolean
  save: (style: CaptionStyle) => void
  reset: () => void
}) {
  const { t } =
    useUiLanguage()

  const savedKey =
    JSON.stringify(
      saved
    )

  const [
    draft,
    setDraft
  ] =
    useState<{
      base:
        string

      value:
        CaptionStyle
    }>({
      base:
        savedKey,

      value:
        saved
    })

  const [
    error,
    setError
  ] =
    useState<
      string
      | null
    >(
      null
    )

  const [
    success,
    setSuccess
  ] =
    useState(
      false
    )

  const draftKey =
    JSON.stringify(
      draft.value
    )

  const dirty =
    draftKey
    !== draft.base

  const conflict =
    dirty
    && draft.base
      !== savedKey

  const value =
    dirty
      ? draft.value
      : saved

  function update(
    next:
      Partial<
        CaptionStyle
      >
  ) {
    setDraft({
      base:
        dirty
          ? draft.base
          : savedKey,

      value: {
        ...value,
        ...next
      }
    })

    setSuccess(
      false
    )

    setError(
      null
    )
  }

  function apply() {
    if (
      !dirty
      || locked
      || conflict
    ) {
      return
    }

    setError(
      null
    )

    setSuccess(
      false
    )

    try {
      save(
        value
      )

      setDraft({
        base:
          JSON.stringify(
            value
          ),

        value: {
          ...value
        }
      })

      setSuccess(
        true
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  function discard() {
    setDraft({
      base:
        savedKey,

      value: {
        ...saved
      }
    })

    setSuccess(
      false
    )

    setError(
      null
    )
  }

  function restoreDefault() {
    if (
      locked
      || !explicit
      || conflict
    ) {
      return
    }

    setError(
      null
    )

    setSuccess(
      false
    )

    try {
      reset()

      const defaults:
        CaptionStyle = {
          preset:
            'clean',

          position:
            'bottom',

          size:
            'medium'
        }

      setDraft({
        base:
          JSON.stringify(
            defaults
          ),

        value:
          defaults
      })

      setSuccess(
        true
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  return (
    <div className="renderJob">
      <div className="renderJobHead">
        <strong>
          {t(
            'caption.styleHeading'
          )}
        </strong>

        <span>
          {t(
            'caption.styleDefault'
          )}
        </span>
      </div>

      <p className="cardBody">
        {t(
          'caption.styleHelp'
        )}
      </p>

      <div className="fieldGrid">
        <label>
          {t(
            'caption.stylePreset'
          )}

          <select
            value={
              value.preset
            }
            disabled={
              locked
            }
            onChange={
              event =>
                update({
                  preset:
                    event.target
                      .value as CaptionStyle['preset']
                })
            }
          >
            <option value="clean">
              {t(
                'caption.style.clean'
              )}
            </option>

            <option value="strong">
              {t(
                'caption.style.strong'
              )}
            </option>

            <option value="boxed">
              {t(
                'caption.style.boxed'
              )}
            </option>
          </select>
        </label>

        <label>
          {t(
            'caption.stylePosition'
          )}

          <select
            value={
              value.position
            }
            disabled={
              locked
            }
            onChange={
              event =>
                update({
                  position:
                    event.target
                      .value as CaptionStyle['position']
                })
            }
          >
            <option value="top">
              {t(
                'caption.position.top'
              )}
            </option>

            <option value="center">
              {t(
                'caption.position.center'
              )}
            </option>

            <option value="bottom">
              {t(
                'caption.position.bottom'
              )}
            </option>
          </select>
        </label>

        <label>
          {t(
            'caption.styleSize'
          )}

          <select
            value={
              value.size
            }
            disabled={
              locked
            }
            onChange={
              event =>
                update({
                  size:
                    event.target
                      .value as CaptionStyle['size']
                })
            }
          >
            <option value="small">
              {t(
                'caption.size.small'
              )}
            </option>

            <option value="medium">
              {t(
                'caption.size.medium'
              )}
            </option>

            <option value="large">
              {t(
                'caption.size.large'
              )}
            </option>
          </select>
        </label>
      </div>

      {dirty && (
        <small>
          {t(
            'caption.styleDraft'
          )}
        </small>
      )}

      {conflict && (
        <p role="alert">
          {t(
            'caption.styleConflict'
          )}
        </p>
      )}

      <div className="directorActions">
        <button
          className="primary"
          disabled={
            !dirty
            || locked
            || conflict
          }
          onClick={
            apply
          }
        >
          {t(
            'caption.styleApply'
          )}
        </button>

        <button
          className="secondaryButton"
          disabled={
            !dirty
          }
          onClick={
            discard
          }
        >
          {t(
            'caption.styleDiscard'
          )}
        </button>

        <button
          className="secondaryButton"
          disabled={
            locked
            || !explicit
            || conflict
          }
          onClick={
            restoreDefault
          }
        >
          {t(
            'caption.styleReset'
          )}
        </button>
      </div>

      {success && (
        <div
          className="successBox"
          role="status"
        >
          {t(
            'caption.styleSaved'
          )}
        </div>
      )}

      {error !== null && (
        <CaptionError
          detail={
            error
          }
        />
      )}
    </div>
  )
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
    {captions.length > 0 && <div className="captionList">{captions.map(({ clip, asset }) => {
      const locked = project.tracks.some((track) => track.locked && track.clips.some((item) => item.assetId === clip.assetId))
      const style = captionStyleForClip(clip)

      return <div key={clip.id}>
        <CaptionTextDraft
          saved={String(asset?.metadata.text ?? '')}
          range={range(clip.startMs, clip.startMs + clip.durationMs)}
          locked={locked}
          save={(value) => { clearFeedback(); commit(() => updateCaptionText(project, clip.assetId, value), 'Before editing caption text') }}
        />

        <CaptionStyleDraft
          saved={style}
          explicit={Boolean(clip.captionStyle)}
          locked={locked}
          save={(value) => {
            clearFeedback()
            commit(
              () => setCaptionClipStyle(project, captionTrack!.id, clip.id, value),
              'Before editing caption style'
            )
          }}
          reset={() => {
            clearFeedback()
            commit(
              () => clearCaptionClipStyle(project, captionTrack!.id, clip.id),
              'Before resetting caption style'
            )
          }}
        />
      </div>
    })}</div>}
  </div>
}

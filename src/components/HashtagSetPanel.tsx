import { useEffect, useRef, useState } from 'react'
import { clearHashtagSet, hashtagEvidence, hashtagLine, hashtagVariants, projectHashtagSet, reviewHashtagInput, saveHashtagSet, type HashtagEvidence, type HashtagVariant } from '../core/hashtagSet'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }

export function hashtagEvidenceBadge(evidence: HashtagEvidence): 'both' | 'script' | 'trend' | 'none' {
  if (evidence.inScript && evidence.trends.length) return 'both'
  if (evidence.inScript) return 'script'
  return evidence.trends.length ? 'trend' : 'none'
}

export function HashtagSetPanel({ project, history, onProjectChange }: Props) {
  const { t, language } = useUiLanguage()
  const [variant, setVariant] = useState<HashtagVariant>('main')
  const saved = projectHashtagSet(project, variant)
  const savedKey = JSON.stringify([project.id, variant, saved])
  const synchronized = useRef('')
  const [input, setInput] = useState('')
  const [limit, setLimit] = useState(5)
  const [message, setMessage] = useState<'saved' | 'copied' | 'copyFailed' | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (synchronized.current === savedKey) return
    synchronized.current = savedKey
    setInput(saved ? saved.tags.map(entry => entry.keyword).join('\n') : ''); setLimit(saved?.limit ?? 5); setMessage(null); setError('')
  }, [savedKey])

  const review = reviewHashtagInput(input, limit)
  const sameAsSaved = Boolean(saved) && saved!.limit === limit && !review.blocked.length
    && JSON.stringify(saved!.tags) === JSON.stringify(review.usable.map(candidate => ({ tag: candidate.tag, keyword: candidate.keyword })))
  const savable = review.usable.length > 0 && !review.blocked.length && !review.overLimit && !sameAsSaved
  const date = (value: string) => new Date(value).toLocaleString(language)

  function save() {
    setMessage(null); setError('')
    try {
      const next = saveHashtagSet(project, variant, input, limit)
      if (next !== project) { history.snapshot(project, 'Before changing the hashtag list', 'system'); onProjectChange(next) }
      setMessage('saved')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  function clear() {
    setMessage(null); setError('')
    const next = clearHashtagSet(project, variant)
    if (next !== project) { history.snapshot(project, 'Before changing the hashtag list', 'system'); onProjectChange(next) }
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setMessage('copied') } catch { setMessage('copyFailed') }
  }

  return <div className="card settingsPanel">
    <div><h3>{t('hashtag.heading')}</h3><p>{t('hashtag.help')}</p><p><small>{t('hashtag.boundary')}</small></p></div>
    <div className="formStack">
      <label>{t('hashtag.variant')}<select value={variant} onChange={event => setVariant(event.target.value as HashtagVariant)}>{hashtagVariants.map(id => <option key={id} value={id}>{t(`hashtag.variant.${id}`)}</option>)}</select></label>
      <label>{t('hashtag.keywords')}<textarea value={input} maxLength={6000} onChange={event => { setInput(event.target.value); setMessage(null); setError('') }} /></label>
      <label>{t('hashtag.limit')}<input type="number" min={1} max={60} value={limit} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 60) { setLimit(value); setMessage(null) } }} /></label>
      {review.blocked.map((candidate, index) => <div className="warning" role="status" key={`${candidate.keyword}-${index}`}>{t(`hashtag.issue.${candidate.issue!}`, { keyword: candidate.keyword })}</div>)}
      {review.overLimit > 0 && <div className="warning" role="status">{t('hashtag.overLimit', { count: review.overLimit })}</div>}
      {review.usable.map(candidate => {
        const evidence = hashtagEvidence(project, candidate.keyword)
        const badge = hashtagEvidenceBadge(evidence)
        return <div className="assetRow" key={candidate.tag!}>
          <div>
            <strong>#{candidate.tag}</strong>{candidate.rewritten && <small>{t('hashtag.rewritten', { keyword: candidate.keyword })}</small>}
            <small>{evidence.scriptScenes ? t('hashtag.evidence.script', { count: evidence.scriptScenes }) : evidence.inScript ? t('hashtag.evidence.scriptOnly') : t('hashtag.evidence.noScript')}</small>
            {evidence.trends.length === 0 && <small>{t('hashtag.evidence.noTrend')}</small>}
            {evidence.trends.map((trend, index) => <small key={index}>{t('hashtag.evidence.trend', { country: trend.country, date: date(trend.retrievedAt), traffic: trend.reportedTraffic ? t('hashtag.evidence.traffic', { value: trend.reportedTraffic }) : '' })}</small>)}
          </div>
          <span className={badge === 'none' ? 'badge offline' : 'badge'}>{t(`hashtag.badge.${badge}`)}</span>
        </div>
      })}
      <div className="directorActions">
        {saved && <button onClick={clear}>{t('hashtag.clear')}</button>}
        <button className="primary" disabled={!savable} onClick={save}>{t('hashtag.save')}</button>
      </div>
      {saved && !sameAsSaved && <small role="status">{t('hashtag.unsaved')}</small>}
      {error && <div className="errorBox" role="alert">{t('hashtag.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
      {saved && <div className="formStack">
        <small>{t('hashtag.savedAt', { date: date(saved.savedAt) })}</small>
        <label>{t('hashtag.line')}<input readOnly value={hashtagLine(saved)} onFocus={event => event.currentTarget.select()} /></label>
        <div className="directorActions"><button className="secondaryButton" onClick={() => { void copy(hashtagLine(saved)) }}>{t('hashtag.copy')}</button></div>
      </div>}
      {message && <div className="note" role="status">{t(`hashtag.${message}`)}</div>}
    </div>
  </div>
}

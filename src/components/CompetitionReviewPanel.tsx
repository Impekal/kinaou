import { useEffect, useRef, useState } from 'react'
import { competitionReviewIssue, competitionReviewSchema, projectCompetitionReview, saveCompetitionReview, summarizeCompetitionReview, type CompetitionEntry, type CompetitionReview } from '../core/competitionReview'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void; today?: string }

const localToday = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

export function CompetitionReviewPanel({ project, history, onProjectChange, today = localToday() }: Props) {
  const { t } = useUiLanguage()
  const saved = projectCompetitionReview(project)
  const savedKey = JSON.stringify([project.id, saved])
  const synchronized = useRef(savedKey)
  const [draft, setDraft] = useState<CompetitionReview>(saved)
  const [message, setMessage] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (synchronized.current === savedKey) return
    synchronized.current = savedKey
    setDraft(projectCompetitionReview(project)); setMessage(false); setError('')
  }, [savedKey])

  const issue = competitionReviewIssue(draft, today)
  const normalized = issue ? null : competitionReviewSchema.safeParse(draft)
  const dirty = !normalized?.success || JSON.stringify(normalized.data) !== JSON.stringify(saved)
  const change = (next: CompetitionReview) => { setDraft(next); setMessage(false); setError('') }
  const patch = (id: string, field: keyof Omit<CompetitionEntry, 'id'>, value: string) => change({ ...draft, entries: draft.entries.map(entry => entry.id === id ? { ...entry, [field]: value } : entry) })
  const summary = summarizeCompetitionReview(saved, today)

  function save() {
    setMessage(false); setError('')
    try {
      const next = saveCompetitionReview(project, draft)
      if (next !== project) { history.snapshot(project, 'Before changing the competition notes', 'system'); onProjectChange(next) }
      synchronized.current = JSON.stringify([project.id, projectCompetitionReview(next)])
      setDraft(projectCompetitionReview(next)); setMessage(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  return <div className="card stack">
    <h3>{t('competition.heading')}</h3><p>{t('competition.help')}</p><p><small>{t('competition.boundary')}</small></p>
    <p role="status">{summary.entries ? t('competition.summary', { entries: summary.entries, oldest: summary.oldest!, newest: summary.newest!, age: summary.oldestAgeDays!, gaps: summary.withGap }) : t('competition.none')}</p>
    {summary.entries > 0 && !saved.angle && <div className="warning" role="status">{t('competition.noAngle')}</div>}
    <div className="formStack">
      <label>{t('competition.topic')}<input value={draft.topic} maxLength={300} onChange={event => change({ ...draft, topic: event.target.value })} /></label>
      {draft.entries.map((entry, index) => <fieldset key={entry.id}>
        <legend>{t('competition.entry', { number: index + 1 })}</legend>
        <label>{t('competition.url')}<input type="url" value={entry.url} maxLength={2000} onChange={event => patch(entry.id, 'url', event.target.value)} /></label>
        <label>{t('competition.title')}<input value={entry.title} maxLength={200} onChange={event => patch(entry.id, 'title', event.target.value)} /></label>
        <label>{t('competition.where')}<input value={entry.where} maxLength={60} onChange={event => patch(entry.id, 'where', event.target.value)} /></label>
        <label>{t('competition.observedOn')}<input type="date" value={entry.observedOn} max={today} onChange={event => patch(entry.id, 'observedOn', event.target.value)} /></label>
        <label>{t('competition.shownFigure')}<input value={entry.shownFigure} maxLength={80} onChange={event => patch(entry.id, 'shownFigure', event.target.value)} /></label>
        <label>{t('competition.covers')}<textarea value={entry.covers} maxLength={1000} onChange={event => patch(entry.id, 'covers', event.target.value)} /></label>
        <label>{t('competition.leavesOut')}<textarea value={entry.leavesOut} maxLength={1000} onChange={event => patch(entry.id, 'leavesOut', event.target.value)} /></label>
        <div className="directorActions"><button onClick={() => change({ ...draft, entries: draft.entries.filter(item => item.id !== entry.id) })}>{t('competition.remove')}</button></div>
      </fieldset>)}
      <label>{t('competition.angle')}<textarea value={draft.angle} maxLength={1500} onChange={event => change({ ...draft, angle: event.target.value })} /></label>
      {issue && <div className="warning" role="status">{t(`competition.issue.${issue.issue}`, { number: issue.index + 1 })}</div>}
      <div className="directorActions">
        <button className="secondaryButton" disabled={draft.entries.length >= 50} onClick={() => change({ ...draft, entries: [...draft.entries, { id: crypto.randomUUID(), url: '', title: '', where: '', observedOn: today, shownFigure: '', covers: '', leavesOut: '' }] })}>{t('competition.add')}</button>
        <button className="primary" disabled={Boolean(issue) || !dirty} onClick={save}>{t('competition.save')}</button>
      </div>
      {message && <div className="note" role="status">{t('competition.saved')}</div>}
      {error && <div className="errorBox" role="alert">{t('competition.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    </div>
  </div>
}

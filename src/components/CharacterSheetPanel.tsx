import { useEffect, useRef, useState } from 'react'
import { characterSheetSchema, imageCharacterUse, projectCharacterSheet, saveCharacterSheet, sceneCast, type CharacterSheet } from '../core/characterSheet'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { project: KinaouProject; history: PersistentVersionHistory; onProjectChange: (project: KinaouProject) => void }

type Issue = 'name' | 'appearance' | 'duplicate' | 'limit'

export function characterSheetIssue(draft: CharacterSheet): Issue | null {
  if (draft.characters.length > 24) return 'limit'
  if (draft.characters.some(character => !character.name.trim())) return 'name'
  if (draft.characters.some(character => !character.appearance.trim())) return 'appearance'
  const names = draft.characters.map(character => character.name.trim().toLocaleLowerCase())
  if (new Set(names).size !== names.length) return 'duplicate'
  return null
}

export function CharacterSheetPanel({ project, history, onProjectChange }: Props) {
  const { t } = useUiLanguage()
  const saved = projectCharacterSheet(project)
  const savedKey = JSON.stringify([project.id, saved])
  const synchronized = useRef(savedKey)
  const [draft, setDraft] = useState<CharacterSheet>(saved)
  const [message, setMessage] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (synchronized.current === savedKey) return
    synchronized.current = savedKey
    setDraft(projectCharacterSheet(project)); setMessage(false); setError('')
  }, [savedKey])

  const issue = characterSheetIssue(draft)
  const normalized = issue ? null : characterSheetSchema.safeParse(draft)
  const dirty = !normalized?.success || JSON.stringify(normalized.data) !== JSON.stringify(saved)
  const change = (next: CharacterSheet) => { setDraft(next); setMessage(false); setError('') }
  const patch = (id: string, field: 'name' | 'appearance' | 'voice', value: string) => change({ ...draft, characters: draft.characters.map(character => character.id === id ? { ...character, [field]: value } : character) })

  function save() {
    setMessage(false); setError('')
    try {
      const next = saveCharacterSheet(project, draft)
      if (next !== project) { history.snapshot(project, 'Before changing the character sheet', 'system'); onProjectChange(next) }
      synchronized.current = JSON.stringify([project.id, projectCharacterSheet(next)])
      setDraft(projectCharacterSheet(next)); setMessage(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  // The lists below describe the saved sheet, never an unsaved draft.
  const cast = sceneCast(project, saved)
  const images = imageCharacterUse(project, saved)
  const nameOf = (id: string) => saved.characters.find(character => character.id === id)?.name ?? id

  return <div className="card settingsPanel">
    <div><h3>{t('cast.heading')}</h3><p>{t('cast.help')}</p><p><small>{t('cast.boundary')}</small></p></div>
    <div className="formStack">
      <label>{t('cast.style')}<input value={draft.style} maxLength={1000} placeholder={t('cast.stylePlaceholder')} onChange={event => change({ ...draft, style: event.target.value })} /></label>
      {draft.characters.map(character => <div className="formStack" key={character.id}>
        <label>{t('cast.name')}<input value={character.name} maxLength={80} onChange={event => patch(character.id, 'name', event.target.value)} /></label>
        <label>{t('cast.appearance')}<textarea value={character.appearance} maxLength={1200} onChange={event => patch(character.id, 'appearance', event.target.value)} /></label>
        <label>{t('cast.voice')}<input value={character.voice} maxLength={600} onChange={event => patch(character.id, 'voice', event.target.value)} /></label>
        <div className="directorActions"><button onClick={() => change({ ...draft, characters: draft.characters.filter(entry => entry.id !== character.id) })}>{t('cast.remove')}</button></div>
      </div>)}
      {issue && <div className="warning" role="status">{t(`cast.issue.${issue}`)}</div>}
      <div className="directorActions">
        <button className="secondaryButton" disabled={draft.characters.length >= 24} onClick={() => change({ ...draft, characters: [...draft.characters, { id: crypto.randomUUID(), name: '', appearance: '', voice: '' }] })}>{t('cast.add')}</button>
        <button className="primary" disabled={Boolean(issue) || !dirty} onClick={save}>{t('cast.save')}</button>
      </div>
      {message && <div className="note" role="status">{t('cast.saved')}</div>}
      {error && <div className="errorBox" role="alert">{t('cast.failed')}<details><summary>{t('common.details')}</summary>{error}</details></div>}
    </div>
    {saved.characters.length > 0 && <div className="formStack">
      <h4>{t('cast.scenes')}</h4>
      <small>{t('cast.scenesHelp')}</small>
      {cast.scenes.map(scene => <div className="assetRow" key={scene.sceneId}><div><strong>{scene.title}</strong><small>{scene.characterIds.length ? scene.characterIds.map(nameOf).join(', ') : t('cast.sceneNone')}</small></div></div>)}
      {cast.unused.length > 0 && <div className="warning" role="status">{t('cast.unused', { names: cast.unused.map(nameOf).join(', ') })}</div>}
      <h4>{t('cast.images')}</h4>
      <small>{t('cast.imagesHelp')}</small>
      {images.length === 0 && <p>{t('cast.imagesNone')}</p>}
      {images.map(image => <div className="assetRow" key={image.assetId}>
        <div><strong>{image.name}</strong>{image.characters.map(entry => <small key={entry.characterId}>{t(`cast.image.${entry.state}`, { name: nameOf(entry.characterId) })}</small>)}</div>
        <span className={image.characters.every(entry => entry.state === 'current') ? 'badge' : 'badge offline'}>{t(image.characters.every(entry => entry.state === 'current') ? 'cast.badge.current' : 'cast.badge.different')}</span>
      </div>)}
    </div>}
  </div>
}

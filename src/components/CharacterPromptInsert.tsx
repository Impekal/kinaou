import { useState } from 'react'
import { addCharactersToPrompt, projectCharacterSheet, type CharacterSheet } from '../core/characterSheet'
import type { KinaouProject } from '../core/project'
import { useUiLanguage } from './UiLanguageProvider'

/** Puts the sheet's fixed wording into a prompt the author is still free to edit afterwards. */
export function CharacterPromptInsert({ project, prompt, disabled, onPrompt }: { project: KinaouProject; prompt: string; disabled?: boolean; onPrompt: (prompt: string) => void }) {
  const { t } = useUiLanguage()
  const [chosen, setChosen] = useState<string[]>([])
  let sheet: CharacterSheet
  try { sheet = projectCharacterSheet(project) } catch { return null }
  if (!sheet.characters.length) return <small>{t('cast.insert.empty')}</small>
  const selected = chosen.filter(id => sheet.characters.some(character => character.id === id))
  const next = addCharactersToPrompt(prompt, sheet, selected)
  return <fieldset disabled={disabled}>
    <legend>{t('cast.insert.heading')}</legend>
    <small>{t('cast.insert.help')}</small>
    {sheet.characters.map(character => <label className="optionToggle" key={character.id}><input type="checkbox" checked={selected.includes(character.id)} onChange={event => setChosen(event.target.checked ? [...selected, character.id] : selected.filter(id => id !== character.id))} /> {character.name}</label>)}
    <div className="directorActions"><button className="secondaryButton" disabled={!selected.length || next === prompt} onClick={() => onPrompt(next)}>{t('cast.insert.button')}</button></div>
    {selected.length > 0 && next === prompt && <small role="status">{t('cast.insert.present')}</small>}
  </fieldset>
}

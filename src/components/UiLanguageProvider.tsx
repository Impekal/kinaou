import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isUiLanguage, loadUiLanguage, saveUiLanguage, uiLanguageNames, uiLanguages, type UiLanguage } from '../core/uiLanguage'
import { translateUi, type UiMessageKey } from '../core/uiMessages'

interface UiContext {
  language: UiLanguage
  setLanguage: (language: UiLanguage) => void
  storageError: boolean
  t: (key: UiMessageKey, values?: Record<string, string | number>) => string
}
const Context = createContext<UiContext>({ language: 'en', setLanguage: () => {}, storageError: false, t: (key, values) => translateUi('en', key, values) })
export function useUiLanguage() { return useContext(Context) }

export function UiLanguageProvider({ children, initialLanguage }: { children: ReactNode; initialLanguage?: UiLanguage }) {
  const [language, setCurrent] = useState<UiLanguage>(() => {
    if (initialLanguage) return initialLanguage
    const languages = typeof navigator === 'undefined' ? [] : navigator.languages
    try { return loadUiLanguage(window.localStorage, languages) } catch { return loadUiLanguage(undefined, languages) }
  })
  const [storageError, setStorageError] = useState(false)
  useEffect(() => { document.documentElement.lang = language }, [language])
  function setLanguage(next: UiLanguage) {
    if (!isUiLanguage(next)) return
    setCurrent(next)
    try { saveUiLanguage(window.localStorage, next); setStorageError(false) } catch { setStorageError(true) }
  }
  return <Context.Provider value={{ language, setLanguage, storageError, t: (key, values) => translateUi(language, key, values) }}>{children}</Context.Provider>
}

export function UiLanguageSelector() {
  const { language, setLanguage, storageError, t } = useUiLanguage()
  return <div className="uiLanguage">
    <label>{t('ui.language')}<select value={language} onChange={(event) => setLanguage(event.target.value as UiLanguage)}>{uiLanguages.map((id) => <option key={id} value={id} lang={id}>{uiLanguageNames[id]}</option>)}</select></label>
    <small>{t('ui.independent')}</small>
    {storageError && <small role="alert">{t('ui.unsaved')}</small>}
  </div>
}

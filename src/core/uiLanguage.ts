import type { KeyValueStore } from './persistence'

export const uiLanguages = ['de', 'en', 'fr'] as const
export type UiLanguage = typeof uiLanguages[number]
export const uiLanguageNames: Record<UiLanguage, string> = { de: 'Deutsch', en: 'English', fr: 'Français' }
export const uiLanguageStorageKey = 'kinaou.ui-language.v1'
export function isUiLanguage(value: unknown): value is UiLanguage { return uiLanguages.includes(value as UiLanguage) }

/** UI preferences never read or write project/course content-language metadata. */
export function loadUiLanguage(store: Pick<KeyValueStore, 'getItem'> | undefined, browserLanguages: readonly string[] = []): UiLanguage {
  try { const saved = store?.getItem(uiLanguageStorageKey); if (isUiLanguage(saved)) return saved } catch { /* Restricted storage must not prevent startup. */ }
  for (const language of browserLanguages) {
    const base = language.toLowerCase().split(/[-_]/)[0]
    if (isUiLanguage(base)) return base
  }
  return 'en'
}

export function saveUiLanguage(store: Pick<KeyValueStore, 'setItem'>, language: UiLanguage): void {
  if (!isUiLanguage(language)) throw new Error('Unsupported UI language')
  store.setItem(uiLanguageStorageKey, language)
}

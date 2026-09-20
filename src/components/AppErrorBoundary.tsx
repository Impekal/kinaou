import { Component, type ReactNode } from 'react'
import { loadUiLanguage, type UiLanguage } from '../core/uiLanguage'
import { translateUi } from '../core/uiMessages'
import { useUiLanguage } from './UiLanguageProvider'

interface Props { children: ReactNode; language?: UiLanguage }
interface State { error: Error | null }

/** Also works when storage access or the language provider itself failed. */
export function recoveryLanguage(): UiLanguage {
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages
  try { return loadUiLanguage(typeof window === 'undefined' ? undefined : window.localStorage, languages) }
  catch { return loadUiLanguage(undefined, languages) }
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  render() {
    if (!this.state.error) return this.props.children
    const language = this.props.language ?? recoveryLanguage()
    const t = (key: Parameters<typeof translateUi>[1]) => translateUi(language, key)
    return (
      <main className="shell" lang={language}>
        <section className="card errorBoundary" role="alert">
          <div className="eyebrow">{t('recovery.eyebrow')}</div>
          <h2>{t('recovery.heading')}</h2>
          <p>{t('recovery.help')}</p>
          <details className="errorBox"><summary>{t('common.details')}</summary>{this.state.error.message}</details>
          <div className="directorActions">
            <button className="primary" onClick={() => this.setState({ error: null })}>{t('recovery.retry')}</button>
            <button className="secondaryButton" onClick={() => window.location.reload()}>{t('recovery.reload')}</button>
          </div>
        </section>
      </main>
    )
  }
}

export function LocalizedAppErrorBoundary({ children }: { children: ReactNode }) {
  const { language } = useUiLanguage()
  return <AppErrorBoundary language={language}>{children}</AppErrorBoundary>
}

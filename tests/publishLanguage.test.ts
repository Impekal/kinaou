import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PublishPanel } from '../src/components/PublishPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'
import { createProject } from '../src/core/project'
import { saveProjectPublishDefaults } from '../src/core/publishPackage'
import { translateUi } from '../src/core/uiMessages'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'

const expected: Record<UiLanguage, {
  eyebrow: string
  heading: string
  offline: string
  export: string
  destination: string
  placement: string
  save: string
  use: string
  clear: string
  library: string
  refresh: string
  preflight: string
  packageCreated: string
  modified: string
  generic: string
}> = {
  de: {
    eyebrow: 'LOKALE VERÖFFENTLICHUNGSÜBERGABE',
    heading: 'Fertigen Export vorbereiten',
    offline: 'WORKER OFFLINE',
    export: 'Erfolgreicher Export',
    destination: 'Plattform',
    placement: 'Veröffentlichungsformat',
    save: 'Als Projektstandard speichern',
    use: 'Gespeicherte Standards verwenden',
    clear: 'Gespeicherte Standards löschen',
    library: 'LOKALE PAKETBIBLIOTHEK',
    refresh: 'Pakete aktualisieren',
    preflight: 'MP4 entspricht ihrem Exportbeleg',
    packageCreated: 'PAKET ERSTELLT',
    modified: 'VERÄNDERT',
    generic: 'Allgemeine Übergabe'
  },
  en: {
    eyebrow: 'LOCAL PUBLISH HANDOFF',
    heading: 'Prepare a finished export',
    offline: 'WORKER OFFLINE',
    export: 'Successful export',
    destination: 'Platform',
    placement: 'Publishing placement',
    save: 'Save as project defaults',
    use: 'Use saved defaults',
    clear: 'Clear saved defaults',
    library: 'LOCAL PACKAGE LIBRARY',
    refresh: 'Refresh packages',
    preflight: 'MP4 matches its export receipt',
    packageCreated: 'PACKAGE CREATED',
    modified: 'MODIFIED',
    generic: 'Generic handoff'
  },
  fr: {
    eyebrow: 'REMISE LOCALE POUR PUBLICATION',
    heading: 'Préparer un export finalisé',
    offline: 'WORKER HORS LIGNE',
    export: 'Export réussi',
    destination: 'Plateforme',
    placement: 'Type de publication',
    save: 'Enregistrer comme valeurs par défaut du projet',
    use: 'Utiliser les valeurs enregistrées',
    clear: 'Effacer les valeurs enregistrées',
    library: 'BIBLIOTHÈQUE LOCALE DES PAQUETS',
    refresh: 'Actualiser les paquets',
    preflight: 'Le MP4 correspond à son reçu d’export',
    packageCreated: 'PAQUET CRÉÉ',
    modified: 'MODIFIÉ',
    generic: 'Remise générique'
  }
}

describe('Publish UI language', () => {
  it.each(uiLanguages)('renders the local Publish handoff in %s without rewriting saved metadata', (language) => {
    const base = createProject('Project <keep>', new Date('2026-09-21T18:00:00.000Z'))
    const project = saveProjectPublishDefaults(base, {
      platform: 'generic',
      title: 'Original title <keep>',
      description: 'Original description <keep>',
      tags: 'Alpha, Beta'
    }, new Date('2026-09-21T18:01:00.000Z'))
    const before = JSON.stringify(project)
    const onProjectChange = vi.fn()

    const html = renderToStaticMarkup(createElement(
      UiLanguageProvider,
      {
        initialLanguage: language,
        children: createElement(PublishPanel, {
          project,
          workerUrl: '',
          workerToken: '',
          workerConnected: false,
          workerCapabilities: [],
          onProjectChange
        })
      }
    ))

    const text = expected[language]
    expect(html).toContain(text.eyebrow)
    expect(html).toContain(text.heading)
    expect(html).toContain(text.offline)
    expect(html).toContain(text.export)
    expect(html).toContain(text.destination)
    expect(html).toContain(text.placement)
    expect(html).toContain(text.save)
    expect(html).toContain(text.use)
    expect(html).toContain(text.clear)
    expect(html).toContain(text.library)
    expect(html).toContain(text.refresh)
    expect(html).toContain('Original title &lt;keep&gt;')
    expect(html).toContain('Original description &lt;keep&gt;')
    expect(html).toContain('Alpha, Beta')
    expect(JSON.stringify(project)).toBe(before)
    expect(onProjectChange).not.toHaveBeenCalled()
  })

  it.each(uiLanguages)('has translated hidden Publish result, preflight and integrity states in %s', (language) => {
    const text = expected[language]
    expect(translateUi(language, 'publish.preflight.match')).toBe(text.preflight)
    expect(translateUi(language, 'publish.result.eyebrow')).toBe(text.packageCreated)
    expect(translateUi(language, 'publish.integrity.modified')).toBe(text.modified)
    expect(translateUi(language, 'publish.platform.generic')).toBe(text.generic)
  })
})

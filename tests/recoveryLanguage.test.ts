import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveUiMessage, translateUi, uiMessageReference } from '../src/core/uiMessages'
import { uiLanguages, type UiLanguage } from '../src/core/uiLanguage'

const expected: Record<UiLanguage, {
  worker: string
  placement: string
  fulfillment: string
  mediaPlan: string
  unconfirmed: string
  cancelWorker: string
}> = {
  de: {
    worker: 'Verbindung zum Worker fehlgeschlagen.',
    placement: 'Timeline-Einfügung fehlgeschlagen.',
    fulfillment: 'Szenenzuweisung fehlgeschlagen.',
    mediaPlan: 'Ungültiger Medienplan.',
    unconfirmed: 'Für eine Kurzvideo-Einreichung fehlt die gespeicherte Worker-Bestätigung. Prüfe den ursprünglichen Worker und die Ausgabe, bevor du diesen Stapel bewusst verwirfst. Es wird nichts automatisch erneut exportiert.',
    cancelWorker: 'Verbinde den ursprünglichen lokalen Worker, bevor du versuchst, den angenommenen Kurzvideo-Auftrag abzubrechen.'
  },
  en: {
    worker: 'Worker connection failed.',
    placement: 'Timeline placement failed.',
    fulfillment: 'Scene fulfillment failed.',
    mediaPlan: 'Invalid media plan.',
    unconfirmed: 'A Short submission has no saved worker acknowledgement. Inspect the original worker and output before deliberately discarding this batch. No export will be submitted automatically.',
    cancelWorker: 'Connect the original local worker before cancelling the accepted Short job.'
  },
  fr: {
    worker: 'Échec de la connexion au worker.',
    placement: 'Échec de l’insertion dans la timeline.',
    fulfillment: 'Échec de l’affectation à la scène.',
    mediaPlan: 'Plan média invalide.',
    unconfirmed: 'Une soumission de vidéo courte n’a pas de confirmation enregistrée du worker. Vérifiez le worker d’origine et la sortie avant de retirer volontairement ce lot. Aucun export ne sera renvoyé automatiquement.',
    cancelWorker: 'Reconnectez le worker local d’origine avant d’annuler la tâche de vidéo courte déjà acceptée.'
  }
}

describe('remaining UI recovery language', () => {
  it.each(uiLanguages)('translates shell and recovery fallbacks in %s', (language) => {
    const text = expected[language]
    expect(translateUi(language, 'recovery.workerConnection')).toBe(text.worker)
    expect(translateUi(language, 'recovery.placement')).toBe(text.placement)
    expect(translateUi(language, 'recovery.fulfillment')).toBe(text.fulfillment)
    expect(translateUi(language, 'recovery.mediaPlanInvalid')).toBe(text.mediaPlan)
    expect(translateUi(language, 'recovery.shortUnconfirmed')).toBe(text.unconfirmed)
    expect(translateUi(language, 'recovery.shortCancelOriginalWorker')).toBe(text.cancelWorker)
  })

  it('removes the old hard-coded visible fallback literals from the affected components', () => {
    const source = [
      'src/App.tsx',
      'src/components/AssetPlacementControl.tsx',
      'src/components/SceneFulfillmentControl.tsx',
      'src/components/MediaPlanPanel.tsx',
      'src/components/RenderPanel.tsx'
    ].map(path => readFileSync(path, 'utf8')).join('\n')

    for (const literal of [
      "'Worker connection failed'",
      "'Timeline placement failed'",
      "'Scene fulfillment failed'",
      "'Invalid media plan'",
      "'Could not save Short export receipts'",
      "'Could not save the Short maximum'",
      "'Could not save the Short recipe'",
      "'Could not prepare Short exports'",
      "'Could not retry the selected Short variants'",
      "'Could not save the cancellation request'",
      "'Connect the original local worker before cancelling the accepted Short job.'",
      "'Could not save the Short batch change'",
      "'Could not forget the Short recipe'"
    ]) expect(source).not.toContain(literal)
  })

  it.each(uiLanguages)('resolves stored KINAOU fallback references in the current language %s', (language) => {
    const stored = uiMessageReference('recovery.shortUnconfirmed')
    expect(resolveUiMessage(language, stored)).toBe(expected[language].unconfirmed)
    expect(resolveUiMessage(language, '<original technical failure>')).toBe('<original technical failure>')
  })

  it('keeps arbitrary technical Error.message details intact', () => {
    const placement = readFileSync('src/components/AssetPlacementControl.tsx', 'utf8')
    const render = readFileSync('src/components/RenderPanel.tsx', 'utf8')
    const mediaPlan = readFileSync('src/components/MediaPlanPanel.tsx', 'utf8')

    expect(placement).toContain('cause instanceof Error ? cause.message')
    expect(render).toContain('batchError instanceof Error ? batchError.message')
    expect(render).toContain('resumeError instanceof Error ? resumeError.message')
    expect(mediaPlan).toContain('cause instanceof Error ? cause.message : fallback')
    expect(render).toContain("uiMessageReference('recovery.shortUnconfirmed')")
    expect(render).toContain('resolveUiMessage(language, batchResumeError)')
  })

  it('does not localize persisted history or export labels in this slice', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    const render = readFileSync('src/components/RenderPanel.tsx', 'utf8')

    expect(app).toContain("'Before drive restore'")
    expect(render).toContain("'Whole timeline'")
    expect(render).toContain('`Custom range ${')
  })
})

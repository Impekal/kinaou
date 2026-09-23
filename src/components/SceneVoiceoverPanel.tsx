import { useEffect, useMemo, useRef, useState } from 'react'
import { projectContentProfile } from '../core/contentProfile'
import type { SpeechVoiceDescriptor } from '../core/speech'
import { SpeechVoiceSelect } from './SpeechVoiceSelect'
import { assemblyTargetTracks } from '../core/storyboardAssembly'
import {
  activeSceneNarrationAssetId,
  registerSceneNarrationTake,
  sceneNarrationTakes,
  selectSceneNarrationTake,
  voiceoverTargetTracks,
  type VoiceoverScene
} from '../core/sceneVoiceover'
import { fitScenesToNarration, planNarrationFit, type NarrationFitResult } from '../core/narrationFit'
import type { KinaouProject } from '../core/project'
import type { PersistentVersionHistory } from '../core/versioning'
import { WorkerClient } from '../core/workerClient'
import { SceneNarrationSession, type NarrationFeedback } from '../core/sceneNarrationSession'
import {
  AudioStudioSession,
  type AudioFeedback
} from '../core/audioStudioSession'
import { commitStoryboardChange } from '../core/storyboardEditing'
import { useUiLanguage } from './UiLanguageProvider'
import { displayTrackName } from '../core/uiSystemLabels'
import { SpeechDeliveryControls } from './SpeechDeliveryControls'
import { defaultSpeechDeliveryDraft, speechDeliveryOptionsFromDraft, type SpeechDeliveryDraft } from '../core/speechDelivery'
import {
  assertSpeechRetakeRequest,
  speechRetakeContextForAsset
} from '../core/speechRetakes'
import { AudioJobStatus } from './AudioJobStatus'

interface Props {
  project: KinaouProject
  history: PersistentVersionHistory
  workerUrl: string
  workerToken: string
  workerConnected: boolean
  workerCapabilities: string[]
  onProjectChange: (project: KinaouProject) => void
}

export function SceneVoiceoverPanel({ project, history, workerUrl, workerToken, workerConnected, workerCapabilities, onProjectChange }: Props) {
  const { language, t } = useUiLanguage()
  const seconds = (ms: number) => (ms / 1000).toLocaleString(language, { maximumFractionDigits: 3 })
  const visualTracks = useMemo(() => assemblyTargetTracks(project), [project])
  const voiceTracks = useMemo(() => voiceoverTargetTracks(project), [project])
  const [visualId, setVisualId] = useState('')
  const [voiceId, setVoiceId] = useState('')
  const [voices, setVoices] = useState<SpeechVoiceDescriptor[]>([])
  const outputLanguage = projectContentProfile(project).outputLanguage
  const [voice, setVoice] = useState('')
  const [delivery, setDelivery] = useState<SpeechDeliveryDraft>(
    () => defaultSpeechDeliveryDraft(outputLanguage)
  )
  const [detecting, setDetecting] = useState(false)
  const [noVoices, setNoVoices] = useState(false)
  const [feedback, setFeedback] = useState<NarrationFeedback | null>(null)
  const [error, setError] = useState('')
  const [fitted, setFitted] = useState<NarrationFitResult | null>(null)
  const discovery = useRef(0)
  const session = useRef<SceneNarrationSession | null>(null)
  const retakeSession = useRef<AudioStudioSession | null>(null)
  const [retakeFeedback, setRetakeFeedback] = useState<AudioFeedback | null>(null)
  const [retakeSceneId, setRetakeSceneId] = useState('')
  const [retakeText, setRetakeText] = useState('')
  const available = workerConnected && workerCapabilities.includes('text-to-speech')
  const context = useRef({ project, workerUrl, workerToken, available })
  context.current = { project, workerUrl, workerToken, available }
  const effectiveVisual = visualTracks.some((track) => track.id === visualId) ? visualId : visualTracks[0]?.id ?? ''
  const effectiveVoice = voiceTracks.some((track) => track.id === voiceId) ? voiceId : voiceTracks[0]?.id ?? ''
  const selectedVoiceTrack = voiceTracks.find((track) => track.id === effectiveVoice)
  const busy = Boolean(feedback && ['starting', 'queued', 'running', 'saving'].includes(feedback.phase))
  const unresolved = Boolean(feedback && ['startFailed', 'pollFailed', 'saveFailed'].includes(feedback.phase))
  const retakeLocked = Boolean(retakeSession.current?.unresolved)
  const locked = busy || unresolved || retakeLocked || detecting
  const plan = useMemo(() => {
    if (!effectiveVisual || !effectiveVoice) return { entries: [], error: '' }
    try { return { entries: planNarrationFit(project, effectiveVisual, effectiveVoice), error: '' } }
    catch (cause) { return { entries: [], error: String(cause) } }
  }, [project, effectiveVisual, effectiveVoice])
  const fittableMs = plan.entries.reduce((total, entry) => total + entry.extendableMs, 0)

  function detach() {
    session.current?.detach()
    session.current = null
    retakeSession.current?.detach()
    retakeSession.current = null
    setRetakeFeedback(null)
    setRetakeSceneId('')
    setRetakeText('')
    setFeedback((previous) => previous && previous.phase !== 'complete' ? { ...previous, phase: 'detached', detail: undefined, done: [], skipped: [] } : null)
  }
  useEffect(() => {
    discovery.current++
    setVoices([])
    setVoice('')
    setDelivery(defaultSpeechDeliveryDraft(outputLanguage))
    setDetecting(false)
    setNoVoices(false)
    detach()
    return () => { discovery.current++; session.current?.detach() }
  }, [workerUrl, workerToken, available, outputLanguage])
  useEffect(() => {
    if (session.current && session.current.project !== project) detach()
  }, [project])

  const blockedReason = !project.storyboard.length ? t('assembly.noScenes')
    : !available ? t('narration.unavailable')
      : !voiceTracks.length ? t('narration.noTrack')
        : selectedVoiceTrack?.locked ? t('assembly.locked', { track: displayTrackName(selectedVoiceTrack, t) })
          : !effectiveVisual ? t('assembly.noTrack')
            : !voice || !voices.some((entry) => entry.id === voice) ? t('narration.chooseFirst') : ''

  async function detect() {
    const request = ++discovery.current
    setError(''); setVoices([]); setVoice(''); setDetecting(true); setNoVoices(false)
    try {
      const found = await new WorkerClient({ baseUrl: workerUrl, token: workerToken }).listSpeechVoices()
      if (request !== discovery.current) return
      setVoices(found); setNoVoices(!found.length)
    } catch (cause) { if (request === discovery.current) setError(String(cause)) }
    finally { if (request === discovery.current) setDetecting(false) }
  }
  function clearResults() { setFeedback(null); setFitted(null); setError('') }
  function fitScenes() {
    if (!fittableMs || locked) return
    clearResults()
    try {
      const result = commitStoryboardChange(project, () => fitScenesToNarration(project, effectiveVisual, effectiveVoice), history, onProjectChange, 'Before fitting scenes to the narration')
      setFitted(result)
    } catch (cause) { setError(String(cause)) }
  }
  async function retakeScene(
    sceneId: string,
    sourceAssetId: string
  ) {
    if (
      !available
      || locked
      || !effectiveVoice
    ) return

    clearResults()

    try {
      const selected =
        voices.find(
          entry =>
            entry.id === voice
        )

      if (!selected) {
        throw new Error(
          'Selected speech voice is no longer available'
        )
      }

      const source =
        project.assets.find(
          asset =>
            asset.id ===
            sourceAssetId
        )

      if (!source) {
        throw new Error(
          'Speech retake source is no longer available'
        )
      }

      if (
        source.metadata.adapterId
          !== selected.adapterId
        || source.metadata.voiceId
          !== selected.id
      ) {
        throw new Error(
          'Select the same speech voice before creating a retake'
        )
      }

      const sourceText =
        typeof source.metadata
          .sourceText === 'string'
          ? source.metadata
              .sourceText.trim()
          : ''

      if (!sourceText) {
        throw new Error(
          'Speech retake source text is missing'
        )
      }

      const storyboardScene =
        project.storyboard.find(
          entry =>
            entry.id === sceneId
        )

      if (!storyboardScene) {
        throw new Error(
          'Storyboard scene is no longer available'
        )
      }

      const sourceKind =
        source.metadata.source
          === 'storyboard-narration'
          ? 'storyboard-narration'
          : undefined

      const scene: VoiceoverScene = {
        sceneId,
        title:
          storyboardScene.title,
        text:
          sourceText,
        startMs: 0,
        sceneDurationMs:
          storyboardScene.durationMs,
        ...(sourceKind
          ? {
              textSource:
                sourceKind
            }
          : {})
      }

      const speechOptions =
        speechDeliveryOptionsFromDraft(
          project,
          selected,
          delivery
        )

      assertSpeechRetakeRequest(
        source,
        sourceText,
        selected,
        speechOptions
      )

      const connection =
        JSON.stringify([
          workerUrl,
          workerToken,
          available
        ])

      setRetakeSceneId(
        sceneId
      )

      setRetakeText(
        sourceText
      )

      setRetakeFeedback(null)

      const task =
        new AudioStudioSession(
          project,
          connection,
          sourceText,
          selected,
          {
            client:
              new WorkerClient({
                baseUrl:
                  workerUrl,
                token:
                  workerToken
              }),
            environment: () => ({
              project:
                context.current.project,
              connection:
                JSON.stringify([
                  context.current.workerUrl,
                  context.current.workerToken,
                  context.current.available
                ])
            }),
            snapshot: value =>
              history.snapshot(
                value,
                'Before saving scene narration retake',
                'system'
              ),
            persist: next => {
              onProjectChange(next)
              context.current.project =
                next
            },
            publish: value => {
              if (
                retakeSession.current
                  === task
              ) {
                setRetakeFeedback(
                  value
                )
              }
            },
            speechOptions,
            retakeContext:
              speechRetakeContextForAsset(
                source,
                project.assets
              ),
            saveResult: (
              base,
              job,
              _text,
              retakeContext
            ) => {
              if (!retakeContext) {
                throw new Error(
                  'Scene retake context is required'
                )
              }

              return registerSceneNarrationTake(
                base,
                scene,
                job,
                retakeContext
              ).project
            }
          }
        )

      retakeSession.current =
        task

      await task.run()

      if (
        retakeSession.current
          === task
        && !task.unresolved
      ) {
        retakeSession.current =
          null
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  function useSceneTake(
    sceneId: string,
    assetId: string
  ) {
    if (
      !effectiveVoice
      || locked
    ) return

    clearResults()

    try {
      const result =
        commitStoryboardChange(
          project,
          () =>
            selectSceneNarrationTake(
              project,
              sceneId,
              assetId,
              effectiveVoice
            ),
          history,
          onProjectChange,
          'Before changing scene narration take'
        )

      context.current.project =
        result.project
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : String(cause)
      )
    }
  }

  function narrate() {
    if (blockedReason || locked) return
    clearResults()
    try {
      session.current?.detach()
      const selected = voices.find((entry) => entry.id === voice)
      if (!selected) throw new Error('Selected speech voice is no longer available')

      const speechOptions = speechDeliveryOptionsFromDraft(
        project,
        selected,
        delivery
      )

      const run = new SceneNarrationSession(project, effectiveVisual, effectiveVoice, selected, {
        client: new WorkerClient({ baseUrl: workerUrl, token: workerToken }),
        current: (expected) => context.current.project === expected && context.current.workerUrl === workerUrl && context.current.workerToken === workerToken && context.current.available,
        snapshot: () => history.snapshot(project, 'Before generating scene narration', 'system'),
        persist: (next) => { onProjectChange(next); context.current.project = next },
        publish: setFeedback,
        speechOptions
      })
      session.current = run
      void run.run()
    } catch (cause) { setError(String(cause)) }
  }
  const details = (message: string) => <details><summary>{t('common.details')}</summary>{message}</details>

  return <div className="card availabilityPanel">
    <div><div className="eyebrow">{t('narration.eyebrow')}</div><h3>{t('narration.heading')}</h3><p>{t('narration.help')}</p><p>{t('narration.quality')}</p><p>{t('narration.scopeHelp')}</p></div>
    <div className="directorActions">
      <button className="secondaryButton" disabled={!available || locked} onClick={detect}>{t(detecting ? 'narration.detecting' : 'narration.detect')}</button>
      <SpeechVoiceSelect voices={voices} value={voice} language={outputLanguage} uiLanguage={language} disabled={!available || locked} onChange={(value) => {
        setVoice(value)
        setDelivery(defaultSpeechDeliveryDraft(outputLanguage))
        clearResults()
      }} />
      <SpeechDeliveryControls project={project} voice={voices.find((entry) => entry.id === voice)} draft={delivery} disabled={!available || locked} onChange={(next) => {
        setDelivery(next)
        clearResults()
      }} />
      <label>{t('narration.visual')}<select disabled={locked} value={effectiveVisual} onChange={(event) => { setVisualId(event.target.value); clearResults() }}>{visualTracks.map((track) => <option key={track.id} value={track.id}>{displayTrackName(track, t)}</option>)}</select></label>
      <label>{t('narration.target')}<select disabled={locked} value={effectiveVoice} onChange={(event) => { setVoiceId(event.target.value); clearResults() }}>{voiceTracks.map((track) => <option key={track.id} value={track.id}>{displayTrackName(track, t)}</option>)}</select></label>
      <button className="primary" disabled={Boolean(blockedReason) || locked} onClick={narrate}>{t('narration.start')}</button>
    </div>
    {blockedReason && <div className="warning">{blockedReason}</div>}
    {noVoices && <div className="warning">{t('narration.noVoices')}</div>}
    {plan.error && <div className="errorBox" role="alert">{t('narration.failure')}{details(plan.error)}</div>}
    {plan.entries.length > 0 && <div className="warning">
      <strong>{t('narration.fitHeading', { count: plan.entries.length })}</strong><p>{t('narration.fitHelp')}</p>
      <button className="secondaryButton" disabled={!fittableMs || locked || visualTracks.find((track) => track.id === effectiveVisual)?.locked} onClick={fitScenes}>{t('narration.fit', { seconds: seconds(fittableMs) })}</button>
      <div className="assetList">{plan.entries.map((entry) => <div className="assetRow" key={entry.sceneId}><div><strong>{entry.title}</strong><small>{t('narration.overrun', { seconds: seconds(entry.overrunMs) })}</small>{entry.limitCode && <small>{t(`narration.limit.${entry.limitCode}`)}</small>}</div></div>)}</div>
    </div>}
    {fitted?.project === project && <div className="successBox" role="status">{t('narration.fitSaved', { count: fitted.fitted.length, seconds: seconds(fitted.addedMs), remaining: fitted.remaining.length })}</div>}
    {error && <div className="errorBox" role="alert">{t('narration.failure')}{details(error)}</div>}
    {effectiveVoice && project.storyboard.some(scene => sceneNarrationTakes(project, scene.id).length > 0) && <div className="card">
      <div className="eyebrow">{t('narration.retakes')}</div>
      <p>{t('narration.retakesHelp')}</p>
      <div className="assetList">
        {project.storyboard.flatMap(scene => {
          const takes = sceneNarrationTakes(project, scene.id)
          if (!takes.length) return []

          let activeAssetId: string | undefined
          try {
            activeAssetId = activeSceneNarrationAssetId(project, scene.id, effectiveVoice)
          } catch {
            activeAssetId = undefined
          }

          return [<div className="assetRow" key={scene.id}>
            <div>
              <strong>{scene.title}</strong>
              <div className="assetList">
                {takes.map(asset => {
                  const index = Number(asset.metadata.speechRetakeIndex ?? 1)
                  const active = asset.id === activeAssetId
                  return <div className="assetRow" key={asset.id}>
                    <div>
                      <strong>{t('narration.take', { index })}</strong>
                      <small>{seconds(Number(asset.metadata.durationMs ?? 0))} s · {String(asset.metadata.voiceId ?? asset.metadata.adapterId ?? '')}</small>
                    </div>
                    <div className="directorActions">
                      {active
                        ? <span className="badge">{t('narration.activeTake')}</span>
                        : <button
                            className="secondaryButton"
                            disabled={locked}
                            onClick={() => useSceneTake(scene.id, asset.id)}
                          >{t('narration.useTake')}</button>}
                      <button
                        className="secondaryButton"
                        disabled={locked || !voice}
                        onClick={() => void retakeScene(scene.id, asset.id)}
                      >{t('narration.retake')}</button>
                    </div>
                  </div>
                })}
              </div>
            </div>
          </div>]
        })}
      </div>
    </div>}
    {retakeFeedback && <div className="card">
      <strong>{project.storyboard.find(scene => scene.id === retakeSceneId)?.title ?? ''}</strong>
      <AudioJobStatus
        feedback={retakeFeedback}
        submittedText={retakeText}
        onRetry={() => void retakeSession.current?.run()}
        onCancel={() => void retakeSession.current?.cancel()}
        onDetach={() => {
          retakeSession.current?.detach()
          retakeSession.current = null
          setRetakeFeedback({ phase: 'detached' })
        }}
      />
    </div>}
    {feedback && <div role="status">
      <p>{t(`narration.phase.${feedback.phase}`)}</p>
      {busy && <p>{t('narration.progress', { title: feedback.title ?? '', index: feedback.index, total: feedback.total, saved: feedback.done.length })}</p>}
      {feedback.detail && details(feedback.detail)}
      {['pollFailed', 'saveFailed'].includes(feedback.phase) && <button onClick={() => { void session.current?.run() }}>{t('narration.retry')}</button>}
      {(busy || unresolved) && <button onClick={detach}>{t('narration.detach')}</button>}
      <div className="assetList">{feedback.done.map((entry) => <div className="assetRow" key={entry.sceneId}><div><strong>{entry.title}</strong><small>{t('narration.savedTiming', { duration: seconds(entry.narrationMs), start: seconds(entry.startMs) })}</small>{entry.overrunMs > 0 && <small>{t('narration.overrun', { seconds: seconds(entry.overrunMs) })}</small>}</div></div>)}
      {feedback.skipped.map((entry) => <div className="assetRow" key={entry.sceneId}><div><strong>{entry.title}</strong><small>{t(`narration.reason.${entry.code}`, entry.values)}</small>{['failed', 'cancelled'].includes(entry.code) && details(entry.reason)}</div><span className="badge offline">{t('assembly.skipped')}</span></div>)}</div>
    </div>}
  </div>
}

import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { App } from '../src/App'
import { SettingsPanel, type SettingsPanelProps } from '../src/components/SettingsPanel'
import { CoursePanel } from '../src/components/CoursePanel'
import { TimelineEditor } from '../src/components/TimelineEditor'
import { ProjectAssetList } from '../src/components/ProjectAssetList'
import { PublishPanel } from '../src/components/PublishPanel'
import { AudioJobStatus } from '../src/components/AudioJobStatus'
import { ImageJobStatus } from '../src/components/ImageJobStatus'
import { VideoJobStatus } from '../src/components/VideoJobStatus'
import { SingleExportStatus } from '../src/components/SingleExportStatus'
import { SttStatus } from '../src/components/SttPanel'
import { UiLanguageProvider } from '../src/components/UiLanguageProvider'

import { createProjectFromInput } from '../src/core/create'
import { newCourseOutline, saveCourseOutline } from '../src/core/course'
import { recordSuccessfulExport } from '../src/core/exportHistory'
import type { KeyValueStore } from '../src/core/persistence'
import { configureWorkspaceRoot, defaultStorageSettings } from '../src/core/storage'
import { PersistentVersionHistory } from '../src/core/versioning'
import { translateUi, uiMessages } from '../src/core/uiMessages'
import type { UiLanguage } from '../src/core/uiLanguage'

import type { AudioFeedback } from '../src/core/audioStudioSession'
import type { ImageFeedback } from '../src/core/imageStudioSession'
import type { VideoFeedback } from '../src/core/videoStudioSession'
import type { ExportFeedback } from '../src/core/singleExportSession'
import type { SttFeedback, SttDraft } from '../src/core/sttSession'
import type { TtsJobRecord } from '../src/core/ttsJobs'
import type { ImageJobRecord } from '../src/core/imageJobs'
import type { VideoJobRecord } from '../src/core/videoJobs'
import type { RenderJobRecord } from '../src/core/renderJobs'
import type { SttJobRecord } from '../src/core/sttJobs'

const languageSequence: UiLanguage[] = ['de', 'fr', 'en']

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: key => { map.delete(key) }
  }
}

function render(language: UiLanguage, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(UiLanguageProvider, {
    initialLanguage: language,
    children: child
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

it('accepts the representative production journey across DE → FR → EN without rewriting drafts or authored content', () => {
  expect(Object.prototype.hasOwnProperty.call(uiMessages, 'ui.partial')).toBe(false)

  const appStore = memoryStore()
  vi.stubGlobal('window', { localStorage: appStore })

  const settings: SettingsPanelProps = {
    workerUrl: 'http://127.0.0.1:43117',
    workerToken: 'draft-token',
    workerBusy: false,
    workerError: '',
    workerHandshake: null,
    onWorkerUrlChange: vi.fn(),
    onWorkerTokenChange: vi.fn(),
    onTestConnection: vi.fn(),
    storage: configureWorkspaceRoot(defaultStorageSettings, '/Volumes/Saved Root', 'desktop-worker'),
    workspaceRoot: '/Volumes/Unsaved Draft',
    storageBackend: 'desktop-worker',
    onWorkspaceRootChange: vi.fn(),
    onStorageBackendChange: vi.fn(),
    onSaveStorage: vi.fn()
  }

  let project = createProjectFromInput({
    title: 'Original project title',
    kind: 'idea',
    content: 'Original storyboard brief'
  })

  project.assets.push({
    id: 'audio',
    kind: 'audio',
    uri: 'KINAOU/Assets/original.wav',
    managed: true,
    offline: false,
    metadata: {
      name: 'Original media name',
      durationMs: 1250
    }
  })

  project = saveCourseOutline(project, {
    ...newCourseOutline(project),
    title: 'Cours original',
    language: 'fr'
  })

  project = recordSuccessfulExport(project, {
    jobId: 'whole',
    label: 'Whole timeline',
    outputRelativePath: 'KINAOU/Renders/whole.mp4',
    format: 'landscape',
    range: { inMs: 0, outMs: 5000 },
    sceneIds: [],
    durationMs: 5000,
    completedAt: '2026-09-21T20:00:00.000Z'
  })

  const history = new PersistentVersionHistory(memoryStore())
  const beforeSettings = JSON.stringify(settings)
  const beforeProject = JSON.stringify(project)

  for (const language of languageSequence) {
    const app = render(language, createElement(App))
    expect(app).toContain(translateUi(language, 'create.heading'))
    expect(app).toContain(translateUi(language, 'nav.Settings'))
    expect(app).toContain(translateUi(language, 'ui.language'))
    expect(app).not.toContain('final coverage review')
    expect(app).not.toContain('Oberfläche im Abschlusscheck')
    expect(app).not.toContain('Interface DE/EN/FR en vérification finale')

    const settingsHtml = render(language, createElement(SettingsPanel, settings))
    expect(settingsHtml).toContain(translateUi(language, 'settings.connect'))
    expect(settingsHtml).toContain(translateUi(language, 'settings.storage'))
    expect(settingsHtml).toContain('/Volumes/Unsaved Draft')
    expect(settingsHtml).toContain('value="draft-token"')

    const courseHtml = render(language, createElement(CoursePanel, {
      project,
      history,
      onProjectChange: vi.fn(),
      onOpenStudio: vi.fn()
    }))
    expect(courseHtml).toContain(translateUi(language, 'course.heading'))
    expect(courseHtml).toContain(translateUi(language, 'course.save'))
    expect(courseHtml).toContain('Cours original')
    expect(courseHtml).toContain('value="fr" selected=""')

    const timelineHtml = render(language, createElement(TimelineEditor, {
      project,
      history,
      onProjectChange: vi.fn(),
      workerUrl: 'http://127.0.0.1:43117',
      workerToken: '',
      workerConnected: false
    }))
    expect(timelineHtml).toContain(translateUi(language, 'timeline.help'))
    expect(timelineHtml).toContain(translateUi(language, 'track.default.video'))
    expect(timelineHtml).toContain(translateUi(language, 'track.default.voice'))

    const assetsHtml = render(language, createElement(ProjectAssetList, {
      project,
      history,
      workerUrl: 'http://127.0.0.1:43117',
      workerToken: '',
      workerConnected: false,
      workerCapabilities: [],
      onProjectChange: vi.fn()
    }))
    expect(assetsHtml).toContain(translateUi(language, 'assetList.projectAssets'))
    expect(assetsHtml).toContain('Original media name')
    expect(assetsHtml).toContain('KINAOU/Assets/original.wav')

    const publishHtml = render(language, createElement(PublishPanel, {
      project,
      workerUrl: 'http://127.0.0.1:43117',
      workerToken: '',
      workerConnected: false,
      workerCapabilities: [],
      onProjectChange: vi.fn()
    }))
    expect(publishHtml).toContain(translateUi(language, 'publish.card.heading'))
    expect(publishHtml).toContain(translateUi(language, 'export.receiptWhole'))
    expect(publishHtml).toContain('Original project title')
  }

  expect(JSON.stringify(settings)).toBe(beforeSettings)
  expect(JSON.stringify(project)).toBe(beforeProject)

  expect(settings.onTestConnection).not.toHaveBeenCalled()
  expect(settings.onSaveStorage).not.toHaveBeenCalled()
})

it('accepts active and recovery job feedback across DE → FR → EN while keeping submitted content and diagnostics unchanged', () => {
  const audioJob: TtsJobRecord = {
    id: 'audio-job',
    state: 'queued',
    progress: 0.25,
    voicePath: 'KINAOU/Models/test.onnx',
    createdAt: '2026-09-21T20:00:00Z',
    updatedAt: '2026-09-21T20:00:01Z'
  }

  const imageJob: ImageJobRecord = {
    id: 'image-job',
    state: 'running',
    progress: 0.4,
    templatePath: 'KINAOU/Models/ComfyUI/Workflows/image.json',
    createdAt: '2026-09-21T20:00:00Z',
    updatedAt: '2026-09-21T20:00:01Z',
    provenance: {
      kind: 'local-model',
      adapterId: 'comfyui',
      templateId: 'image-template',
      seed: 42,
      positivePrompt: 'Original image prompt',
      negativePrompt: 'blur',
      width: 64,
      height: 64
    }
  }

  const videoJob: VideoJobRecord = {
    id: 'video-job',
    state: 'running',
    progress: 0.5,
    templatePath: 'KINAOU/Models/ComfyUI/Workflows/video.json',
    createdAt: '2026-09-21T20:00:00Z',
    updatedAt: '2026-09-21T20:00:01Z',
    provenance: {
      kind: 'local-model',
      adapterId: 'comfyui',
      templateId: 'video-template',
      seed: 84,
      positivePrompt: 'Original video prompt',
      negativePrompt: 'noise',
      width: 64,
      height: 64
    }
  }

  const renderJob: RenderJobRecord = {
    id: 'render-job',
    state: 'succeeded',
    progress: 1,
    createdAt: '2026-09-21T20:00:00Z',
    updatedAt: '2026-09-21T20:00:01Z',
    outputPath: '/tmp/KINAOU/Renders/output.mp4',
    durationMs: 1000,
    sizeBytes: 1000
  }

  const sttJob: SttJobRecord = {
    id: 'stt-job',
    state: 'running',
    progress: 0.3,
    createdAt: '2026-09-21T20:00:00Z',
    updatedAt: '2026-09-21T20:00:01Z'
  }

  const imageSubmission = {
    templatePath: imageJob.templatePath,
    positivePrompt: 'Original image prompt',
    negativePrompt: 'blur',
    seed: 42,
    width: 64,
    height: 64
  }

  const videoSubmission = {
    templatePath: videoJob.templatePath,
    positivePrompt: 'Original video prompt',
    negativePrompt: 'noise',
    seed: 84,
    width: 64,
    height: 64
  }

  const sttDraft: SttDraft = {
    sourceId: 'audio',
    model: 'KINAOU/Models/ggml-small.bin',
    language: 'fr'
  }

  const audioFeedback: AudioFeedback = {
    phase: 'queued',
    job: audioJob
  }

  const imageFeedback: ImageFeedback = {
    phase: 'running',
    job: imageJob
  }

  const videoFeedback: VideoFeedback = {
    phase: 'pollFailed',
    job: videoJob,
    detail: 'Original video diagnostic'
  }

  const exportFeedback: ExportFeedback = {
    phase: 'saveFailed',
    path: 'KINAOU/Renders/output.mp4',
    job: renderJob,
    detail: 'Original receipt diagnostic'
  }

  const sttFeedback: SttFeedback = {
    phase: 'running',
    draft: sttDraft,
    sourceName: 'Original source name',
    job: sttJob
  }

  const sourceBefore = JSON.stringify({
    audioFeedback,
    imageFeedback,
    videoFeedback,
    exportFeedback,
    sttFeedback,
    imageSubmission,
    videoSubmission
  })

  const onRetry = vi.fn()
  const onCancel = vi.fn()
  const onDetach = vi.fn()

  for (const language of languageSequence) {
    const audio = render(language, createElement(AudioJobStatus, {
      feedback: audioFeedback,
      submittedText: 'Original narration draft',
      onRetry,
      onCancel,
      onDetach
    }))
    expect(audio).toContain(translateUi(language, 'audio.queued'))
    expect(audio).toContain(translateUi(language, 'audio.cancel'))
    expect(audio).toContain(translateUi(language, 'audio.detach'))
    expect(audio).toContain('Original narration draft')

    const image = render(language, createElement(ImageJobStatus, {
      feedback: imageFeedback,
      submitted: imageSubmission,
      onRetry,
      onCancel,
      onDetach
    }))
    expect(image).toContain(translateUi(language, 'image.running'))
    expect(image).toContain(translateUi(language, 'audio.cancel'))
    expect(image).toContain('Original image prompt')

    const video = render(language, createElement(VideoJobStatus, {
      feedback: videoFeedback,
      submitted: videoSubmission,
      onRetry,
      onCancel,
      onDetach
    }))
    expect(video).toContain(translateUi(language, 'video.pollFailed'))
    expect(video).toContain(translateUi(language, 'audio.retry'))
    expect(video).toContain('Original video prompt')
    expect(video).toContain('Original video diagnostic')

    const exported = render(language, createElement(SingleExportStatus, {
      feedback: exportFeedback,
      onRetry,
      onCancel,
      onDetach
    }))
    expect(exported).toContain(translateUi(language, 'export.phase.saveFailed'))
    expect(exported).toContain(translateUi(language, 'export.retry'))
    expect(exported).toContain('Original receipt diagnostic')
    expect(exported).toContain('KINAOU/Renders/output.mp4')

    const stt = render(language, createElement(SttStatus, {
      feedback: sttFeedback
    }))
    expect(stt).toContain(translateUi(language, 'stt.running'))
    expect(stt).toContain('Original source name')
    expect(stt).toContain('ggml-small.bin')
    expect(stt).toContain('fr')
  }

  expect(JSON.stringify({
    audioFeedback,
    imageFeedback,
    videoFeedback,
    exportFeedback,
    sttFeedback,
    imageSubmission,
    videoSubmission
  })).toBe(sourceBefore)

  expect(onRetry).not.toHaveBeenCalled()
  expect(onCancel).not.toHaveBeenCalled()
  expect(onDetach).not.toHaveBeenCalled()
})

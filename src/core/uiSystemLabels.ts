import type { ExportReceipt } from './exportHistory'
import type { TimelineTrack } from './project'
import type { UiMessageKey } from './uiMessages'
import type { ProjectVersion } from './versioning'

type Translator = (key: UiMessageKey, values?: Record<string, string | number>) => string

const exactHistoryLabels: Record<string, UiMessageKey> = {
  'Before drive restore': 'history.system.driveRestore',
  'Before updating media availability': 'history.system.mediaAvailability',
  'Before saving imported media': 'history.system.importedMedia',
  'Before saving generated voice': 'history.system.generatedVoice',
  'Before adding a caption': 'history.system.addCaption',
  'Before editing caption text': 'history.system.editCaption',
  'Before saving course outline': 'history.system.courseOutline',
  'Before saving generated image': 'history.system.generatedImage',
  'Before registering existing media': 'history.system.registerMedia',
  'Before media acquisition run': 'history.system.mediaAcquisition',
  'Before saving media preview reference': 'history.system.previewReference',
  'Before fitting scenes to the narration': 'history.system.fitNarration',
  'Before generating scene narration': 'history.system.sceneNarration',
  'Before realigning captions to their scenes': 'history.system.realignCaptions',
  'Before writing captions from the script': 'history.system.scriptCaptions',
  'Before updating replaced scene visuals': 'history.system.updateVisuals',
  'Before assembling scenes on the timeline': 'history.system.assembleTimeline',
  'Before saving transcript': 'history.system.transcript',
  'Before saving generated video': 'history.system.generatedVideo',
  'Before adding a voiced portrait presenter': 'history.system.presenter',
  'Before manual timeline edit': 'history.system.manualTimeline'
}

const prefixedHistoryLabels: Array<{
  prefix: string
  key: UiMessageKey
  value: string
}> = [
  { prefix: 'Before transcript captions: ', key: 'history.system.transcriptCaptions', value: 'name' },
  { prefix: 'Before AI Editor: ', key: 'history.system.aiEditor', value: 'name' },
  { prefix: 'Before Director plan: ', key: 'history.system.directorPlan', value: 'name' },
  { prefix: 'Before scene visual change: ', key: 'history.system.sceneVisual', value: 'name' },
  { prefix: 'Before restore: ', key: 'history.system.restore', value: 'name' }
]

export function displaySystemHistoryLabel(
  version: Pick<ProjectVersion, 'label' | 'source'>,
  t: Translator
): string {
  if (version.source !== 'system') return version.label

  const exact = exactHistoryLabels[version.label]
  if (exact) return t(exact)

  for (const entry of prefixedHistoryLabels) {
    if (!version.label.startsWith(entry.prefix)) continue
    const value = version.label.slice(entry.prefix.length)
    if (!value) return version.label
    return t(entry.key, { [entry.value]: value })
  }

  return version.label
}

export function displayExportReceiptLabel(
  receipt: Pick<ExportReceipt, 'label' | 'sceneIds' | 'courseLesson'>,
  t: Translator
): string {
  if (receipt.courseLesson || receipt.sceneIds.length > 0) return receipt.label

  if (receipt.label === 'Whole timeline') return t('export.receiptWhole')

  const custom = /^Custom range ([0-9]+(?:\.[0-9]+)?)–([0-9]+(?:\.[0-9]+)?) s$/.exec(receipt.label)
  if (custom) return t('export.receiptRange', { start: custom[1], end: custom[2] })

  return receipt.label
}

const defaultTrackNames: Partial<Record<TimelineTrack['type'], { stored: string; key: UiMessageKey }>> = {
  video: { stored: 'Main Video', key: 'track.default.video' },
  voice: { stored: 'Voice', key: 'track.default.voice' },
  music: { stored: 'Music', key: 'track.default.music' },
  caption: { stored: 'Captions', key: 'track.default.caption' }
}

export function displayTrackName(
  track: Pick<TimelineTrack, 'type' | 'name'>,
  t: Translator
): string {
  const known = defaultTrackNames[track.type]
  return known && track.name === known.stored ? t(known.key) : track.name
}

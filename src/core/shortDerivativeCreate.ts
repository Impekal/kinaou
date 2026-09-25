import {
  parseProject,
  type KinaouProject
} from './project'

import {
  projectFormatReframing,
  setProjectFormatReframing,
  setProjectTargetFormat,
  type TargetFormat
} from './render'

import type {
  ShortCutPlan
} from './shortCutPlan'

import {
  createShortDerivativeDraft
} from './shortDerivative'

import {
  materializeShortDerivative
} from './shortDerivativeMaterialize'


export function reviewedShortCutKey(
  source:
    KinaouProject,

  cut:
    ShortCutPlan,

  format:
    TargetFormat
): string {
  return JSON.stringify({
    sourceProjectId:
      source.id,

    sourceProjectUpdatedAt:
      source.updatedAt,

    format,

    cut
  })
}


export function createMaterializedShortDerivative(
  source:
    KinaouProject,

  cut:
    ShortCutPlan,

  format:
    TargetFormat,

  now =
    new Date(),

  projectId: string =
    crypto.randomUUID(),

  idFactory:
    () => string =
      () =>
        crypto.randomUUID()
): KinaouProject {
  const draft =
    createShortDerivativeDraft(
      source,
      cut,
      now,
      projectId
    )

  let child =
    materializeShortDerivative(
      source,
      draft,
      cut,
      now,
      idFactory
    )

  /*
   * The created edit must open in the same format/framing the user
   * actually reviewed. This changes only child-project metadata.
   */
  child =
    setProjectTargetFormat(
      child,
      format
    )

  child =
    setProjectFormatReframing(
      child,
      format,
      projectFormatReframing(
        source,
        format
      ),
      now
    )

  /*
   * setProjectTargetFormat uses the ordinary project touch path.
   * Normalize creation time back to this single explicit transaction.
   */
  return parseProject({
    ...child,

    updatedAt:
      now.toISOString()
  })
}

import {
  describe,
  expect,
  it
} from 'vitest'

import {
  FLUX2_KLEIN_ACCEPTED_HEIGHT,
  FLUX2_KLEIN_ACCEPTED_STEPS,
  FLUX2_KLEIN_ACCEPTED_WIDTH,
  FLUX2_KLEIN_BASE_REVISION,
  FLUX2_KLEIN_MODEL_REVISION,
  flux2KleinAvatarEngine
} from '../src/core/avatarFlux2Klein'

import {
  assertAvatarEngineRights
} from '../src/core/avatarGeneration'

describe(
  'FLUX.2 Klein accepted Avatar identity engine',
  () => {
    it(
      'declares only the human-accepted still-image identity capabilities',
      () => {
        const engine =
          flux2KleinAvatarEngine(
            '2026-09-25T00:45:00.000Z'
          )

        expect(
          engine.capabilities
        ).toEqual([
          'identity-preservation',
          'targeted-edit',
          'image-reference',
          'scene-image'
        ])

        expect(
          engine.capabilities
        ).not.toContain(
          'identity-generation'
        )

        expect(
          engine.capabilities
        ).not.toContain(
          'scene-video'
        )

        expect(
          engine.capabilities
        ).not.toContain(
          'motion'
        )

        expect(
          engine.capabilities
        ).not.toContain(
          'expression'
        )

        expect(
          engine.capabilities
        ).not.toContain(
          'lip-sync'
        )

        expect(
          engine.capabilities
        ).not.toContain(
          'multi-reference'
        )
      }
    )

    it(
      'permits commercially intended still-image output under the pinned Apache-2.0 rights snapshot',
      () => {
        const engine =
          flux2KleinAvatarEngine(
            '2026-09-25T00:45:00.000Z'
          )

        expect(
          assertAvatarEngineRights(
            engine,
            true
          )
        ).toEqual(
          engine
        )

        expect(
          engine.rights
            .commercialOutput
        ).toBe(
          'allowed'
        )

        expect(
          engine.rights
            .commercialSoftwareUse
        ).toBe(
          'allowed'
        )

        expect(
          engine.rights
            .modelRedistribution
        ).toBe(
          'allowed'
        )

        expect(
          engine.rights
            .attributionRequired
        ).toBe(
          false
        )

        expect(
          FLUX2_KLEIN_MODEL_REVISION
        ).toHaveLength(40)

        expect(
          FLUX2_KLEIN_BASE_REVISION
        ).toHaveLength(40)

        expect(
          FLUX2_KLEIN_ACCEPTED_WIDTH
        ).toBe(512)

        expect(
          FLUX2_KLEIN_ACCEPTED_HEIGHT
        ).toBe(512)

        expect(
          FLUX2_KLEIN_ACCEPTED_STEPS
        ).toBe(4)
      }
    )
  }
)

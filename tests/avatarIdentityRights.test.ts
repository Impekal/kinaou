import {
  describe,
  expect,
  it
} from 'vitest'

import {
  IP_ADAPTER_REVISION,
  SDXL_REVISION,
  sdxlIpAdapterRights
} from '../src/core/avatarIdentityRights'

describe(
  'SDXL + IP-Adapter Avatar rights',
  () => {
    it(
      'separates commercial output permission from model redistribution',
      () => {
        const rights =
          sdxlIpAdapterRights(
            '2026-09-24T12:00:00.000Z'
          )

        expect(
          rights.privateUse
        ).toBe(
          'allowed'
        )

        expect(
          rights.commercialOutput
        ).toBe(
          'allowed'
        )

        expect(
          rights.commercialSoftwareUse
        ).toBe(
          'allowed'
        )

        expect(
          rights.modelRedistribution
        ).toBe(
          'restricted'
        )

        expect(
          rights.attributionRequired
        ).toBe(
          false
        )

        expect(
          rights.notes
        ).toContain(
          'reference-image rights'
        )

        expect(
          SDXL_REVISION
        ).toHaveLength(40)

        expect(
          IP_ADAPTER_REVISION
        ).toHaveLength(40)
      }
    )
  }
)

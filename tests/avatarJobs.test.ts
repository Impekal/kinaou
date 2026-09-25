import {
  describe,
  expect,
  it
} from 'vitest'

import {
  parseAvatarEditJob,
  registerGeneratedAvatarImage
} from '../src/core/avatarJobs'

import {
  createProject
} from '../src/core/project'

function job() {
  return {
    id:
      'avatar-job-1',
    state:
      'succeeded' as const,
    progress:
      1,
    createdAt:
      '2026-09-25T01:00:00.000Z',
    updatedAt:
      '2026-09-25T01:00:25.000Z',
    provenance: {
      kind:
        'local-model' as const,
      adapterId:
        'mflux-flux2-klein-edit' as const,
      engineId:
        'mflux-flux2-klein-4b-edit' as const,
      engineVersion:
        'mflux-0.20.0' as const,
      modelId:
        'Runpod/FLUX.2-klein-4B-mflux-4bit' as const,
      modelVersion:
        '73dcaa322be48ea49374b32b4b23aab1a3e59b87' as const,
      prompt:
        'Keep the exact same person.',
      seed:
        430201,
      steps:
        4 as const,
      width:
        512 as const,
      height:
        512 as const,
      referencePaths: [
        'KINAOU/Assets/reference.png'
      ]
    },
    outputPath:
      'KINAOU/Assets/GeneratedAvatars/avatar-job-1.png',
    sizeBytes:
      12345
  }
}

describe(
  'Avatar edit jobs',
  () => {
    it(
      'parses the exact accepted FLUX.2 Klein job contract',
      () => {
        expect(
          parseAvatarEditJob(
            job()
          )
        ).toEqual(
          job()
        )
      }
    )

    it(
      'registers a generated Avatar image as a managed generated asset',
      () => {
        const registered =
          registerGeneratedAvatarImage(
            createProject(
              'Avatar Worker'
            ),
            job()
          )

        expect(
          registered.asset
        ).toMatchObject({
          kind:
            'image',
          managed:
            true,
          offline:
            false,
          uri:
            'KINAOU/Assets/GeneratedAvatars/avatar-job-1.png',
          metadata: {
            generated:
              true,
            adapterId:
              'mflux-flux2-klein-edit',
            avatarJobId:
              'avatar-job-1',
            seed:
              430201,
            width:
              512,
            height:
              512
          }
        })

        expect(
          registered.project.assets
        ).toHaveLength(1)
      }
    )

    it(
      'rejects untrusted references and malformed successful outputs',
      () => {
        expect(
          () =>
            parseAvatarEditJob({
              ...job(),
              provenance: {
                ...job().provenance,
                referencePaths: [
                  '/tmp/reference.png'
                ]
              }
            })
        ).toThrow(
          'managed image assets'
        )

        expect(
          () =>
            parseAvatarEditJob({
              ...job(),
              outputPath:
                'KINAOU/Assets/GeneratedImages/wrong.png'
            })
        ).toThrow(
          'completed'
        )


        expect(
          () =>
            parseAvatarEditJob({
              ...job(),
              provenance: {
                ...job().provenance,
                referencePaths: [
                  'KINAOU/Assets/reference.png',
                  'KINAOU/Assets/reference-2.png'
                ]
              }
            })
        ).toThrow(
          'provenance'
        )
      }
    )
  }
)

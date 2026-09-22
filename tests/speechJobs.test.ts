import { describe, expect, it } from 'vitest'

import { parseSpeechJob, speechJobFromLegacyTts } from '../src/core/speechJobs'
import { WorkerClient } from '../src/core/workerClient'

const running = {
  id: 'job-1',
  adapterId: 'piper',
  voiceId: 'KINAOU/Models/de.onnx',
  state: 'running',
  progress: 0.25,
  createdAt: '2026-09-22T00:00:00Z',
  updatedAt: '2026-09-22T00:00:01Z'
} as const

describe('generic speech jobs', () => {
  it('parses active and completed adapter-neutral jobs', () => {
    expect(parseSpeechJob(running)).toEqual(running)

    const done = parseSpeechJob({
      ...running,
      state: 'succeeded',
      progress: 1,
      audioPath: 'KINAOU/Assets/GeneratedVoice/job-1.wav',
      durationMs: 1250,
      sizeBytes: 4000
    })

    expect(done.durationMs).toBe(1250)
  })

  it('rejects malformed identities and completed output', () => {
    expect(() => parseSpeechJob({
      ...running,
      adapterId: '../bad'
    })).toThrow()

    expect(() => parseSpeechJob({
      ...running,
      state: 'succeeded',
      progress: 1,
      audioPath: '../voice.wav',
      durationMs: 1250,
      sizeBytes: 4000
    })).toThrow(/completed/)
  })

  it('uses the generic worker routes without changing request identity', async () => {
    const requests: Array<{
      url: string
      method: string
      body?: unknown
    }> = []

    const client = new WorkerClient({
      baseUrl: 'http://127.0.0.1:43117',
      token: 'secret',
      fetchImpl: async (input, init) => {
        const method = init?.method ?? 'GET'
        const body = init?.body
          ? JSON.parse(String(init.body))
          : undefined

        requests.push({
          url: String(input),
          method,
          body
        })

        return new Response(JSON.stringify({
          ok: true,
          type: 'speech-job',
          job: running
        }), {
          headers: {
            'content-type': 'application/json'
          }
        })
      }
    })

    const request = {
      adapterId: 'piper',
      voiceId: 'KINAOU/Models/de.onnx',
      text: 'Hallo Welt'
    }

    await client.startSpeech(request)
    await client.speechStatus('job-1')
    await client.cancelSpeech('job-1')

    expect(requests[0]).toEqual({
      url: 'http://127.0.0.1:43117/speech/jobs',
      method: 'POST',
      body: request
    })

    expect(requests[1].url).toContain('/speech/jobs/job-1')
    expect(requests[2].url).toContain('/speech/jobs/job-1/cancel')
  })
})

it('converts pre-generic minimal Piper jobs without inventing new provenance', () => {
  const legacy = {
    id: 'legacy-job',
    state: 'succeeded',
    progress: 1,
    voicePath: 'KINAOU/Models/legacy.onnx',
    audioPath: 'KINAOU/Assets/GeneratedVoice/legacy-job.wav',
    durationMs: 900,
    sizeBytes: 123
  } as any

  expect(speechJobFromLegacyTts(legacy)).toEqual({
    id: 'legacy-job',
    adapterId: 'piper',
    voiceId: 'KINAOU/Models/legacy.onnx',
    state: 'succeeded',
    progress: 1,
    createdAt: '',
    updatedAt: '',
    audioPath: 'KINAOU/Assets/GeneratedVoice/legacy-job.wav',
    durationMs: 900,
    sizeBytes: 123
  })
})

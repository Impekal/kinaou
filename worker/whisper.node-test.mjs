import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSttCommands, normalizeWhisperTranscript, sttPaths, whisperModelRelativePaths } from './whisper.mjs'

test('discovers only whisper.cpp GGML models in managed Models', () => {
  const entries = [{ name: 'ggml-base.bin', isFile: () => true }, { name: '../bad.bin', isFile: () => true }, { name: 'notes.txt', isFile: () => true }]
  assert.deepEqual(whisperModelRelativePaths(entries), ['KINAOU/Models/ggml-base.bin'])
})

test('keeps STT temporary and durable output in managed areas', () => {
  assert.deepEqual(sttPaths('job-123'), { wav: 'KINAOU/Temp/STT/job-123.wav', outputBase: 'KINAOU/Projects/Transcripts/job-123', transcript: 'KINAOU/Projects/Transcripts/job-123.json' })
  assert.throws(() => sttPaths('../escape'), /job ID/)
})

test('builds shell-free conversion and whisper.cpp commands', () => {
  const commands = buildSttCommands({ whisperCli: '/opt/whisper-cli', modelPath: '/disk/KINAOU/Models/ggml-base.bin', sourcePath: '/disk/KINAOU/Assets/a.mp3', wavPath: '/disk/KINAOU/Temp/STT/j.wav', outputBase: '/disk/KINAOU/Projects/Transcripts/j' })
  assert.deepEqual(commands[0].args.slice(-6), ['-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '/disk/KINAOU/Temp/STT/j.wav'].slice(-6))
  assert.equal(commands[1].executable, '/opt/whisper-cli')
  assert.ok(commands[1].args.includes('-ojf'))
})

test('normalizes timestamped whisper.cpp JSON without retaining runtime internals', () => {
  const result = normalizeWhisperTranscript({ result: { language: 'de' }, transcription: [{ timestamps: { from: '00:00:01,250', to: '00:00:03,000' }, text: ' Hallo ' }] })
  assert.deepEqual(result, { schemaVersion: 1, adapterId: 'whisper.cpp', language: 'de', text: 'Hallo', segments: [{ startMs: 1250, endMs: 3000, text: 'Hallo' }] })
})

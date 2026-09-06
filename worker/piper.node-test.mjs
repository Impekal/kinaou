import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPiperCommand, piperVoiceRelativePaths, ttsPaths, validateTtsText } from './piper.mjs'

test('discovers only Piper ONNX voices with adjacent configuration', () => {
  const entries = ['de_DE-thorsten.onnx', 'de_DE-thorsten.onnx.json', 'orphan.onnx', '../bad.onnx'].map((name) => ({ name, isFile: () => true }))
  assert.deepEqual(piperVoiceRelativePaths(entries), ['KINAOU/Models/de_DE-thorsten.onnx'])
})

test('keeps TTS text temporary and generated voice durable in managed storage', () => {
  assert.deepEqual(ttsPaths('job-42'), { text: 'KINAOU/Temp/TTS/job-42.txt', audio: 'KINAOU/Assets/GeneratedVoice/job-42.wav' })
  assert.throws(() => ttsPaths('../bad'), /job ID/)
})

test('bounds text and builds a shell-free Piper command', () => {
  assert.equal(validateTtsText('  Hallo Welt  '), 'Hallo Welt')
  assert.throws(() => validateTtsText(''), /1–100000/)
  const command = buildPiperCommand({ piperCli: '/opt/piper', modelPath: '/disk/KINAOU/Models/de.onnx', textPath: '/disk/KINAOU/Temp/TTS/j.txt', audioPath: '/disk/KINAOU/Assets/GeneratedVoice/j.wav' })
  assert.equal(command.executable, '/opt/piper')
  assert.deepEqual(command.args, ['-m', '/disk/KINAOU/Models/de.onnx', '-f', '/disk/KINAOU/Assets/GeneratedVoice/j.wav', '--input-file', '/disk/KINAOU/Temp/TTS/j.txt'])
})

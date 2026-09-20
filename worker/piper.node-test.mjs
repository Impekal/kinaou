import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, symlink, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildPiperCommand, piperVoiceDetails, piperVoiceRelativePaths, ttsPaths, validateTtsText } from './piper.mjs'

test('reads declared locales, never guesses from filenames, and rejects unsafe or malformed configs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kinaou-piper-locale-'))
  const config = (name) => path.join(root, `${name}.onnx.json`)
  try {
    for (const [name, code] of [['renamed', 'de_DE'], ['english', 'en_US'], ['french', 'fr_FR'], ['base', 'fr'], ['invalid', '<script>']]) {
      await writeFile(config(name), JSON.stringify({ language: { code } }))
    }
    await writeFile(config('de_DE-unknown'), '{}')
    await writeFile(config('broken'), '{')
    await writeFile(config('huge'), JSON.stringify({ language: { code: 'de_DE' }, padding: 'x'.repeat(65536) }))
    await symlink(config('renamed'), config('link'))
    await mkdir(config('directory'))
    const names = ['renamed', 'english', 'french', 'base', 'invalid', 'de_DE-unknown', 'broken', 'huge', 'link', 'directory', 'missing']
    const voices = names.map((name) => `KINAOU/Models/${name}.onnx`)
    const details = await piperVoiceDetails(voices, (relative) => path.join(root, path.basename(relative)))
    assert.deepEqual(details.map((item) => item.locale), ['de-DE', 'en-US', 'fr-FR', 'fr', null, null, null, null, null, null, null])
    assert.deepEqual(details.map((item) => item.path), voices)
    assert.deepEqual(await piperVoiceDetails([voices[0]], () => { throw new Error('Unsafe managed path') }), [{ path: voices[0], locale: null }])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('bounds config discovery work to 200 voices', async () => {
  let count = 0
  const details = await piperVoiceDetails(Array(201).fill('KINAOU/Models/v.onnx'), () => { count++; throw new Error('Missing') })
  assert.equal(count, 200)
  assert.equal(details.length, 200)
})

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

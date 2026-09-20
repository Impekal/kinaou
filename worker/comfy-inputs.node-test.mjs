import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink, truncate } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateComfyTemplate } from './comfyui.mjs'
import { validateReferences, uploadComfyReferences, MAX_REFERENCE_BYTES } from './comfy-inputs.mjs'

export const template = {
  schemaVersion: 1, mediaType: 'video', id: 'portrait-speech', label: 'Portrait and speech fixture',
  workflow: { '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } }, '2': { class_type: 'LoadImage', inputs: { image: '' } }, '3': { class_type: 'LoadAudio', inputs: { audio: '' } } },
  bindings: { positivePrompt: { nodeId: '1', input: 'text' } },
  referenceInputs: { portrait: { nodeId: '2', input: 'image' }, speech: { nodeId: '3', input: 'audio' } }
}
const inputs = { portrait: { assetId: 'photo', path: 'KINAOU/Assets/photo.png', authorized: true }, speech: { assetId: 'voice', path: 'KINAOU/Assets/voice.wav', authorized: true } }

test('reference templates require explicit supported loader bindings, not ignored hints', () => {
  assert.equal(validateComfyTemplate(template), template)
  for (const modified of [
    { ...template, mediaType: 'image' },
    { ...template, referenceInputs: { video: { nodeId: '2', input: 'image' } } },
    { ...template, referenceInputs: { speech: { nodeId: '2', input: 'image' } } },
    { ...template, referenceInputs: { portrait: { nodeId: '9', input: 'image' } } },
    { ...template, bindings: { positivePrompt: { nodeId: '2', input: 'image' } } }
  ]) assert.throws(() => validateComfyTemplate(modified), /Reference|reference/)
})

test('requires every declared reference and authorization, rejects extra inputs and unsafe paths', () => {
  assert.equal(validateReferences(template, inputs).length, 2)
  assert.throws(() => validateReferences(template), /authorization/)
  assert.throws(() => validateReferences(template, { ...inputs, video: {} }), /Undeclared/)
  assert.throws(() => validateReferences(template, { ...inputs, speech: { ...inputs.speech, authorized: false } }), /authorization/)
  for (const bad of ['KINAOU/Assets/../secret.wav', '/tmp/secret.wav', 'KINAOU/Models/model.wav', 'KINAOU/Assets/./voice.wav', 'KINAOU/Assets//voice.wav', 'KINAOU/Assets/voice.png', 'KINAOU/Assets/a\\b.wav']) {
    assert.throws(() => validateReferences(template, { ...inputs, speech: { ...inputs.speech, path: bad } }), /path/)
  }
  assert.deepEqual(validateReferences({ ...template, referenceInputs: undefined }), [])
  assert.throws(() => validateReferences({ ...template, referenceInputs: undefined }, inputs), /Undeclared/)
})

test('uploads exact bounded bytes, binds returned input names and preserves hashes without modifying originals', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-comfy-inputs-'))
  try {
    await mkdir(path.join(root, 'Assets'))
    await writeFile(path.join(root, 'Assets/photo.png'), 'photo fixture')
    await writeFile(path.join(root, 'Assets/voice.wav'), 'voice fixture')
    const workflow = structuredClone(template.workflow)
    let uploads = 0
    const provenance = await uploadComfyReferences({ root, baseUrl: 'http://127.0.0.1:8188', jobId: 'job-1', references: validateReferences(template, inputs), template, workflow,
      fetchImpl: async (url, options) => {
        assert.equal(url, 'http://127.0.0.1:8188/upload/image')
        assert.equal(options.redirect, 'error')
        assert.equal(options.body.get('overwrite'), 'false')
        assert.equal(options.body.get('type'), 'input')
        const file = options.body.get('image')
        assert.equal(await file.text(), uploads++ ? 'voice fixture' : 'photo fixture')
        return { ok: true, json: async () => ({ name: file.name, type: 'input', subfolder: '' }) }
      } })
    assert.equal(uploads, 2)
    assert.equal(workflow['2'].inputs.image, 'kinaou-job-1-portrait.png')
    assert.equal(workflow['3'].inputs.audio, 'kinaou-job-1-speech.wav')
    assert.equal(template.workflow['2'].inputs.image, '')
    assert.equal(provenance[1].sha256, createHash('sha256').update('voice fixture').digest('hex'))
    assert.equal(provenance[1].sourcePath, inputs.speech.path)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects links, folders, missing/empty/oversized files before copying and refuses upload errors', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kinaou-comfy-reject-'))
  let calls = 0
  const ref = validateReferences(template, inputs)[0]
  const args = { root, baseUrl: 'http://127.0.0.1:8188', jobId: 'job-2', references: [ref], template, workflow: structuredClone(template.workflow), fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ name: '../escape.png', type: 'input' }) } } }
  try {
    await mkdir(path.join(root, 'Assets'))
    await assert.rejects(uploadComfyReferences(args), /ENOENT/)
    await writeFile(path.join(root, 'outside.png'), 'secret')
    await symlink(path.join(root, 'outside.png'), path.join(root, 'Assets/photo.png'))
    await assert.rejects(uploadComfyReferences(args), /symlinks/)
    await rm(path.join(root, 'Assets/photo.png'))
    await writeFile(path.join(root, 'Assets/photo.png'), '')
    await assert.rejects(uploadComfyReferences(args), /nonempty/)
    await truncate(path.join(root, 'Assets/photo.png'), MAX_REFERENCE_BYTES + 1)
    await assert.rejects(uploadComfyReferences(args), /32 MiB/)
    await symlink(root, path.join(root, 'Assets/linked'))
    await assert.rejects(uploadComfyReferences({ ...args, references: [{ ...ref, sourcePath: 'KINAOU/Assets/linked/outside.png' }] }), /symlinks/)
    assert.equal(calls, 0)
    await writeFile(path.join(root, 'Assets/photo.png'), 'valid')
    await assert.rejects(uploadComfyReferences(args), /unexpected reference/)
    await assert.rejects(uploadComfyReferences({ ...args, fetchImpl: async () => ({ ok: false, status: 413 }) }), /413/)
    await assert.rejects(uploadComfyReferences({ ...args, baseUrl: 'http://example.com:8188' }), /localhost/)
    const controller = new AbortController(); controller.abort()
    await assert.rejects(uploadComfyReferences({ ...args, signal: controller.signal }), /abort/i)
    assert.equal(calls, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

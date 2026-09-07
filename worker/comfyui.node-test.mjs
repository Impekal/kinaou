import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComfyPromptRequest, comfyWorkflowRelativePaths, generatedImageRelativePath, materializeComfyWorkflow, normalizeComfyUrl, validateComfyTemplate } from './comfyui.mjs'

const template = {
  schemaVersion: 1,
  id: 'ui-screenshot-sdxl',
  label: 'UI screenshot SDXL',
  workflow: {
    '3': { class_type: 'KSampler', inputs: { seed: 1, positive: ['6', 0] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'old prompt' } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative' } }
  },
  bindings: {
    positivePrompt: { nodeId: '6', input: 'text' },
    negativePrompt: { nodeId: '7', input: 'text' },
    seed: { nodeId: '3', input: 'seed' },
    width: { nodeId: '5', input: 'width' },
    height: { nodeId: '5', input: 'height' }
  }
}

test('accepts only local unauthenticated ComfyUI HTTP endpoints', () => {
  assert.equal(normalizeComfyUrl('http://localhost:8188/'), 'http://localhost:8188')
  assert.equal(normalizeComfyUrl(), 'http://127.0.0.1:8188')
  assert.throws(() => normalizeComfyUrl('https://cloud.example'), /localhost/)
  assert.throws(() => normalizeComfyUrl('http://127.0.0.1:8188/?token=secret'), /query/)
})

test('discovers only managed JSON templates and creates managed outputs', () => {
  const entries = ['ui.json', 'photo.workflow.json', '../bad.json', 'notes.txt'].map((name) => ({ name, isFile: () => true }))
  assert.deepEqual(comfyWorkflowRelativePaths(entries), ['KINAOU/Models/ComfyUI/Workflows/photo.workflow.json', 'KINAOU/Models/ComfyUI/Workflows/ui.json'])
  assert.equal(generatedImageRelativePath('job-42'), 'KINAOU/Assets/GeneratedImages/job-42.png')
  assert.throws(() => generatedImageRelativePath('../bad'), /job ID/)
})

test('validates explicit bindings and rejects undeclared or dangling inputs', () => {
  assert.equal(validateComfyTemplate(template), template)
  assert.throws(() => validateComfyTemplate({ ...template, bindings: { ...template.bindings, model: { nodeId: '3', input: 'model' } } }), /Unsupported/)
  assert.throws(() => validateComfyTemplate({ ...template, bindings: { ...template.bindings, seed: { nodeId: '404', input: 'seed' } } }), /existing input/)
})

test('materializes a copy without mutating the stored workflow', () => {
  const result = materializeComfyWorkflow(template, { positivePrompt: '  crisp banking dashboard  ', negativePrompt: 'blur', seed: 42, width: 1920, height: 1080 })
  assert.equal(result.workflow['6'].inputs.text, 'crisp banking dashboard')
  assert.equal(result.workflow['7'].inputs.text, 'blur')
  assert.equal(result.workflow['3'].inputs.seed, 42)
  assert.equal(result.workflow['5'].inputs.width, 1920)
  assert.equal(result.workflow['5'].inputs.height, 1080)
  assert.equal(template.workflow['6'].inputs.text, 'old prompt')
  assert.deepEqual(result.provenance, { kind: 'local-model', adapterId: 'comfyui', templateId: 'ui-screenshot-sdxl', seed: 42, width: 1920, height: 1080 })
})

test('bounds prompts, seed and dimensions before queueing', () => {
  assert.throws(() => materializeComfyWorkflow(template, { positivePrompt: '', seed: 1, width: 512, height: 512 }), /Positive prompt/)
  assert.throws(() => materializeComfyWorkflow(template, { positivePrompt: 'x', seed: -1, width: 512, height: 512 }), /Seed/)
  assert.throws(() => materializeComfyWorkflow(template, { positivePrompt: 'x', seed: 1, width: 100, height: 512 }), /Width/)
  const request = buildComfyPromptRequest(template, { positivePrompt: 'app screen', seed: 7, width: 1024, height: 1024 }, 'kinaou-job-7')
  assert.equal(request.body.client_id, 'kinaou-job-7')
  assert.equal(request.body.prompt['6'].inputs.text, 'app screen')
})

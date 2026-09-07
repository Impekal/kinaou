import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComfyPromptRequest, comfyHistoryStatus, comfyOutputQuery, comfyQueuePhase, comfyTempImageRelativePath, comfyTempVideoRelativePath, comfyWorkflowRelativePaths, detectComfyUi, generatedMediaExtensionFor, generatedImageRelativePath, generatedVideoRelativePath, materializeComfyWorkflow, normalizeComfyUrl, parseComfyPromptResponse, pickComfyOutputForMediaType, templateMediaType, validateComfyTemplate } from './comfyui.mjs'

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

test('detects only a reachable localhost ComfyUI and reports its version', async () => {
  const ok = await detectComfyUi('http://127.0.0.1:8188', async (url) => {
    assert.equal(url, 'http://127.0.0.1:8188/system_stats')
    return { ok: true, json: async () => ({ system: { comfyui_version: '0.3.40' } }) }
  })
  assert.deepEqual(ok, { available: true, version: '0.3.40' })
  assert.deepEqual(await detectComfyUi('http://127.0.0.1:8188', async () => ({ ok: false })), { available: false })
  assert.deepEqual(await detectComfyUi('http://127.0.0.1:8188', async () => { throw new Error('refused') }), { available: false })
  await assert.rejects(detectComfyUi('http://10.0.0.5:8188', async () => ({ ok: true, json: async () => ({}) })), /localhost/)
})

test('accepts only well-formed prompt IDs and surfaces node validation errors', () => {
  assert.equal(parseComfyPromptResponse({ prompt_id: 'abc-123', node_errors: {} }), 'abc-123')
  assert.throws(() => parseComfyPromptResponse({ prompt_id: 'abc-123', node_errors: { 3: { errors: [] } } }), /rejected workflow nodes: 3/)
  assert.throws(() => parseComfyPromptResponse({ prompt_id: '../evil' }), /invalid prompt ID/)
  assert.throws(() => parseComfyPromptResponse({}), /invalid prompt ID/)
})

test('reads history phases and collects only saved outputs', () => {
  assert.deepEqual(comfyHistoryStatus({}, 'p1'), { phase: 'waiting' })
  assert.deepEqual(comfyHistoryStatus({ p1: { status: { completed: false } } }, 'p1'), { phase: 'waiting' })
  const completed = comfyHistoryStatus({ p1: { status: { completed: true }, outputs: { 9: { images: [{ filename: 'ComfyUI_00001_.png', subfolder: '', type: 'output' }, { filename: 'preview.png', type: 'temp' }] } } } }, 'p1')
  assert.deepEqual(completed, { phase: 'completed', outputs: [{ filename: 'ComfyUI_00001_.png', subfolder: '', type: 'output' }] })
  assert.equal(comfyHistoryStatus({ p1: { status: { completed: true }, outputs: {} } }, 'p1').phase, 'failed')
  const failed = comfyHistoryStatus({ p1: { status: { status_str: 'error', completed: false, messages: [['execution_error', { exception_message: 'CUDA out of memory' }]] } } }, 'p1')
  assert.deepEqual(failed, { phase: 'failed', message: 'CUDA out of memory' })
})

test('collects video outputs and picks the matching media type', () => {
  const status = comfyHistoryStatus({ p1: { status: { completed: true }, outputs: { 8: { gifs: [{ filename: 'scene_00001.mp4', subfolder: 'video', type: 'output' }] }, 9: { images: [{ filename: 'poster.png', subfolder: '', type: 'output' }] } } } }, 'p1')
  assert.equal(status.phase, 'completed')
  assert.equal(status.outputs.length, 2)
  assert.equal(pickComfyOutputForMediaType(status.outputs, 'video').filename, 'scene_00001.mp4')
  assert.equal(pickComfyOutputForMediaType(status.outputs, 'image').filename, 'poster.png')
  assert.throws(() => pickComfyOutputForMediaType([{ filename: 'poster.png' }], 'video'), /video output/)
})

test('declares explicit template media types and managed video destinations', () => {
  assert.equal(templateMediaType(template), 'image')
  assert.equal(templateMediaType({ ...template, mediaType: 'video' }), 'video')
  assert.equal(validateComfyTemplate({ ...template, mediaType: 'video' }).mediaType, 'video')
  assert.throws(() => validateComfyTemplate({ ...template, mediaType: 'audio' }), /media type/)
  assert.equal(generatedVideoRelativePath('job-7', 'mp4'), 'KINAOU/Assets/GeneratedVideo/job-7.mp4')
  assert.equal(comfyTempVideoRelativePath('job-7', 'mp4'), 'KINAOU/Temp/GeneratedVideo/job-7.mp4.part')
  assert.throws(() => generatedVideoRelativePath('../bad', 'mp4'), /job ID/)
  assert.equal(generatedMediaExtensionFor('clip.MOV', 'video'), 'mov')
  assert.throws(() => generatedMediaExtensionFor('clip.mp4', 'image'), /image extension/)
})

test('finds the prompt in running or pending queues', () => {
  const queue = { queue_running: [[0, 'run-1', {}]], queue_pending: [[1, 'pend-2', {}]] }
  assert.equal(comfyQueuePhase(queue, 'run-1'), 'running')
  assert.equal(comfyQueuePhase(queue, 'pend-2'), 'pending')
  assert.equal(comfyQueuePhase(queue, 'gone-3'), 'absent')
  assert.equal(comfyQueuePhase(null, 'run-1'), 'absent')
})

test('builds only safe output view queries and managed temp paths', () => {
  assert.equal(comfyOutputQuery({ filename: 'ComfyUI_00001_.png', subfolder: '', type: 'output' }), 'filename=ComfyUI_00001_.png&subfolder=&type=output')
  assert.equal(comfyOutputQuery({ filename: 'scene.mp4', subfolder: 'video', type: 'output' }), 'filename=scene.mp4&subfolder=video&type=output')
  assert.throws(() => comfyOutputQuery({ filename: '../secret.png', subfolder: '', type: 'output' }), /filename/)
  assert.throws(() => comfyOutputQuery({ filename: 'a.png', subfolder: '../up', type: 'output' }), /subfolder/)
  assert.throws(() => comfyOutputQuery({ filename: 'a.png', subfolder: '', type: 'temp' }), /output files/)
  assert.equal(generatedMediaExtensionFor('image.JPEG'), 'jpg')
  assert.throws(() => generatedMediaExtensionFor('archive.zip'), /extension/)
  assert.equal(comfyTempImageRelativePath('job-1', 'png'), 'KINAOU/Temp/GeneratedImages/job-1.png.part')
  assert.throws(() => comfyTempImageRelativePath('../job', 'png'), /job ID/)
})

test('bounds prompts, seed and dimensions before queueing', () => {
  assert.throws(() => materializeComfyWorkflow(template, { positivePrompt: '', seed: 1, width: 512, height: 512 }), /Positive prompt/)
  assert.throws(() => materializeComfyWorkflow(template, { positivePrompt: 'x', seed: -1, width: 512, height: 512 }), /Seed/)
  assert.throws(() => materializeComfyWorkflow(template, { positivePrompt: 'x', seed: 1, width: 100, height: 512 }), /Width/)
  const request = buildComfyPromptRequest(template, { positivePrompt: 'app screen', seed: 7, width: 1024, height: 1024 }, 'kinaou-job-7')
  assert.equal(request.body.client_id, 'kinaou-job-7')
  assert.equal(request.body.prompt['6'].inputs.text, 'app screen')
})

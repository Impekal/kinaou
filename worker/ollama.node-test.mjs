import test from 'node:test'
import assert from 'node:assert/strict'
import { generateAiEditorProposal, generateDirectorPlan, listOllamaModels, normalizeOllamaUrl } from './ollama.mjs'

test('permits only loopback Ollama endpoints', () => {
  assert.equal(normalizeOllamaUrl('http://localhost:11434/'), 'http://localhost:11434')
  assert.throws(() => normalizeOllamaUrl('https://example.com'), /localhost/)
})

test('requests bounded structured AI Editor output and stamps provenance', async () => {
  let body
  const proposal = await generateAiEditorProposal('http://localhost:11434', 'qwen:7b', 'Move the opening', { tracks: [] }, async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ response: JSON.stringify({ schemaVersion: 1, title: 'Edit', objective: 'Pace', operations: [] }) }), { status: 200 })
  })
  assert.equal(body.stream, false)
  assert.ok(body.format.properties.operations)
  assert.deepEqual(proposal.provenance, { kind: 'local-model', adapterId: 'ollama', modelId: 'qwen:7b' })
  await assert.rejects(() => generateAiEditorProposal('http://localhost:11434', 'qwen:7b', '', {}, async () => new Response()), /1–4000/)
})

test('lists installed local models from the Ollama API', async () => {
  const models = await listOllamaModels('http://127.0.0.1:11434', async () => new Response(JSON.stringify({ models: [{ model: 'qwen:7b', size: 42 }] }), { status: 200 }))
  assert.deepEqual(models, [{ id: 'qwen:7b', sizeBytes: 42 }])
})

test('generates non-streaming structured output and stamps trusted provenance', async () => {
  let body
  const plan = await generateDirectorPlan('http://127.0.0.1:11434', 'qwen:7b', 'A harbour film', async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ response: JSON.stringify({ schemaVersion: 1, title: 'Harbour', objective: 'Explain', script: 'Words', scenes: [] }) }), { status: 200 })
  })
  assert.equal(body.stream, false)
  assert.equal(body.format.type, 'object')
  assert.deepEqual(plan.provenance, { kind: 'local-model', adapterId: 'ollama', modelId: 'qwen:7b' })
})

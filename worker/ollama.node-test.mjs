import test from 'node:test'
import assert from 'node:assert/strict'
import { generateAiEditorProposal, generateDirectorPlan, generateShortHighlightProposal, listOllamaModels, normalizeOllamaUrl } from './ollama.mjs'

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

  const editSchemas =
    body
      .format
      .properties
      .operations
      .items
      .properties
      .edit
      .oneOf

  const operationTypes =
    editSchemas.map(
      schema =>
        schema.properties
          ?.type
          ?.const
    )

  assert.ok(
    operationTypes.includes(
      'move-clips'
    )
  )

  assert.ok(
    operationTypes.includes(
      'set-clip-transition'
    )
  )

  assert.ok(
    operationTypes.includes(
      'set-clip-motion'
    )
  )

  assert.match(
    body.prompt,
    /Director execution context/
  )

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
  assert.match(body.prompt, /exact words to be spoken/)
  assert.match(body.prompt, /empty narration explicitly means a silent scene/)
  assert.deepEqual(plan.provenance, { kind: 'local-model', adapterId: 'ollama', modelId: 'qwen:7b' })
})


test('generates evidence-grounded Short highlight proposals without trend or virality claims', async () => {
  let body

  const proposal =
    await generateShortHighlightProposal(
      'http://localhost:11434',
      'qwen:7b',
      {
        project: {
          timelineDurationMs:
            120000
        },

        target: {
          maximumDurationMs:
            60000,
          outputLanguage:
            'en'
        },

        evidence: {
          scenes: [
            {
              sceneId:
                'scene-a',
              inMs:
                10000,
              outMs:
                30000
            }
          ],

          transcriptSegments: [
            {
              id:
                'transcript:clip:0',
              startMs:
                12000,
              endMs:
                17000,
              text:
                'Evidence'
            }
          ]
        }
      },
      async (
        _url,
        init
      ) => {
        body =
          JSON.parse(
            init.body
          )

        return new Response(
          JSON.stringify({
            response:
              JSON.stringify({
                schemaVersion:
                  1,

                title:
                  'Short options',

                objective:
                  'Find an excerpt',

                candidates: [
                  {
                    id:
                      'candidate-a',

                    hook:
                      'Central claim',

                    rationale:
                      'Supported by the transcript.',

                    inMs:
                      10000,

                    outMs:
                      30000,

                    order:
                      1,

                    evidence: [
                      {
                        kind:
                          'scene',
                        id:
                          'scene-a'
                      }
                    ]
                  }
                ]
              })
          }),
          {
            status:
              200
          }
        )
      }
    )

  assert.equal(
    body.stream,
    false
  )

  assert.equal(
    body.format
      .properties
      .candidates
      .minItems,
    1
  )

  assert.match(
    body.prompt,
    /exact scene IDs and transcript segment IDs/
  )

  assert.match(
    body.prompt,
    /Do not claim virality/
  )

  assert.match(
    body.prompt,
    /never an invented quotation/
  )

  assert.deepEqual(
    proposal.provenance,
    {
      kind:
        'local-model',
      adapterId:
        'ollama',
      modelId:
        'qwen:7b'
    }
  )
})

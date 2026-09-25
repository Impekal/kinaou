const MAX_BRIEF_LENGTH = 50_000

export function normalizeOllamaUrl(value = 'http://127.0.0.1:11434') {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Ollama URL must be a localhost HTTP endpoint')
  return url.toString().replace(/\/$/, '')
}

export async function listOllamaModels(baseUrl, fetchImpl = fetch) {
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(1500) })
  if (!response.ok) throw new Error(`Ollama model list failed with HTTP ${response.status}`)
  const payload = await response.json()
  if (!Array.isArray(payload.models)) throw new Error('Invalid Ollama model list')
  return payload.models.map((item) => ({ id: String(item.model ?? item.name ?? ''), sizeBytes: Number(item.size ?? 0) })).filter((item) => item.id && Number.isFinite(item.sizeBytes))
}

export async function generateDirectorPlan(baseUrl, model, brief, fetchImpl = fetch) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Local model is required')
  if (typeof brief !== 'string' || !brief.trim() || brief.length > MAX_BRIEF_LENGTH) throw new Error('Brief must contain 1–50000 characters')
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10 * 60_000),
    body: JSON.stringify({ model: model.trim(), stream: false, options: { temperature: 0 }, format: directorJsonSchema(), prompt: `Create a production-ready video DirectorPlan from this brief. Return only the requested schema. Put the exact words to be spoken in each scene's narration; keep visual directions in description and visualBrief, never in narration. An empty narration explicitly means a silent scene.\n\n${brief.trim()}` })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Ollama generation failed with HTTP ${response.status}`)
  if (typeof payload.response !== 'string') throw new Error('Ollama returned no structured response')
  const plan = JSON.parse(payload.response)
  plan.provenance = { kind: 'local-model', adapterId: 'ollama', modelId: model.trim() }
  return plan
}

export async function generateAiEditorProposal(baseUrl, model, instruction, context, fetchImpl = fetch) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Local model is required')
  if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 4000) throw new Error('Edit instruction must contain 1–4000 characters')
  const contextJson = JSON.stringify(context)
  if (contextJson.length > 200_000) throw new Error('AI Editor context is too large')
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10 * 60_000), body: JSON.stringify({ model: model.trim(), stream: false, options: { temperature: 0 }, format: aiEditorJsonSchema(), prompt: `Propose safe edits for the supplied KINAOU timeline. Use only existing trackId/clipId values and allowed operation types. When Director execution context exists and readiness.ready is true, treat its scene IDs, planned starts, planned durations and linked clips as authoritative constraints. Use move-clips only when multiple existing clips must move together. A set-clip-transition durationMs of 0 removes the transition. A set-clip-motion value of "none" removes motion. Never invent tracks, clips, assets or scene IDs. Return only the schema.\nInstruction: ${instruction.trim()}\nTimeline: ${contextJson}` }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Ollama generation failed with HTTP ${response.status}`)
  if (typeof payload.response !== 'string') throw new Error('Ollama returned no structured response')
  const proposal = JSON.parse(payload.response)
  proposal.provenance = { kind: 'local-model', adapterId: 'ollama', modelId: model.trim() }
  return proposal
}

export async function generateShortHighlightProposal(baseUrl, model, context, fetchImpl = fetch) {
  if (
    typeof model !== 'string'
    || !model.trim()
  ) {
    throw new Error(
      'Local model is required'
    )
  }

  const contextJson =
    JSON.stringify(
      context
    )

  if (
    !contextJson.length
    || contextJson.length > 300_000
  ) {
    throw new Error(
      'Short intelligence context is too large'
    )
  }

  const response =
    await fetchImpl(
      `${normalizeOllamaUrl(baseUrl)}/api/generate`,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json'
        },

        signal:
          AbortSignal.timeout(
            10 * 60_000
          ),

        body:
          JSON.stringify({
            model:
              model.trim(),

            stream:
              false,

            options: {
              temperature:
                0
            },

            format:
              shortHighlightJsonSchema(),

            prompt:
              `Propose review-only Short highlight candidates from the supplied KINAOU evidence context. Use only exact scene IDs and transcript segment IDs that exist in the context. Every candidate must include an exact inMs/outMs range, a concise editorial hook, a factual rationale, a contiguous order value starting at 1, and one or more evidence references. Write title, objective, hook and rationale in target.outputLanguage. A hook is an editorial label grounded in evidence, never an invented quotation. Keep every candidate inside project.timelineDurationMs and at or below target.maximumDurationMs. Evidence references must overlap the proposed range. Do not claim virality, trend performance, platform success or current popularity. Do not invent facts, quotes, scene IDs, transcript IDs or timing. Return only supported candidates; if evidence is sparse, return fewer candidates rather than inventing support.\nContext: ${contextJson}`
          })
      }
    )

  const payload =
    await response
      .json()
      .catch(
        () => ({})
      )

  if (!response.ok) {
    throw new Error(
      typeof payload.error
        === 'string'
        ? payload.error
        : `Ollama generation failed with HTTP ${response.status}`
    )
  }

  if (
    typeof payload.response
    !== 'string'
  ) {
    throw new Error(
      'Ollama returned no structured response'
    )
  }

  const proposal =
    JSON.parse(
      payload.response
    )

  proposal.provenance = {
    kind:
      'local-model',
    adapterId:
      'ollama',
    modelId:
      model.trim()
  }

  return proposal
}



export async function generateShortReframeProposal(
  baseUrl,
  model,
  instruction,
  context,
  fetchImpl = fetch
) {
  if (
    typeof model !== 'string'
    || !model.trim()
  ) {
    throw new Error(
      'Local model is required'
    )
  }

  if (
    typeof instruction !== 'string'
    || !instruction.trim()
    || instruction.length > 4000
  ) {
    throw new Error(
      'Reframing instruction must contain 1–4000 characters'
    )
  }

  const contextJson =
    JSON.stringify(
      context
    )

  if (
    !contextJson.length
    || contextJson.length > 200_000
  ) {
    throw new Error(
      'Short reframing context is too large'
    )
  }

  const response =
    await fetchImpl(
      `${normalizeOllamaUrl(baseUrl)}/api/generate`,
      {
        method:
          'POST',

        headers: {
          'content-type':
            'application/json'
        },

        signal:
          AbortSignal.timeout(
            10 * 60_000
          ),

        body:
          JSON.stringify({
            model:
              model.trim(),

            stream:
              false,

            options: {
              temperature:
                0
            },

            format:
              shortReframeJsonSchema(),

            prompt:
              `Create review-only per-clip reframing suggestions for this KINAOU Short.

You DO NOT see the video pixels and must never claim that you visually detected a face, person, object, action or composition.

Use only:
1. the user's reframing instruction;
2. explicit spatial information already written in scene.title or scene.description;
3. exact trackId, clipId and sceneId values from context.visualClips.

Never invent IDs.

Only propose a non-centre focus when the instruction or supplied scene text explicitly supports a spatial direction or location. If there is no explicit basis for changing a clip, do not target that clip.

focusX and focusY are normalized from 0 to 1:
- focusX 0 = left, 0.5 = centre, 1 = right
- focusY 0 = top, 0.5 = centre, 1 = bottom

Do not reproduce the existing currentFocus as a no-op.
Do not modify timing, assets, audio, captions or transforms.
Return only the requested schema.

Instruction: ${instruction.trim()}

Context: ${contextJson}`
          })
      }
    )

  const payload =
    await response
      .json()
      .catch(
        () => ({})
      )

  if (!response.ok) {
    throw new Error(
      typeof payload.error
        === 'string'
        ? payload.error
        : `Ollama generation failed with HTTP ${response.status}`
    )
  }

  if (
    typeof payload.response
    !== 'string'
  ) {
    throw new Error(
      'Ollama returned no structured response'
    )
  }

  const proposal =
    JSON.parse(
      payload.response
    )

  proposal.provenance = {
    kind:
      'local-model',

    adapterId:
      'ollama',

    modelId:
      model.trim()
  }

  return proposal
}


function shortReframeJsonSchema() {
  return {
    type:
      'object',

    properties: {
      schemaVersion: {
        const:
          1
      },

      title: {
        type:
          'string'
      },

      objective: {
        type:
          'string'
      },

      operations: {
        type:
          'array',

        minItems:
          1,

        maxItems:
          100,

        items: {
          type:
            'object',

          properties: {
            id: {
              type:
                'string'
            },

            trackId: {
              type:
                'string'
            },

            clipId: {
              type:
                'string'
            },

            sceneId: {
              type:
                'string'
            },

            focusX: {
              type:
                'number',

              minimum:
                0,

              maximum:
                1
            },

            focusY: {
              type:
                'number',

              minimum:
                0,

              maximum:
                1
            },

            reason: {
              type:
                'string'
            }
          },

          required: [
            'id',
            'trackId',
            'clipId',
            'sceneId',
            'focusX',
            'focusY',
            'reason'
          ]
        }
      }
    },

    required: [
      'schemaVersion',
      'title',
      'objective',
      'operations'
    ]
  }
}


function shortHighlightJsonSchema() {
  const evidence = {
    oneOf: [
      {
        type:
          'object',

        properties: {
          kind: {
            const:
              'scene'
          },

          id: {
            type:
              'string'
          }
        },

        required: [
          'kind',
          'id'
        ]
      },

      {
        type:
          'object',

        properties: {
          kind: {
            const:
              'transcript'
          },

          id: {
            type:
              'string'
          }
        },

        required: [
          'kind',
          'id'
        ]
      }
    ]
  }

  return {
    type:
      'object',

    properties: {
      schemaVersion: {
        const:
          1
      },

      title: {
        type:
          'string'
      },

      objective: {
        type:
          'string'
      },

      candidates: {
        type:
          'array',

        minItems:
          1,

        maxItems:
          20,

        items: {
          type:
            'object',

          properties: {
            id: {
              type:
                'string'
            },

            hook: {
              type:
                'string'
            },

            rationale: {
              type:
                'string'
            },

            inMs: {
              type:
                'integer',
              minimum:
                0
            },

            outMs: {
              type:
                'integer',
              minimum:
                1
            },

            order: {
              type:
                'integer',
              minimum:
                1,
              maximum:
                20
            },

            evidence: {
              type:
                'array',
              minItems:
                1,
              maxItems:
                50,
              items:
                evidence
            }
          },

          required: [
            'id',
            'hook',
            'rationale',
            'inMs',
            'outMs',
            'order',
            'evidence'
          ]
        }
      }
    },

    required: [
      'schemaVersion',
      'title',
      'objective',
      'candidates'
    ]
  }
}


export async function generateMediaAcquisitionPlan(baseUrl, model, context, fetchImpl = fetch) {
  if (typeof model !== 'string' || !model.trim()) throw new Error('Local model is required')
  const contextJson = JSON.stringify(context)
  if (contextJson.length > 200_000) throw new Error('Media plan context is too large')
  const response = await fetchImpl(`${normalizeOllamaUrl(baseUrl)}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10 * 60_000),
    body: JSON.stringify({
      model: model.trim(), stream: false, options: { temperature: 0 }, format: mediaAcquisitionJsonSchema(),
      prompt: `For each storyboard scene below, propose how KINAOU should obtain its visual. Use exactly one item per scene that needs a visual, referencing the scene's exact id. Prefer "web-capture" with one concrete public https URL when the scene shows a real website; "app-capture" with the exact macOS application name when it shows a real desktop app; "generate-image" with a concrete visual prompt for illustrative or fictional visuals. Give a short rationale per item. Return only the schema.\nScenes: ${contextJson}`
    })
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Ollama generation failed with HTTP ${response.status}`)
  if (typeof payload.response !== 'string') throw new Error('Ollama returned no structured response')
  const plan = JSON.parse(payload.response)
  plan.provenance = { kind: 'local-model', adapterId: 'ollama', modelId: model.trim() }
  return plan
}

function mediaAcquisitionJsonSchema() {
  const item = (kind, properties, required) => ({ type: 'object', properties: { kind: { const: kind }, sceneId: { type: 'string' }, rationale: { type: 'string' }, ...properties }, required: ['kind', 'sceneId', 'rationale', ...required] })
  return {
    type: 'object',
    required: ['schemaVersion', 'items'],
    properties: {
      schemaVersion: { const: 1 },
      items: {
        type: 'array', minItems: 1, maxItems: 100,
        items: { oneOf: [
          item('web-capture', { url: { type: 'string' } }, ['url']),
          item('app-capture', { appName: { type: 'string' } }, ['appName']),
          item('generate-image', { positivePrompt: { type: 'string' }, negativePrompt: { type: 'string' } }, ['positivePrompt'])
        ] }
      }
    }
  }
}

function aiEditorJsonSchema() {
  const target = {
    trackId:
      { type: 'string' },
    clipId:
      { type: 'string' }
  }

  const edit = (
    type,
    properties,
    required = []
  ) => ({
    type:
      'object',

    properties: {
      type: {
        const:
          type
      },
      ...target,
      ...properties
    },

    required: [
      'type',
      'trackId',
      'clipId',
      ...required
    ]
  })

  const moveClips = {
    type:
      'object',

    properties: {
      type: {
        const:
          'move-clips'
      },

      moves: {
        type:
          'array',

        minItems:
          2,

        maxItems:
          100,

        items: {
          type:
            'object',

          properties: {
            trackId: {
              type:
                'string'
            },

            clipId: {
              type:
                'string'
            },

            startMs: {
              type:
                'integer',
              minimum:
                0
            }
          },

          required: [
            'trackId',
            'clipId',
            'startMs'
          ]
        }
      }
    },

    required: [
      'type',
      'moves'
    ]
  }

  return {
    type:
      'object',

    properties: {
      schemaVersion: {
        const:
          1
      },

      title: {
        type:
          'string'
      },

      objective: {
        type:
          'string'
      },

      operations: {
        type:
          'array',

        minItems:
          1,

        maxItems:
          500,

        items: {
          type:
            'object',

          properties: {
            id: {
              type:
                'string'
            },

            reason: {
              type:
                'string'
            },

            edit: {
              oneOf: [
                edit(
                  'move-clip',
                  {
                    startMs: {
                      type:
                        'integer',
                      minimum:
                        0
                    }
                  },
                  [
                    'startMs'
                  ]
                ),

                moveClips,

                edit(
                  'trim-clip',
                  {
                    startMs: {
                      type:
                        'integer',
                      minimum:
                        0
                    },

                    durationMs: {
                      type:
                        'integer',
                      minimum:
                        1
                    },

                    sourceOffsetMs: {
                      type:
                        'integer',
                      minimum:
                        0
                    }
                  },
                  [
                    'startMs',
                    'durationMs',
                    'sourceOffsetMs'
                  ]
                ),

                edit(
                  'set-clip-gain',
                  {
                    gain: {
                      type:
                        'number',
                      minimum:
                        0,
                      maximum:
                        4
                    }
                  },
                  [
                    'gain'
                  ]
                ),

                edit(
                  'set-clip-speed',
                  {
                    speed: {
                      type:
                        'number',
                      minimum:
                        .25,
                      maximum:
                        4
                    }
                  },
                  [
                    'speed'
                  ]
                ),

                edit(
                  'set-clip-fades',
                  {
                    inMs: {
                      type:
                        'integer',
                      minimum:
                        0,
                      maximum:
                        5000
                    },

                    outMs: {
                      type:
                        'integer',
                      minimum:
                        0,
                      maximum:
                        5000
                    }
                  },
                  [
                    'inMs',
                    'outMs'
                  ]
                ),

                edit(
                  'set-clip-transition',
                  {
                    durationMs: {
                      type:
                        'integer',
                      minimum:
                        0,
                      maximum:
                        5000
                    }
                  },
                  [
                    'durationMs'
                  ]
                ),

                edit(
                  'set-clip-motion',
                  {
                    motion: {
                      enum: [
                        'none',
                        'zoom-in',
                        'zoom-out'
                      ]
                    }
                  },
                  [
                    'motion'
                  ]
                ),

                edit(
                  'update-caption-text',
                  {
                    text: {
                      type:
                        'string'
                    }
                  },
                  [
                    'text'
                  ]
                )
              ]
            }
          },

          required: [
            'id',
            'reason',
            'edit'
          ]
        }
      }
    },

    required: [
      'schemaVersion',
      'title',
      'objective',
      'operations'
    ]
  }
}

function directorJsonSchema() {
  return {
    type: 'object',
    required: ['schemaVersion', 'title', 'objective', 'script', 'scenes'],
    properties: {
      schemaVersion: { const: 1 },
      title: { type: 'string' },
      objective: { type: 'string' },
      script: { type: 'string' },
      scenes: {
        type: 'array', minItems: 1,
        items: {
          type: 'object',
          required: ['id', 'title', 'description', 'durationMs', 'narration', 'visualBrief', 'requiredMedia'],
          properties: {
            id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
            durationMs: { type: 'integer', minimum: 500 }, narration: { type: 'string' }, visualBrief: { type: 'string' },
            requiredMedia: { type: 'array', items: { enum: ['video', 'image', 'voice', 'music', 'sfx'] } }
          }
        }
      }
    }
  }
}

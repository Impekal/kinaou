import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHATTERBOX_MODEL_ID,
  CHATTERBOX_VOICE_ID,
  buildChatterboxBridgeCommand,
  buildChatterboxPostprocessCommand,
  buildChatterboxReferenceCommand,
  chatterboxPaths,
  chatterboxPostprocessRate,
  chatterboxRequestFromSpeech,
  chatterboxSpeechVoiceDescriptor,
  speechJobFromChatterbox
} from './chatterbox.mjs'

test(
  'declares only measured Chatterbox capabilities',
  () => {
    assert.deepEqual(
      chatterboxSpeechVoiceDescriptor({
        referenceAudio: true
      }),
      {
        id: CHATTERBOX_VOICE_ID,
        adapterId: 'chatterbox',
        label: 'Chatterbox Multilingual',
        locale: null,
        capabilities: [
          'synthesis',
          'language-control',
          'voice-clone',
          'reference-audio'
        ]
      }
    )

    assert.deepEqual(
      chatterboxSpeechVoiceDescriptor({
        referenceAudio: false
      }).capabilities,
      [
        'synthesis',
        'language-control'
      ]
    )
  }
)

test(
  'accepts measured DE EN FR language control',
  () => {
    for (const language of [
      'de',
      'en',
      'fr'
    ]) {
      assert.deepEqual(
        chatterboxRequestFromSpeech({
          adapterId: 'chatterbox',
          voiceId:
            CHATTERBOX_VOICE_ID,
          text: 'Test',
          language
        }),
        {
          adapterId: 'chatterbox',
          voiceId:
            CHATTERBOX_VOICE_ID,
          text: 'Test',
          language
        }
      )
    }
  }
)

test(
  'accepts only explicitly authorized managed reference audio',
  () => {
    assert.deepEqual(
      chatterboxRequestFromSpeech({
        adapterId: 'chatterbox',
        voiceId:
          CHATTERBOX_VOICE_ID,
        text: 'Bonjour',
        language: 'fr',
        referenceAudio: {
          assetId: 'own',
          path:
            'KINAOU/Assets/own.wav',
          authorized: true
        }
      }),
      {
        adapterId: 'chatterbox',
        voiceId:
          CHATTERBOX_VOICE_ID,
        text: 'Bonjour',
        language: 'fr',
        referenceAudio: {
          assetId: 'own',
          path:
            'KINAOU/Assets/own.wav',
          authorized: true
        }
      }
    )

    for (const referenceAudio of [
      {
        assetId: 'own',
        path:
          'KINAOU/Assets/own.wav',
        authorized: false
      },
      {
        assetId: 'own',
        path: '../outside.wav',
        authorized: true
      },
      {
        assetId: '',
        path:
          'KINAOU/Assets/own.wav',
        authorized: true
      }
    ]) {
      assert.throws(
        () =>
          chatterboxRequestFromSpeech({
            adapterId:
              'chatterbox',
            voiceId:
              CHATTERBOX_VOICE_ID,
            text: 'Bonjour',
            language: 'fr',
            referenceAudio
          }),
        /reference/i
      )
    }
  }
)

test(
  'rejects capabilities not implemented by installed Chatterbox',
  () => {
    const base = {
      adapterId: 'chatterbox',
      voiceId:
        CHATTERBOX_VOICE_ID,
      text: 'Hallo',
      language: 'de'
    }

    assert.throws(
      () =>
        chatterboxRequestFromSpeech({
          ...base,
          styleInstruction:
            'very excited'
        }),
      /styleInstruction/
    )

    assert.throws(
      () =>
        chatterboxRequestFromSpeech({
          ...base,
          pace: 1.2
        }),
      /pace/
    )

    assert.throws(
      () =>
        chatterboxRequestFromSpeech({
          ...base,
          language: 'es'
        }),
      /language/
    )
  }
)

test(
  'uses managed job outputs and shell-free execution commands',
  () => {
    assert.deepEqual(
      chatterboxPaths('abc-123'),
      {
        request:
          'KINAOU/Temp/Speech/abc-123.json',
        reference:
          'KINAOU/Temp/Speech/abc-123-reference.wav',
        postprocess:
          'KINAOU/Temp/Speech/abc-123-postprocess.wav',
        audio:
          'KINAOU/Assets/GeneratedVoice/abc-123.wav'
      }
    )

    assert.deepEqual(
      buildChatterboxBridgeCommand({
        pythonPath:
          '/runtime/python',
        bridgePath:
          '/worker/chatterbox-bridge.py',
        requestPath:
          '/disk/request.json',
        audioPath:
          '/disk/output.wav',
        device: 'mps'
      }),
      {
        executable:
          '/runtime/python',
        args: [
          '/worker/chatterbox-bridge.py',
          '--request',
          '/disk/request.json',
          '--output',
          '/disk/output.wav',
          '--device',
          'mps'
        ]
      }
    )

    assert.deepEqual(
      buildChatterboxReferenceCommand({
        sourcePath:
          '/disk/source.wav',
        outputPath:
          '/disk/reference.wav'
      }),
      {
        executable: 'ffmpeg',
        args: [
          '-y',
          '-v',
          'error',
          '-i',
          '/disk/source.wav',
          '-af',
          'silenceremove=start_periods=1:start_duration=0.15:start_threshold=-45dB,atrim=duration=15',
          '-ar',
          '24000',
          '-ac',
          '1',
          '-c:a',
          'pcm_s16le',
          '/disk/reference.wav'
        ]
      }
    )
  }
)

test(
  'uses measured language-specific Chatterbox tempo factors',
  () => {
    assert.equal(
      chatterboxPostprocessRate('de'),
      1.25
    )

    assert.equal(
      chatterboxPostprocessRate('en'),
      1.20
    )

    assert.equal(
      chatterboxPostprocessRate('fr'),
      1.20
    )

    assert.deepEqual(
      buildChatterboxPostprocessCommand({
        sourcePath:
          '/disk/raw.wav',
        outputPath:
          '/disk/final.wav',
        rate: 1.25
      }),
      {
        executable: 'ffmpeg',
        args: [
          '-y',
          '-v',
          'error',
          '-i',
          '/disk/raw.wav',
          '-filter:a',
          'atempo=1.25',
          '-c:a',
          'pcm_f32le',
          '/disk/final.wav'
        ]
      }
    )
  }
)

test(
  'preserves Chatterbox provenance in generic speech jobs',
  () => {
    assert.deepEqual(
      speechJobFromChatterbox({
        id: 'job',
        state: 'succeeded',
        progress: 1,
        createdAt: 'a',
        updatedAt: 'b',
        language: 'de',
        modelId:
          CHATTERBOX_MODEL_ID,
        seed: 42,
        tempoFactor: 1.25,
        referenceAudio: {
          assetId: 'own'
        },
        audioPath:
          'KINAOU/Assets/GeneratedVoice/job.wav',
        durationMs: 1000,
        sizeBytes: 42
      }),
      {
        id: 'job',
        adapterId:
          'chatterbox',
        voiceId:
          CHATTERBOX_VOICE_ID,
        state: 'succeeded',
        progress: 1,
        createdAt: 'a',
        updatedAt: 'b',
        language: 'de',
        modelId:
          CHATTERBOX_MODEL_ID,
        seed: 42,
        tempoFactor: 1.25,
        referenceAssetId:
          'own',
        audioPath:
          'KINAOU/Assets/GeneratedVoice/job.wav',
        durationMs: 1000,
        sizeBytes: 42
      }
    )
  }
)

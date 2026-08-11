/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  decodeRealtimeServerEvent,
  downsamplePcm16,
  pcm16ToBase64,
  realtimeAudioContract,
  realtimeAuthRenewalDelayMs,
  realtimeCommitTranscriptSettled,
  realtimeDrillDraftText,
  realtimeEventAudio,
  realtimeEventError,
  realtimeEventNeedsAuthRefresh,
  realtimeEventText,
  realtimeTranscriptPreviewAction,
  talkWiseBearerProtocol,
  trainingRealtimeWebSocketUrl,
} from '../realtime-client'
import {
  int16PcmSamples,
  isPcmVoiceAudioMimeType,
  sniffVoiceAudioMimeType,
} from '../voice-audio'

describe('training realtime client contract', () => {
  test('reads a drill draft without treating it as a persisted transcript', () => {
    const event = {
      type: 'training.drill.draft',
      payload: { text: '  I can confirm tomorrow.  ' },
    }

    assert.equal(realtimeDrillDraftText(event), 'I can confirm tomorrow.')
    assert.deepEqual(realtimeTranscriptPreviewAction(event), { type: 'clear' })
    assert.equal(
      realtimeDrillDraftText({
        type: 'transcript.persisted',
        payload: { text: 'I can confirm tomorrow.' },
      }),
      null
    )
    assert.equal(
      realtimeDrillDraftText({
        type: 'training.drill.draft',
        payload: { text: '   ' },
      }),
      null
    )
  })

  test('prefers encoded container magic over a stale PCM declaration', () => {
    const ogg = Uint8Array.from([
      ...new TextEncoder().encode('OggS'),
      0,
      2,
      ...new TextEncoder().encode('OpusHead'),
    ])

    assert.equal(sniffVoiceAudioMimeType(ogg, 'audio/pcm'), 'audio/ogg')
    assert.equal(isPcmVoiceAudioMimeType('audio/pcm; rate=24000'), true)
    assert.equal(isPcmVoiceAudioMimeType('audio/ogg'), false)
    assert.deepEqual(
      [...int16PcmSamples(Uint8Array.from([0x34, 0x12, 0xcc, 0xff]))],
      [0x1234, -52]
    )
  })

  test('builds the same-origin proxy URL with session binding and profile', () => {
    const url = trainingRealtimeWebSocketUrl(
      '/api/talkwise/training',
      {
        profile: 'speech_to_speech',
        roomId: '42',
        sessionId: 'session-1',
      },
      { host: 'talkwise.test', protocol: 'https:' }
    )

    assert.equal(
      url,
      'wss://talkwise.test/api/talkwise/training/realtime?input_sample_rate=24000&profile=speech_to_speech&provider=configured&room_id=42&session_id=session-1'
    )
    assert.match(
      trainingRealtimeWebSocketUrl(
        '',
        {
          profile: 'cascade',
          roomId: '42',
          sessionId: 'session-1',
        },
        { host: 'talkwise.test', protocol: 'http:' }
      ),
      /^ws:\/\/talkwise\.test\/api\/talkwise\/training\/realtime\?/
    )
    assert.throws(() =>
      trainingRealtimeWebSocketUrl(
        'https://upstream.example/api/v1/training-studio',
        {
          profile: 'cascade',
          roomId: '42',
          sessionId: 'session-1',
        },
        { host: 'talkwise.test', protocol: 'https:' }
      )
    )
  })

  test('uses a dedicated subprotocol for the authenticated bearer', () => {
    assert.equal(
      talkWiseBearerProtocol('header.payload.signature'),
      'talkwise.bearer.header.payload.signature'
    )
    assert.throws(() => talkWiseBearerProtocol(''))
    assert.throws(() => talkWiseBearerProtocol('unsafe token'))
  })

  test('keeps near-realtime and true realtime audio contracts distinct', () => {
    assert.deepEqual(realtimeAudioContract('cascade'), {
      channels: 1,
      inputSampleRate: 16000,
      latencyProfile: 'near_realtime',
      outputSampleRate: 24000,
      profile: 'cascade',
    })
    assert.equal(
      realtimeAudioContract('speech_to_speech').latencyProfile,
      'true_realtime'
    )
    assert.deepEqual(
      realtimeAudioContract('speech_to_speech', 'volcengine.doubao_realtime'),
      {
        channels: 1,
        inputSampleRate: 16000,
        latencyProfile: 'true_realtime',
        outputSampleRate: 24000,
        profile: 'speech_to_speech',
      }
    )
  })

  test('encodes resampled pcm16 input without retaining client identity', () => {
    const samples = downsamplePcm16(
      new Float32Array([0, 0.5, 1, -0.5, -1, 0]),
      48000,
      24000
    )
    assert.equal(samples.length, 3)
    assert.equal(typeof pcm16ToBase64(samples), 'string')
    assert.ok(pcm16ToBase64(samples).length > 0)
  })

  test('decodes transcript and audio output events', () => {
    const transcript = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'transcript.done',
        payload: { transcript: 'A persisted final turn.' },
      })
    )
    assert.ok(transcript)
    assert.equal(realtimeEventText(transcript), 'A persisted final turn.')

    const audio = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'audio.output',
        payload: {
          audio: btoa(String.fromCharCode(0, 1, 2, 3)),
          mimeType: 'audio/pcm',
          sampleRate: 24000,
        },
      })
    )
    assert.ok(audio)
    const decodedAudio = realtimeEventAudio(audio)
    assert.ok(decodedAudio)
    assert.deepEqual([...decodedAudio.bytes], [0, 1, 2, 3])
  })

  test('treats transcript deltas as one replaceable provisional bubble', () => {
    const preview = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'transcript.delta',
        payload: { delta: '为了降低风险我们可以分成两个阶段' },
        metadata: { preview: true, replace: true },
      })
    )
    assert.ok(preview)
    assert.deepEqual(realtimeTranscriptPreviewAction(preview), {
      type: 'update',
      text: '为了降低风险我们可以分成两个阶段',
    })

    const persisted = decodeRealtimeServerEvent(
      JSON.stringify({ type: 'transcript.persisted' })
    )
    assert.ok(persisted)
    assert.deepEqual(realtimeTranscriptPreviewAction(persisted), {
      type: 'clear',
    })
  })

  test('normalizes realtime failures for the native error notification', () => {
    const error = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'error',
        payload: { message: 'Realtime provider is unavailable.' },
      })
    )

    assert.ok(error)
    assert.equal(realtimeEventError(error), 'Realtime provider is unavailable.')
  })

  test('provides actionable copy when no speech was recognized', () => {
    const error = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'error',
        payload: {
          code: 'REALTIME_INPUT_AUDIO_UNRECOGNIZED',
          sourceCode: 'DOUBAO_VOICE_TRANSCRIPT_EMPTY',
          message: 'No clear speech was recognized.',
        },
      })
    )

    assert.ok(error)
    assert.equal(
      realtimeEventError(error),
      'No clear speech was recognized. Move closer to the microphone and try again.'
    )
    assert.equal(
      realtimeEventError(error, (_english, chinese) => chinese),
      '没有识别到清晰语音，请靠近麦克风后重试。'
    )
  })

  test('provides localized provider and worker failure guidance', () => {
    const providerUnavailable = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'error',
        payload: {
          code: 'REALTIME_PROVIDER_UNAVAILABLE',
          errorCategory: 'provider_unavailable',
        },
      })
    )
    const workerFailure = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'error',
        payload: { code: 'REALTIME_EVENT_PUMP_FAILED' },
      })
    )

    assert.ok(providerUnavailable)
    assert.ok(workerFailure)
    assert.equal(
      realtimeEventError(providerUnavailable, (_english, chinese) => chinese),
      '实时语音服务暂时不可用，请稍后重试。'
    )
    assert.equal(
      realtimeEventError(workerFailure, (_english, chinese) => chinese),
      '实时语音处理失败，请重新开始实时语音后重试。'
    )
  })

  test('only treats TalkWise session failures as refreshable authentication errors', () => {
    const expired = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'error',
        payload: {
          code: 'REALTIME_PROVIDER_FAILED',
          sourceCode: 'TALKWISE_SESSION_AUTHENTICATION_FAILED',
        },
      })
    )
    const providerCredential = decodeRealtimeServerEvent(
      JSON.stringify({
        type: 'error',
        payload: { sourceCode: 'DOUBAO_VOICE_AUTHENTICATION_FAILED' },
      })
    )

    assert.ok(expired)
    assert.ok(providerCredential)
    assert.equal(realtimeEventNeedsAuthRefresh(expired), true)
    assert.equal(realtimeEventNeedsAuthRefresh(providerCredential), false)
  })

  test('renews a realtime socket one minute before access-token expiry', () => {
    assert.equal(realtimeAuthRenewalDelayMs(1000, 800_000), 140_000)
    assert.equal(realtimeAuthRenewalDelayMs(800, 800_000), 1000)
    assert.equal(realtimeAuthRenewalDelayMs(null, 800_000), null)
  })

  test('does not settle a committed turn on audio completion alone', () => {
    assert.equal(
      realtimeCommitTranscriptSettled({
        commitAcknowledged: false,
        transcriptPersisted: false,
      }),
      false
    )
    assert.equal(
      realtimeCommitTranscriptSettled({
        commitAcknowledged: true,
        transcriptPersisted: false,
      }),
      false
    )
    assert.equal(
      realtimeCommitTranscriptSettled({
        commitAcknowledged: true,
        transcriptPersisted: true,
      }),
      true
    )
  })
})

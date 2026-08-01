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
  buildTurnBasedVoiceFrames,
  decodeTurnBasedVoiceServerEvent,
  downmixAndResampleVoiceAudio,
  encodeVoicePcmWav,
  finalVoiceTranscript,
  persistedVoiceMessage,
  selectVoiceRecorderMimeType,
  TALKWISE_TURN_BASED_VOICE_PROTOCOL,
  trainingTurnBasedVoiceWebSocketUrl,
  turnBasedVoiceProtocols,
  voiceServerError,
} from '../turn-based-voice-client'

describe('turn-based training voice client contract', () => {
  test('builds an authenticated same-origin room URL without identity inputs', () => {
    const url = trainingTurnBasedVoiceWebSocketUrl(
      '/api/talkwise/training',
      { roomId: '42', sessionId: 'session-1' },
      { host: 'talkwise.test', protocol: 'https:' }
    )

    assert.equal(
      url,
      'wss://talkwise.test/api/talkwise/conversations/rooms/42/voice?trainingSessionId=session-1'
    )
    assert.doesNotMatch(url, /user|team|token|authorization/i)
    assert.throws(() =>
      trainingTurnBasedVoiceWebSocketUrl(
        '/api/talkwise/training',
        { roomId: 'room-42', sessionId: 'session-1' },
        { host: 'talkwise.test', protocol: 'https:' }
      )
    )
    assert.throws(() =>
      trainingTurnBasedVoiceWebSocketUrl(
        'https://upstream.example/api/talkwise/training',
        { roomId: '42', sessionId: 'session-1' },
        { host: 'talkwise.test', protocol: 'https:' }
      )
    )
    assert.throws(() =>
      trainingTurnBasedVoiceWebSocketUrl(
        'http://talkwise.test/api/talkwise/training',
        { roomId: '42', sessionId: 'session-1' },
        { host: 'talkwise.test', protocol: 'https:' }
      )
    )
  })

  test('uses the ordinary voice protocol plus the dedicated bearer protocol', () => {
    assert.deepEqual(turnBasedVoiceProtocols('header.payload.signature'), [
      TALKWISE_TURN_BASED_VOICE_PROTOCOL,
      'talkwise.bearer.header.payload.signature',
    ])
    assert.equal(TALKWISE_TURN_BASED_VOICE_PROTOCOL, 'talkwise.voice')
    assert.throws(() => turnBasedVoiceProtocols('unsafe token'))
  })

  test('normalizes mixed audio to mono pcm wav at the target sample rate', () => {
    const samples = downmixAndResampleVoiceAudio(
      [new Float32Array([1, 1, -1, -1]), new Float32Array([0, 0, 0, 0])],
      32_000,
      16_000
    )
    assert.deepEqual([...samples], [0.5, -0.5])

    const wav = encodeVoicePcmWav(samples)
    const view = new DataView(wav)
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(
        ...Array.from({ length }, (_, index) => view.getUint8(offset + index))
      )
    assert.equal(ascii(0, 4), 'RIFF')
    assert.equal(ascii(8, 4), 'WAVE')
    assert.equal(view.getUint16(22, true), 1)
    assert.equal(view.getUint32(24, true), 16_000)
    assert.equal(view.getUint16(34, true), 16)
    assert.equal(view.getUint32(40, true), 4)
  })

  test('chunks wav bytes and finishes with bounded training metadata only', () => {
    const frames = buildTurnBasedVoiceFrames(
      Uint8Array.from([0, 1, 2, 3, 4]),
      2
    )
    assert.equal(frames.length, 4)
    assert.deepEqual(
      frames.slice(0, 3).map((frame) => frame.type),
      ['audio_chunk', 'audio_chunk', 'audio_chunk']
    )
    assert.deepEqual(frames.at(-1), {
      format: 'wav',
      metadata: {
        interactionMode: 'turn_based',
        media: {
          channels: 1,
          mimeType: 'audio/wav',
          sampleRate: 16_000,
        },
        modality: 'voice',
        source: 'voice_transcription',
        trainingMode: 'voice',
      },
      type: 'speech_end',
    })
    const serialized = JSON.stringify(frames)
    assert.doesNotMatch(serialized, /userId|teamId|accessToken|authorization/i)
    assert.throws(() => buildTurnBasedVoiceFrames(new Uint8Array()))
  })

  test('distinguishes recognized text from confirmed message persistence', () => {
    const transcription = decodeTurnBasedVoiceServerEvent(
      JSON.stringify({
        type: 'transcription',
        text: 'A spoken answer.',
        is_final: true,
      })
    )
    assert.ok(transcription)
    assert.equal(finalVoiceTranscript(transcription), 'A spoken answer.')
    assert.equal(persistedVoiceMessage(transcription), null)

    const persisted = decodeTurnBasedVoiceServerEvent(
      JSON.stringify({
        type: 'message_sent',
        message: { id: 12, content: 'A spoken answer.' },
      })
    )
    assert.ok(persisted)
    assert.deepEqual(persistedVoiceMessage(persisted), {
      content: 'A spoken answer.',
      id: 12,
    })
    assert.equal(
      persistedVoiceMessage({ type: 'message_sent', message: {} }),
      null
    )
  })

  test('parses structured failures without treating malformed data as events', () => {
    const event = decodeTurnBasedVoiceServerEvent(
      JSON.stringify({
        type: 'error',
        code: 'stt_timeout',
        message: 'Timed out',
        details: 'internal detail',
      })
    )
    assert.ok(event)
    assert.deepEqual(voiceServerError(event), {
      code: 'stt_timeout',
      message: 'Timed out',
    })
    assert.equal(decodeTurnBasedVoiceServerEvent('{'), null)
    assert.equal(decodeTurnBasedVoiceServerEvent(JSON.stringify([])), null)
  })

  test('selects a browser-supported recorder format with a safe fallback', () => {
    assert.equal(
      selectVoiceRecorderMimeType((mimeType) => mimeType === 'audio/mp4'),
      'audio/mp4'
    )
    assert.equal(
      selectVoiceRecorderMimeType(() => false),
      null
    )
  })
})

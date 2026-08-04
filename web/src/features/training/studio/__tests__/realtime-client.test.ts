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
  realtimeEventAudio,
  realtimeEventText,
  talkWiseBearerProtocol,
  trainingRealtimeWebSocketUrl,
} from '../realtime-client'

describe('training realtime client contract', () => {
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
})

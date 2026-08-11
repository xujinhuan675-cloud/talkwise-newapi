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
  LOW_LATENCY_REALTIME_REPLY_MODEL,
  normalizeTrainingRoomCompletionResult,
  normalizeTrainingRoomMessages,
  parseTrainingRoomSse,
  parseTrainingRoomVideoAnswer,
  trainingRoomAudioChunk,
  trainingRoomCompletionPath,
  trainingRoomMessageAudioPath,
  trainingRoomPath,
  trainingRoomReplyModel,
  trainingRoomStreamPath,
} from '../training-room-client'

describe('training room client', () => {
  test('moves legacy realtime roleplay off the slow reasoning model', () => {
    assert.equal(
      trainingRoomReplyModel('realtime', 'gpt-5.5'),
      LOW_LATENCY_REALTIME_REPLY_MODEL
    )
    assert.equal(
      trainingRoomReplyModel('turn_based', 'gpt-5.5'),
      'gpt-5.5'
    )
    assert.equal(
      trainingRoomReplyModel('realtime', 'custom-fast-model'),
      'custom-fast-model'
    )
  })

  test('builds same-origin room and stream paths from server bindings', () => {
    assert.equal(
      trainingRoomPath('room/7', 'session 9'),
      '/api/talkwise/conversations/rooms/room%2F7?trainingSessionId=session+9'
    )
    assert.equal(
      trainingRoomStreamPath('42', 'session-9'),
      '/api/talkwise/conversations/rooms/42/stream?trainingSessionId=session-9'
    )
    assert.throws(() => trainingRoomPath('', 'session-9'), /bound training/)
  })

  test('normalizes persisted messages and only accepts real emotion scores', () => {
    assert.deepEqual(
      normalizeTrainingRoomMessages({
        code: 0,
        data: {
          messages: [
            {
              id: 1,
              room_id: 42,
              sender_type: 'persona',
              sender_id: 'buyer',
              content: 'That addresses my concern.',
              emotion_score: 3,
              emotion_label: 'reassured',
              metadata: { source: 'reply' },
            },
            {
              id: 2,
              room_id: 42,
              sender_type: 'persona',
              sender_id: 'buyer',
              content: 'Invalid score remains absent.',
              emotion_score: 9,
            },
          ],
        },
      }),
      [
        {
          id: '1',
          roomId: '42',
          senderType: 'persona',
          senderId: 'buyer',
          content: 'That addresses my concern.',
          timestamp: null,
          emotionScore: 3,
          emotionLabel: 'reassured',
          metadata: { source: 'reply' },
          videoAnswer: null,
        },
        {
          id: '2',
          roomId: '42',
          senderType: 'persona',
          senderId: 'buyer',
          content: 'Invalid score remains absent.',
          timestamp: null,
          emotionScore: null,
          emotionLabel: null,
          metadata: {},
          videoAnswer: null,
        },
      ]
    )
  })

  test('extracts persisted video metadata without inventing analysis results', () => {
    const parsed = parseTrainingRoomVideoAnswer(
      `Recorded response.\n\n[video-answer]${JSON.stringify({
        url: '/api/v1/training-studio/video-answers/answer.webm',
        mimeType: 'video/webm',
        durationMs: 4100,
        size: 1234,
        recordedAt: '2026-08-01T00:00:00Z',
        trainingEvent: { cameraPresenceStatus: 'placeholder' },
      })}`
    )

    assert.deepEqual(parsed, {
      caption: 'Recorded response.',
      videoAnswer: {
        url: '/api/v1/training-studio/video-answers/answer.webm',
        mimeType: 'video/webm',
        durationMs: 4100,
        size: 1234,
        recordedAt: '2026-08-01T00:00:00Z',
      },
    })
    assert.equal(JSON.stringify(parsed).includes('cameraPresenceStatus'), false)
  })

  test('parses named SSE frames and preserves an incomplete tail', () => {
    const parsed = parseTrainingRoomSse(
      [
        ': heartbeat',
        '',
        'event: typing',
        'data: {"status":"start"}',
        '',
        'event: message',
        'data: {"id":7,"emotion_score":1}',
        '',
        'event: round_end',
      ].join('\n')
    )

    assert.deepEqual(parsed.events, [
      { type: 'typing', data: { status: 'start' } },
      { type: 'message', data: { id: 7, emotion_score: 1 } },
    ])
    assert.equal(parsed.remainder, 'event: round_end')
  })

  test('normalizes provider-neutral room audio output without credentials', () => {
    assert.deepEqual(
      trainingRoomAudioChunk({
        type: 'audio_chunk',
        data: {
          data: 'bXAzLWJ5dGVz',
          mime_type: 'audio/mpeg',
          persona_id: 'buyer',
          reply_id: 'reply-1',
          sentence_index: 2,
          provider: 'configured-provider',
        },
      }),
      {
        data: 'bXAzLWJ5dGVz',
        mimeType: 'audio/mpeg',
        personaId: 'buyer',
        replyId: 'reply-1',
        sentenceIndex: 2,
      }
    )
    assert.equal(
      trainingRoomAudioChunk({ type: 'audio_chunk', data: {} }),
      null
    )
  })

  test('exposes persisted replay audio and only allows voice-opening reconstruction', () => {
    const messages = normalizeTrainingRoomMessages({
      data: {
        messages: [
          {
            id: 7,
            room_id: 42,
            sender_type: 'persona',
            sender_id: 'buyer',
            content: 'Original voice reply.',
            metadata: {
              aiAudio: {
                available: true,
                original: true,
                segmentCount: 2,
                trainingMode: 'realtime_voice',
                segments: [{ assetId: 99 }],
              },
            },
          },
          {
            id: 8,
            room_id: 42,
            sender_type: 'persona',
            sender_id: 'buyer',
            content: 'Text reply.',
            metadata: {},
          },
          {
            id: 9,
            room_id: 42,
            sender_type: 'persona',
            sender_id: 'buyer',
            content: 'Text reply with invalid replay metadata.',
            metadata: {
              aiAudio: {
                available: true,
                original: true,
                segmentCount: 1,
                trainingMode: 'text',
              },
            },
          },
          {
            id: 10,
            room_id: 42,
            sender_type: 'persona',
            sender_id: 'buyer',
            content: 'Historical voice opening.',
            metadata: {
              eventKind: 'scenario_opening',
              trainingMode: 'voice',
            },
          },
          {
            id: 11,
            room_id: 42,
            sender_type: 'persona',
            sender_id: 'buyer',
            content: 'Recreated voice reply.',
            metadata: {
              aiAudio: {
                available: true,
                original: false,
                provenance: 'server_resynthesis',
                segmentCount: 1,
                trainingMode: 'voice',
              },
            },
          },
          {
            id: 12,
            room_id: 42,
            sender_type: 'persona',
            sender_id: 'buyer',
            content: 'Historical video opening without AI audio.',
            metadata: {
              eventKind: 'scenario_opening',
              trainingMode: 'video',
            },
          },
        ],
      },
    })

    assert.deepEqual(messages[0]?.audioReplay, {
      available: true,
      original: true,
      provenance: null,
      segmentCount: 2,
      trainingMode: 'realtime_voice',
    })
    assert.equal(messages[1]?.audioReplay, undefined)
    assert.equal(messages[2]?.audioReplay, undefined)
    assert.equal(messages[3]?.audioSynthesisAvailable, true)
    assert.deepEqual(messages[4]?.audioReplay, {
      available: true,
      original: false,
      provenance: 'server_resynthesis',
      segmentCount: 1,
      trainingMode: 'voice',
    })
    assert.equal(messages[5]?.audioReplay, undefined)
    assert.equal(messages[5]?.audioSynthesisAvailable, undefined)
    assert.equal(JSON.stringify(messages[0]?.audioReplay).includes('assetId'), false)
    assert.equal(
      trainingRoomMessageAudioPath('42', 'session 1', '7', 1),
      '/api/talkwise/conversations/rooms/42/messages/7/audio/1?trainingSessionId=session+1'
    )
  })

  test('normalizes a completed room session with a ready review', () => {
    const result = normalizeTrainingRoomCompletionResult(
      {
        data: {
          session_id: 'session-1',
          status: 'completed',
          report_id: 'report-1',
          task_config: {
            metadata: {
              completionReport: { status: 'ready', reportId: 'report-1' },
            },
          },
        },
      },
      'session-1',
      true
    )

    assert.equal(result?.reportId, 'report-1')
    assert.equal(result?.reportStatus, 'ready')
  })

  test('uses the same-origin training proxy when completing a room session', () => {
    assert.equal(
      trainingRoomCompletionPath('', 'session 1'),
      '/api/talkwise/training/sessions/session%201/complete'
    )
    assert.throws(() => trainingRoomCompletionPath('', ' '), /session id/)
  })

  test('marks direct room completion as review skipped', () => {
    const result = normalizeTrainingRoomCompletionResult(
      {
        data: {
          session_id: 'session-2',
          status: 'completed',
          task_config: { metadata: {} },
        },
      },
      'session-2',
      false
    )

    assert.equal(result?.reportStatus, 'skipped')
  })

  test('rejects a completion response for another session', () => {
    assert.equal(
      normalizeTrainingRoomCompletionResult(
        {
          data: {
            session_id: 'session-other',
            status: 'completed',
          },
        },
        'session-3',
        true
      ),
      null
    )
  })
})

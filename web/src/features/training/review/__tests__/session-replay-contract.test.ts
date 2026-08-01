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

import type { TrainingRoomMessage } from '../../studio/training-room-client'
import {
  buildReviewEmotionChart,
  isNumericReviewRoomId,
  reviewEmotionPoints,
  reviewReplayMessages,
  reviewVideoReplayUrl,
} from '../session-replay-contract'

function message(
  overrides: Partial<TrainingRoomMessage> = {}
): TrainingRoomMessage {
  return {
    content: 'Persisted message',
    emotionLabel: null,
    emotionScore: null,
    id: '1',
    metadata: {},
    roomId: '42',
    senderId: 'persona-finance',
    senderType: 'persona',
    timestamp: '2026-08-01T10:00:00Z',
    videoAnswer: null,
    ...overrides,
  }
}

describe('training review session replay contract', () => {
  test('keeps persisted room messages but excludes live guidance copies', () => {
    const messages = reviewReplayMessages([
      message({ id: 'room-1' }),
      message({
        id: 'guidance-1',
        metadata: { source: 'training_live_guidance' },
        senderType: 'system',
      }),
    ])

    assert.deepEqual(
      messages.map((item) => item.id),
      ['room-1']
    )
  })

  test('builds separate emotion series only from real persona scores', () => {
    const messages = [
      message({
        id: 'p1-1',
        emotionScore: -2,
        emotionLabel: 'Concerned',
        senderId: 'persona-finance',
      }),
      message({
        id: 'user-1',
        emotionScore: 5,
        senderId: 'newapi:7',
        senderType: 'user',
      }),
      message({
        id: 'p2-1',
        emotionScore: 1,
        emotionLabel: 'Open',
        senderId: 'persona-legal',
      }),
      message({
        id: 'p1-2',
        emotionScore: 3,
        emotionLabel: 'Supportive',
        senderId: 'persona-finance',
      }),
    ]

    const points = reviewEmotionPoints(messages)
    const chart = buildReviewEmotionChart(messages)

    assert.deepEqual(
      points.map((point) => [point.senderId, point.score, point.sequence]),
      [
        ['persona-finance', -2, 1],
        ['persona-legal', 1, 3],
        ['persona-finance', 3, 4],
      ]
    )
    assert.deepEqual(
      chart.series.map((series) => [series.dataKey, series.senderId]),
      [
        ['persona_1', 'persona-finance'],
        ['persona_2', 'persona-legal'],
      ]
    )
    assert.equal(chart.rows[0]?.persona_1, -2)
    assert.equal(chart.rows[1]?.persona_2, 1)
    assert.equal(chart.rows[2]?.persona_1, 3)
  })

  test('keeps the emotion state empty when no score was persisted', () => {
    assert.deepEqual(
      buildReviewEmotionChart([
        message({ emotionLabel: 'Interested', emotionScore: null }),
      ]),
      { rows: [], series: [] }
    )
  })

  test('accepts only positive integer legacy room references', () => {
    assert.equal(isNumericReviewRoomId('42'), true)
    assert.equal(isNumericReviewRoomId('message_tree:42'), false)
    assert.equal(isNumericReviewRoomId('0'), false)
    assert.equal(isNumericReviewRoomId('../42'), false)
  })

  test('accepts only same-origin replay URLs bound to the session and room', () => {
    const binding = { roomId: '42', sessionId: 'session-1' }
    const attachment = {
      durationMs: 1200,
      mimeType: 'video/webm',
      recordedAt: '2026-08-01T10:00:00Z',
      size: 128,
      url: '/api/talkwise/training/video-answers/answer.webm?training_session_id=session-1&room_id=42',
    }

    assert.equal(
      reviewVideoReplayUrl(attachment, binding),
      '/api/talkwise/training/video-answers/answer.webm?training_session_id=session-1&room_id=42'
    )
    assert.equal(
      reviewVideoReplayUrl(
        {
          ...attachment,
          url: attachment.url.replace(
            '/api/talkwise/training',
            '/api/v1/training-studio'
          ),
        },
        binding
      ),
      '/api/talkwise/training/video-answers/answer.webm?training_session_id=session-1&room_id=42'
    )
    assert.equal(
      reviewVideoReplayUrl(
        { ...attachment, url: 'https://example.com/answer.webm' },
        binding
      ),
      null
    )
    assert.equal(
      reviewVideoReplayUrl(
        {
          ...attachment,
          url: attachment.url.replace('room_id=42', 'room_id=9'),
        },
        binding
      ),
      null
    )
    assert.equal(
      reviewVideoReplayUrl(
        { ...attachment, url: `${attachment.url}&auth_role=admin` },
        binding
      ),
      null
    )
  })
})

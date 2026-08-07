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
import { test } from 'node:test'

import type { TrainingRoomMessage } from '../training-room-client'
import {
  trainingRoomConversationMessages,
  trainingRoomPlaygroundMessages,
} from '../training-room-message-adapter'

test('adapts persisted room messages to the shared Playground chat contract', () => {
  const messages: TrainingRoomMessage[] = [
    {
      content: 'Can you reduce the price?',
      emotionLabel: null,
      emotionScore: null,
      id: 'persona-1',
      metadata: {},
      roomId: 'room-1',
      senderId: 'persona-1',
      senderType: 'persona',
      timestamp: '2026-08-05T02:00:00.000Z',
      videoAnswer: null,
    },
    {
      content: '',
      emotionLabel: null,
      emotionScore: null,
      id: 'user-1',
      metadata: {},
      roomId: 'room-1',
      senderId: 'user-1',
      senderType: 'user',
      timestamp: null,
      videoAnswer: {
        durationMs: 1200,
        mimeType: 'video/webm',
        recordedAt: null,
        size: 128,
        url: null,
      },
    },
  ]

  const adapted = trainingRoomPlaygroundMessages(messages, (videoAnswer) =>
    videoAnswer ? 'Video answer submitted.' : 'No message content.'
  )

  assert.equal(adapted[0]?.from, 'assistant')
  assert.equal(adapted[0]?.createdAt, 1785895200000)
  assert.equal(adapted[1]?.from, 'user')
  assert.equal(adapted[1]?.versions[0]?.content, 'Video answer submitted.')
  assert.equal(adapted[1]?.status, 'complete')
})

test('projects room messages into the shared training insight contract', () => {
  const messages: TrainingRoomMessage[] = [
    {
      content: 'What is your budget?',
      emotionLabel: null,
      emotionScore: null,
      id: 'persona-2',
      metadata: {},
      roomId: 'room-2',
      senderId: 'persona-2',
      senderType: 'persona',
      timestamp: '2026-08-05T02:01:00.000Z',
      videoAnswer: null,
    },
    {
      content: 'We can start with a pilot.',
      emotionLabel: null,
      emotionScore: 2,
      id: 'user-2',
      metadata: { parent_message_id: 'persona-2' },
      roomId: 'room-2',
      senderId: 'user-2',
      senderType: 'user',
      timestamp: '2026-08-05T02:01:03.000Z',
      videoAnswer: null,
    },
  ]

  const adapted = trainingRoomConversationMessages(messages, () => 'fallback')

  assert.deepEqual(adapted, [
    {
      publicId: 'persona-2',
      role: 'assistant',
      content: 'What is your budget?',
      contentParts: [],
      metadata: {},
      emotionLabel: null,
      emotionScore: null,
      parentMessageId: null,
      branchId: null,
      createdAt: '2026-08-05T02:01:00.000Z',
    },
    {
      publicId: 'user-2',
      role: 'user',
      content: 'We can start with a pilot.',
      contentParts: [],
      metadata: { parent_message_id: 'persona-2' },
      emotionLabel: null,
      emotionScore: 2,
      parentMessageId: 'persona-2',
      branchId: null,
      createdAt: '2026-08-05T02:01:03.000Z',
    },
  ])
})

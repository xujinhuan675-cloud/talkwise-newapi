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
  normalizeTrainingConversationSessions,
  type TrainingSessionDTO,
} from '../api'

function sessionFixture(
  overrides: Partial<TrainingSessionDTO> = {}
): TrainingSessionDTO {
  return {
    session_id: 'session-1',
    task_config: {
      role: 'Account manager',
      difficulty: 'medium',
      category: 'sales',
      tech_stack: ['Renewal objection'],
      metadata: {},
    },
    mode: 'text',
    status: 'active',
    room_id: null,
    message_count: 1,
    ...overrides,
  }
}

describe('training conversation session normalization', () => {
  test('keeps text message trees and room-backed modes in one session list', () => {
    const sessions = normalizeTrainingConversationSessions([
      sessionFixture({
        room_id: 'talkwise-conversation:conversation-1',
        task_config: {
          role: 'Account manager',
          difficulty: 'medium',
          category: 'sales',
          tech_stack: ['Renewal objection'],
          metadata: { runtime: 'conversation_message_tree' },
        },
      }),
      sessionFixture({
        session_id: 'session-2',
        mode: 'voice',
        room_id: 'room-2',
        task_config: {
          role: 'Salesperson',
          difficulty: 'easy',
          category: 'sales',
          tech_stack: ['New customer consultation'],
          metadata: { feedbackMode: 'assisted' },
        },
      }),
      sessionFixture({
        session_id: 'session-3',
        mode: 'video',
        room_id: null,
      }),
    ])

    assert.equal(sessions.length, 2)
    assert.deepEqual(
      sessions.map(({ id, conversationId, roomId, mode }) => ({
        id,
        conversationId,
        roomId,
        mode,
      })),
      [
        {
          id: 'session-1',
          conversationId: 'conversation-1',
          roomId: null,
          mode: 'text',
        },
        {
          id: 'session-2',
          conversationId: null,
          roomId: 'room-2',
          mode: 'voice',
        },
      ]
    )
    assert.equal(sessions[1]?.feedbackMode, 'assisted')
  })

  test('restores realtime adapter metadata for an existing room', () => {
    const [session] = normalizeTrainingConversationSessions([
      sessionFixture({
        mode: 'realtime',
        room_id: 42,
        task_config: {
          role: 'Negotiator',
          difficulty: 'hard',
          category: 'negotiation',
          tech_stack: ['Contract negotiation'],
          metadata: {
            realtimeProfile: 'speech_to_speech',
            realtimeProvider: 'doubao',
          },
        },
      }),
    ])

    assert.equal(session?.roomId, '42')
    assert.equal(session?.realtimeProfile, 'speech_to_speech')
    assert.equal(session?.realtimeProvider, 'doubao')
  })
})

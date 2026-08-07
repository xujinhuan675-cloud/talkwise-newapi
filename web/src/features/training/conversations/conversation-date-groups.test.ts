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

import type { TrainingConversationSession } from './api'
import {
  groupTrainingConversationsByDate,
  trainingConversationDateGroup,
} from './conversation-date-groups'

const NOW = new Date(2026, 7, 6, 12)

function session(
  id: string,
  updatedAt: string | null
): TrainingConversationSession {
  return {
    id,
    conversationId: id,
    roomId: null,
    mode: 'text',
    feedbackMode: 'simulation',
    realtimeProfile: 'cascade',
    realtimeProvider: null,
    title: id,
    description: '',
    difficulty: 'medium',
    status: 'active',
    messageCount: 0,
    updatedAt,
    scenarioId: null,
    reportId: null,
    metadata: undefined,
  }
}

describe('training conversation date groups', () => {
  test('uses local calendar boundaries for the five LibreChat-style groups', () => {
    assert.equal(
      trainingConversationDateGroup(new Date(2026, 7, 6, 8).toISOString(), NOW),
      'today'
    )
    assert.equal(
      trainingConversationDateGroup(
        new Date(2026, 7, 5, 23, 59).toISOString(),
        NOW
      ),
      'yesterday'
    )
    assert.equal(
      trainingConversationDateGroup(new Date(2026, 7, 1).toISOString(), NOW),
      'previous7Days'
    )
    assert.equal(
      trainingConversationDateGroup(new Date(2026, 6, 15).toISOString(), NOW),
      'previous30Days'
    )
    assert.equal(
      trainingConversationDateGroup(new Date(2026, 5, 1).toISOString(), NOW),
      'older'
    )
  })

  test('keeps session order, omits empty groups, and treats missing dates as current', () => {
    const groups = groupTrainingConversationsByDate(
      [
        session('today-a', new Date(2026, 7, 6, 10).toISOString()),
        session('older', new Date(2026, 5, 1).toISOString()),
        session('today-b', null),
        session('week', new Date(2026, 7, 2).toISOString()),
      ],
      NOW
    )

    assert.deepEqual(
      groups.map((group) => ({
        key: group.key,
        sessions: group.sessions.map((item) => item.id),
      })),
      [
        { key: 'today', sessions: ['today-a', 'today-b'] },
        { key: 'previous7Days', sessions: ['week'] },
        { key: 'older', sessions: ['older'] },
      ]
    )
  })
})

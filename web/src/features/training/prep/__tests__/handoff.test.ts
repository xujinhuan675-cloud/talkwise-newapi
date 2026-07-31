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

import { trainingPrepWorkspaceHandoff } from '../handoff'

describe('training preparation workspace handoff', () => {
  test('maps a scoped backend start result to the native conversation workspace', () => {
    assert.deepEqual(
      trainingPrepWorkspaceHandoff({
        training_session_id: 'session-123',
        conversation_id: 42,
      }),
      {
        to: '/training/conversations',
        search: {
          session: 'session-123',
          conversation: '42',
        },
      }
    )
  })

  test('does not navigate when a start result lacks either protected resource id', () => {
    assert.equal(
      trainingPrepWorkspaceHandoff({ training_session_id: 'session-123' }),
      null
    )
    assert.equal(
      trainingPrepWorkspaceHandoff({ conversation_id: 'conversation-42' }),
      null
    )
    assert.equal(
      trainingPrepWorkspaceHandoff({
        training_session_id: ' ',
        conversation_id: 'conversation-42',
      }),
      null
    )
  })
})

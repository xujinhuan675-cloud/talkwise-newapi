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

import { trainingCompletionExitDestination } from './completion-navigation'

describe('training completion navigation', () => {
  test('returns to the scenario catalog after a direct completion', () => {
    assert.deepEqual(trainingCompletionExitDestination(false, ' session-1 '), {
      kind: 'catalog',
      to: '/training/scenarios',
    })
  })

  test('opens the completed session after requesting a review', () => {
    assert.deepEqual(trainingCompletionExitDestination(true, ' session-1 '), {
      kind: 'review',
      params: { sessionId: 'session-1' },
      to: '/training/sessions/$sessionId',
    })
  })

  test('rejects an empty completed session id', () => {
    assert.throws(
      () => trainingCompletionExitDestination(true, ' '),
      /completed training session id cannot be empty/
    )
  })
})

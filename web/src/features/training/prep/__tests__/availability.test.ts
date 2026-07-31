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
  BATTLE_PREP_AVAILABILITY,
  DEFENSE_PREP_AVAILABILITY,
} from '../availability'

describe('training preparation availability', () => {
  test('exposes battle preparation only through its scoped API contract', () => {
    assert.deepEqual(BATTLE_PREP_AVAILABILITY, {
      id: 'battle',
      state: 'available',
      contract:
        'scoped generation and start result with training_session_id and conversation_id',
    })
  })

  test('exposes defense preparation only through its scoped API contract', () => {
    assert.deepEqual(DEFENSE_PREP_AVAILABILITY, {
      id: 'defense',
      state: 'available',
      contract:
        'scoped document, reviewer, scenario, and start result with training_session_id and conversation_id',
    })
  })
})

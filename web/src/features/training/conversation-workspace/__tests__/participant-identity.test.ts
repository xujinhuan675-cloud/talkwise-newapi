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
  trainingCounterpartParticipant,
  trainingUserParticipant,
} from '../participant-identity'

describe('training message participant identity', () => {
  test('uses the scenario persona name and optional avatar', () => {
    assert.deepEqual(
      trainingCounterpartParticipant({
        title: 'Renewal objection',
        metadata: {
          scenario_training: {
            persona: {
              name: 'Lin Wei',
              avatarUrl: 'https://example.test/lin-wei.png',
            },
          },
        },
      }),
      {
        name: 'Lin Wei',
        avatarUrl: 'https://example.test/lin-wei.png',
      }
    )
  })

  test('falls back to stable session and user names without blank avatars', () => {
    assert.deepEqual(
      trainingCounterpartParticipant({ title: 'Price review' }),
      {
        name: 'Price review',
        avatarUrl: null,
      }
    )
    assert.deepEqual(
      trainingUserParticipant({ username: 'alex', display_name: 'Alex Chen' }),
      { name: 'Alex Chen', avatarUrl: null }
    )
    assert.deepEqual(trainingUserParticipant(null), {
      name: 'You',
      avatarUrl: null,
    })
  })
})

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
  resolveBattlePrepPlan,
  resolveTrainingPlan,
  trainingPlanMetadata,
} from './training-plan'

describe('training plan metadata', () => {
  test('normalizes focus and maps the selected length to a turn budget', () => {
    assert.deepEqual(
      trainingPlanMetadata({
        focusScope: 'custom',
        selectedFocus: ['Objection handling', 'Objection handling', ' '],
        pressure: 'hard',
        lengthProfile: 'quick',
      }),
      {
        version: 1,
        kind: 'conversation',
        focus: { scope: 'custom', selected: ['Objection handling'] },
        pressure: 'hard',
        length: { profile: 'quick', turnBudget: 6 },
        completion: { strategy: 'adaptive', explicitFinish: true },
      }
    )
  })

  test('reads current and snake-case plan metadata defensively', () => {
    assert.deepEqual(
      resolveTrainingPlan({
        training_plan: {
          kind: 'defense',
          focus: { scope: 'all', selected: ['Risk'] },
          length: { turn_budget: 12 },
        },
      }),
      {
        kind: 'defense',
        focusScope: 'all',
        selectedFocus: ['Risk'],
        turnBudget: 12,
      }
    )
    assert.equal(resolveTrainingPlan({ trainingPlan: {} }), null)
  })

  test('only exposes the briefing behavior for battle preparation sessions', () => {
    const metadata = {
      training_source: 'battle_prep',
      trainingPlan: trainingPlanMetadata({
        focusScope: 'recommended',
        selectedFocus: ['Close with a next step'],
        pressure: 'medium',
        lengthProfile: 'standard',
      }),
    }

    assert.equal(resolveBattlePrepPlan(metadata)?.turnBudget, 9)
    assert.equal(
      resolveBattlePrepPlan({
        ...metadata,
        training_source: 'scenario_training',
      }),
      null
    )
  })
})

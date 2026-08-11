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
  resolveTrainingProgress,
  resolveTrainingPlan,
  trainingProgressIsInputLocked,
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
        length: {
          profile: 'quick',
          turnBudget: 6,
          minimumTurns: 3,
          hardCapTurns: 8,
        },
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
        lengthProfile: null,
        turnBudget: 12,
        minimumTurns: 8,
        hardCapTurns: 16,
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

  test('prefers the server progress contract and keeps target length separate from hard cap', () => {
    const progress = resolveTrainingProgress({
      source: 'scenario_training',
      trainingPlan: trainingPlanMetadata({
        focusScope: 'all',
        selectedFocus: ['Explain the decision'],
        pressure: 'medium',
        lengthProfile: 'standard',
      }),
      training_progress: {
        status: 'ready_to_finish',
        learner_turn_count: 9,
        minimum_turns: 4,
        target_turns: 9,
        hardCap: 12,
        objectives: { covered_count: 2, total_count: 3 },
        evidence: { sufficient: true },
        completionReason: 'evidence_coverage',
      },
    })

    assert.deepEqual(progress, {
      state: 'ready_to_finish',
      source: 'server',
      learnerTurnCount: 9,
      minimumTurns: 4,
      targetTurns: 9,
      hardCapTurns: 12,
      coveredCount: 2,
      totalCount: 3,
      evidenceSufficient: true,
      reasonCodes: [],
      completionReason: 'evidence_coverage',
    })
    assert.equal(trainingProgressIsInputLocked(progress), false)
  })

  test('falls back to local answer count without claiming evidence or hard limit', () => {
    const progress = resolveTrainingProgress(
      {
        source: 'scenario_training',
        trainingPlan: trainingPlanMetadata({
          focusScope: 'recommended',
          selectedFocus: [],
          pressure: 'easy',
          lengthProfile: 'quick',
        }),
      },
      6
    )

    assert.equal(progress?.source, 'local')
    assert.equal(progress?.learnerTurnCount, 6)
    assert.equal(progress?.targetTurns, 6)
    assert.equal(progress?.hardCapTurns, null)
    assert.equal(progress?.evidenceSufficient, null)
    assert.equal(progress?.completionReason, null)
    assert.equal(trainingProgressIsInputLocked(progress), false)
  })

  test('shows battle preparation progress without replacing its target length', () => {
    const progress = resolveTrainingProgress(
      {
        training_source: 'battle_prep',
        trainingPlan: trainingPlanMetadata({
          focusScope: 'recommended',
          selectedFocus: [],
          pressure: 'medium',
          lengthProfile: 'standard',
        }),
      },
      3
    )

    assert.equal(progress?.source, 'local')
    assert.equal(progress?.learnerTurnCount, 3)
    assert.equal(progress?.targetTurns, 9)
    assert.equal(progress?.hardCapTurns, null)
  })

  test('locks input only for authoritative terminal progress states', () => {
    const progress = resolveTrainingProgress({
      source: 'scenario_training',
      trainingProgress: {
        state: 'hard_limit_reached',
        learnerTurnCount: 8,
        targetTurns: 6,
        hardCapTurns: 8,
        reasonCodes: ['hard_cap'],
      },
    })

    assert.equal(progress?.source, 'server')
    assert.equal(progress?.completionReason, null)
    assert.deepEqual(progress?.reasonCodes, ['hard_cap'])
    assert.equal(trainingProgressIsInputLocked(progress), true)
  })
})

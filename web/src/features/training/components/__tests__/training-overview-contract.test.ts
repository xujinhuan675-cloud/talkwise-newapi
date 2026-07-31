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

import type { ScenarioProgress } from '../../review/types'
import type { TrainingScenario } from '../../scenarios/types'
import {
  selectTrainingOverviewRecommendation,
  trainingOverviewRecommendationReason,
} from '../training-overview-contract'

const scenario = (id: string, overrides: Partial<TrainingScenario> = {}) =>
  ({
    id,
    title: id,
    description: `${id} description`,
    customerProfile: 'Buyer',
    difficulty: 'medium',
    category: 'sales',
    required: false,
    openingLine: 'Hello',
    persona: { name: 'Buyer', role: 'Decision maker', style: 'Direct' },
    learnerRole: 'Account manager',
    framework: 'prep',
    trainingPoints: ['Discovery'],
    dimensionWeights: [],
    ...overrides,
  }) satisfies TrainingScenario

const progress = (
  scenarioId: string,
  overrides: Partial<ScenarioProgress> = {}
) =>
  ({
    scenarioId,
    sessionId: `${scenarioId}-session`,
    status: 'completed',
    score: null,
    scoreStatus: 'pending',
    overallScore: null,
    lastPracticedAt: null,
    reportId: null,
    failureReason: null,
    ...overrides,
  }) satisfies ScenarioProgress

describe('training overview recommendation contract', () => {
  test('continues an in-progress scenario before other recommendations', () => {
    const recommendation = selectTrainingOverviewRecommendation(
      [
        scenario('required', { required: true }),
        scenario('active'),
        scenario('retry'),
      ],
      [
        progress('active', { status: 'in_progress' }),
        progress('retry', { status: 'failed' }),
      ]
    )

    assert.equal(recommendation?.scenario.id, 'active')
    assert.equal(recommendation?.reason, 'in_progress')
  })

  test('uses real scenario progress to prioritize required, new, retry, and low-score work', () => {
    assert.equal(
      trainingOverviewRecommendationReason(
        scenario('required', { required: true }),
        null
      ),
      'required'
    )
    assert.equal(
      trainingOverviewRecommendationReason(scenario('new'), null),
      'not_started'
    )
    assert.equal(
      trainingOverviewRecommendationReason(
        scenario('retry'),
        progress('retry', { status: 'failed' })
      ),
      'failed'
    )
    assert.equal(
      trainingOverviewRecommendationReason(
        scenario('score'),
        progress('score', { score: 72, scoreStatus: 'ready' })
      ),
      'score_below_target'
    )
  })

  test('selects the latest server record when duplicate scenario progress is returned', () => {
    const recommendation = selectTrainingOverviewRecommendation(
      [scenario('renewal')],
      [
        progress('renewal', {
          status: 'completed',
          lastPracticedAt: '2026-07-01T00:00:00Z',
        }),
        progress('renewal', {
          status: 'failed',
          lastPracticedAt: '2026-07-02T00:00:00Z',
        }),
      ]
    )

    assert.equal(recommendation?.reason, 'failed')
  })
})

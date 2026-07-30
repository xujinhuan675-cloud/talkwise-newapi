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

import { normalizeTrainingScenarioConfig, trainingConfigApiUrl } from '../api'

describe('training scenario configuration contract', () => {
  test('uses the authenticated same-origin training proxy by default', () => {
    assert.equal(
      trainingConfigApiUrl(''),
      '/api/talkwise/training/scenario-config'
    )
    assert.equal(
      trainingConfigApiUrl('https://talkwise.example/api/v1/training-studio/'),
      'https://talkwise.example/api/v1/training-studio/scenario-config'
    )
  })

  test('normalizes backend aliases without losing scenario or rubric semantics', () => {
    const state = normalizeTrainingScenarioConfig({
      version: 1,
      dimensions: [
        {
          id: 'substance',
          name: 'Substance',
          description: 'Use concrete evidence.',
          enabled: true,
          source: 'default',
          updated_at: '2026-07-30T00:00:00.000Z',
        },
      ],
      scenarios: [
        {
          id: 'renewal-objection',
          title: 'Renewal objection',
          customer_profile: 'Procurement lead',
          difficulty: 'hard',
          category: 'negotiation',
          opening_line: 'Your price is too high.',
          learner_role: 'Account manager',
          training_points: ['Clarify the objection'],
          dimension_weights: [{ dimension_id: 'substance', weight: 100 }],
          persona: { name: 'Lin Wei', role: 'Buyer', style: 'Direct' },
        },
      ],
      selected_scenario_id: 'renewal-objection',
      selected_dimension_id: 'substance',
      updated_at: '2026-07-30T00:00:00.000Z',
    })

    assert.equal(state.selectedScenarioId, 'renewal-objection')
    assert.equal(state.selectedDimensionId, 'substance')
    assert.equal(state.scenarios[0]?.customerProfile, 'Procurement lead')
    assert.equal(state.scenarios[0]?.openingLine, 'Your price is too high.')
    assert.deepEqual(state.scenarios[0]?.dimensionWeights, [
      { dimensionId: 'substance', weight: 100 },
    ])
    assert.equal(state.dimensions[0]?.updatedAt, '2026-07-30T00:00:00.000Z')
  })

  test('falls back to a valid selected item when backend selection is stale', () => {
    const state = normalizeTrainingScenarioConfig({
      dimensions: [{ id: 'structure', name: 'Structure' }],
      scenarios: [
        {
          id: 'candidate-intro',
          title: 'Candidate introduction',
          dimensionWeights: [{ dimensionId: 'structure', weight: 100 }],
        },
      ],
      selectedScenarioId: 'missing-scenario',
      selectedDimensionId: 'missing-dimension',
    })

    assert.equal(state.selectedScenarioId, 'candidate-intro')
    assert.equal(state.selectedDimensionId, 'structure')
  })
})

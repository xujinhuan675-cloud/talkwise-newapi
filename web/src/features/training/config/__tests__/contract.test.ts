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
  normalizeTrainingRubricDefaults,
  normalizeTrainingScenarioConfig,
  trainingConfigApiUrl,
  trainingRubricDefaultsApiUrl,
} from '../api'
import {
  canManageTrainingScenarioConfig,
  rubricDefaultsForConfiguredDimensions,
} from '../contract'

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

  test('uses the backend rubric contract and maps customer service to its workplace rubric', () => {
    assert.equal(
      trainingRubricDefaultsApiUrl('', 'sales'),
      '/api/talkwise/training/rubrics/default?category=sales'
    )
    assert.equal(
      trainingRubricDefaultsApiUrl('', 'customer_service'),
      '/api/talkwise/training/rubrics/default?category=workplace'
    )
    assert.doesNotMatch(
      trainingRubricDefaultsApiUrl('', 'negotiation'),
      /user|team|role|token/i
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

  test('keeps the backend product-management category instead of coercing it to sales', () => {
    const state = normalizeTrainingScenarioConfig({
      dimensions: [{ id: 'structure', name: 'Structure' }],
      scenarios: [
        {
          id: 'prd-review',
          title: 'PRD review',
          category: 'product_management',
          dimensionWeights: [{ dimensionId: 'structure', weight: 100 }],
        },
      ],
    })

    assert.equal(state.scenarios[0]?.category, 'product_management')
  })

  test('normalizes backend rubric ratios to persisted percentage weights', () => {
    const defaults = normalizeTrainingRubricDefaults({
      version: 'interview-five-dimension-v1',
      category: 'sales',
      weights: {
        substance: 0.25,
        structure: 0.15,
        relevance: 0.25,
        credibility: 0.2,
        differentiation: 0.15,
      },
    })

    assert.equal(defaults.sourceCategory, 'sales')
    assert.deepEqual(defaults.dimensionWeights, [
      { dimensionId: 'substance', weight: 25 },
      { dimensionId: 'structure', weight: 15 },
      { dimensionId: 'relevance', weight: 25 },
      { dimensionId: 'credibility', weight: 20 },
      { dimensionId: 'differentiation', weight: 15 },
    ])
  })

  test('only grants writes to roles that the host maps to backend administrators', () => {
    assert.equal(canManageTrainingScenarioConfig({ isAdmin: true }), true)
    assert.equal(canManageTrainingScenarioConfig({ isAdmin: false }), false)
  })

  test('does not apply incomplete backend defaults to hidden dimensions', () => {
    const defaults = normalizeTrainingRubricDefaults({
      version: 'v1',
      category: 'sales',
      weights: { substance: 0.6, structure: 0.4 },
    })
    const dimensions = [
      {
        id: 'substance',
        name: 'Substance',
        description: '',
        enabled: true,
        source: 'default' as const,
        updatedAt: '',
      },
    ]

    assert.throws(
      () => rubricDefaultsForConfiguredDimensions(defaults, dimensions),
      /do not match/
    )
  })
})

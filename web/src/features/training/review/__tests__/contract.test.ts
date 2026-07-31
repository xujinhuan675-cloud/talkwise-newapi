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
  mergeReviewSessionScores,
  sortByLatestPractice,
  toReviewSession,
  toScenarioProgress,
  toScenarioProgressSummary,
  toTrainingCompetencyRadar,
  trainingReviewApiUrl,
} from '../api'

describe('training review contract', () => {
  test('uses the same-origin training proxy for session and report reads', () => {
    assert.equal(
      trainingReviewApiUrl('', '/sessions?limit=100'),
      '/api/talkwise/training/sessions?limit=100'
    )
    assert.equal(
      trainingReviewApiUrl(
        'https://talkwise.example/api/v1/training-studio/',
        '/scenario-progress?limit=100'
      ),
      'https://talkwise.example/api/v1/training-studio/scenario-progress?limit=100'
    )
  })

  test('preserves the server session configuration without client identity fields', () => {
    const session = toReviewSession({
      session_id: 'session-1',
      task_config: {
        role: 'Account manager',
        level: 'senior',
        tech_stack: ['Renewal objection', 'Procurement conversation'],
        difficulty: 'hard',
        category: 'negotiation',
        metadata: {
          scenario_training: { id: 'renewal', title: 'Renewal objection' },
        },
      },
      mode: 'voice',
      scenario_template_id: 'renewal',
      status: 'completed',
      message_count: 12,
    })

    assert.equal(session.title, 'Renewal objection')
    assert.equal(session.scenarioId, 'renewal')
    assert.equal(session.score, null)
    assert.equal(session.role, 'Account manager')
  })

  test('joins scores only to their matching training session', () => {
    const sessions = [
      {
        id: 'session-1',
        scenarioId: 'renewal',
        title: 'Renewal objection',
        description: null,
        role: 'Account manager',
        category: 'negotiation',
        difficulty: 'hard',
        mode: 'text' as const,
        status: 'completed' as const,
        messageCount: 4,
        startedAt: null,
        completedAt: null,
        reportId: null,
        failureReason: null,
        score: null,
        scoreStatus: 'pending' as const,
      },
      {
        id: 'session-2',
        scenarioId: 'renewal',
        title: 'Renewal retry',
        description: null,
        role: 'Account manager',
        category: 'negotiation',
        difficulty: 'hard',
        mode: 'text' as const,
        status: 'completed' as const,
        messageCount: 5,
        startedAt: null,
        completedAt: null,
        reportId: null,
        failureReason: null,
        score: null,
        scoreStatus: 'pending' as const,
      },
    ]
    const progress = [
      toScenarioProgress({
        scenario_id: 'renewal',
        training_session_id: 'session-2',
        status: 'completed',
        score: 87.4,
        score_status: 'ready',
      }),
    ]

    assert.deepEqual(
      mergeReviewSessionScores(sessions, progress).map(
        (session) => session.score
      ),
      [null, 87]
    )
  })

  test('sorts scenario progress by real practice timestamps', () => {
    const progress = sortByLatestPractice([
      {
        scenarioId: 'older',
        sessionId: 'session-1',
        status: 'completed' as const,
        score: null,
        scoreStatus: 'pending' as const,
        overallScore: null,
        lastPracticedAt: '2026-07-01T00:00:00Z',
        reportId: null,
        failureReason: null,
      },
      {
        scenarioId: 'newer',
        sessionId: 'session-2',
        status: 'completed' as const,
        score: null,
        scoreStatus: 'pending' as const,
        overallScore: null,
        lastPracticedAt: '2026-07-02T00:00:00Z',
        reportId: null,
        failureReason: null,
      },
    ])

    assert.deepEqual(
      progress.map((item) => item.scenarioId),
      ['newer', 'older']
    )
  })

  test('normalizes a server-computed scenario progress summary', () => {
    assert.deepEqual(
      toScenarioProgressSummary({
        tracked_scenarios: 8,
        completed_scenarios: 5,
        scored_scenarios: 4,
        average_score: 82.6,
        completion_percentage: 62.5,
      }),
      {
        trackedScenarios: 8,
        completedScenarios: 5,
        scoredScenarios: 4,
        averageScore: 83,
        completionPercentage: 63,
      }
    )
  })

  test('keeps only valid scored competency dimensions for the radar', () => {
    assert.deepEqual(
      toTrainingCompetencyRadar({
        sample_size: 4,
        dimensions: [
          {
            dimension_id: 'active_listening',
            score: 84.2,
            sample_count: 4,
          },
          {
            dimension_id: 'invalid',
            score: Number.NaN,
            sample_count: 4,
          },
        ],
      }),
      {
        sampleSize: 4,
        dimensions: [
          {
            dimensionId: 'active_listening',
            score: 84,
            sampleCount: 4,
          },
        ],
      }
    )
  })
})

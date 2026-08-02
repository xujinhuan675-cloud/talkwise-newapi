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
  buildTrainingGrowthSummary,
  getTrainingGrowthProfileState,
  getTrainingGrowthScoreState,
  selectRecentTrainingActivity,
} from '../contract'

describe('training growth contract', () => {
  test('uses only completed, ready score records for progress summaries', () => {
    const summary = buildTrainingGrowthSummary([
      {
        scenarioId: 'renewal',
        sessionId: 'session-1',
        status: 'completed',
        score: 80,
        scoreStatus: 'ready',
        outcomeRating: 4,
        lastPracticedAt: '2026-07-30T09:00:00Z',
        reportId: 'report-1',
        failureReason: null,
      },
      {
        scenarioId: 'discovery',
        sessionId: 'session-2',
        status: 'in_progress',
        score: null,
        scoreStatus: 'pending',
        outcomeRating: null,
        lastPracticedAt: '2026-07-29T09:00:00Z',
        reportId: null,
        failureReason: null,
      },
    ])

    assert.deepEqual(summary, {
      trackedScenarios: 2,
      completedScenarios: 1,
      scoredScenarios: 1,
      averageScore: 80,
      completionPercentage: 50,
    })
  })

  test('keeps pending and failed score states explicit', () => {
    const baseProgress = {
      scenarioId: 'renewal',
      sessionId: 'session-1',
      outcomeRating: null,
      lastPracticedAt: '2026-07-30T09:00:00Z',
      reportId: null,
    }

    assert.equal(
      getTrainingGrowthScoreState({
        ...baseProgress,
        status: 'completed',
        score: null,
        scoreStatus: 'pending',
        failureReason: null,
      }),
      'pending'
    )
    assert.equal(
      getTrainingGrowthScoreState({
        ...baseProgress,
        status: 'failed',
        score: 80,
        scoreStatus: 'ready',
        failureReason: 'Evaluation failed',
      }),
      'failed'
    )
    assert.equal(
      getTrainingGrowthScoreState({
        ...baseProgress,
        status: 'in_progress',
        score: null,
        scoreStatus: 'pending',
        failureReason: null,
      }),
      'not_available'
    )
    assert.equal(
      getTrainingGrowthScoreState({
        ...baseProgress,
        status: 'completed',
        score: null,
        scoreStatus: 'unavailable',
        failureReason: null,
      }),
      'not_available'
    )
  })

  test('builds a profile only from real server competency samples', () => {
    assert.equal(getTrainingGrowthProfileState(undefined), 'empty')
    assert.equal(
      getTrainingGrowthProfileState({
        sampleSize: 1,
        dimensions: [
          {
            dimensionId: 'attentiveness',
            score: 80,
            sampleCount: 1,
            scenarioCount: 1,
            state: 'exploring',
          },
          {
            dimensionId: 'expression',
            score: 75,
            sampleCount: 1,
            scenarioCount: 1,
            state: 'exploring',
          },
        ],
      }),
      'ready'
    )
    assert.equal(
      getTrainingGrowthProfileState({
        sampleSize: 2,
        dimensions: [
          {
            dimensionId: 'attentiveness',
            score: 80,
            sampleCount: 2,
            scenarioCount: 2,
            state: 'stable',
          },
          {
            dimensionId: 'expression',
            score: 75,
            sampleCount: 2,
            scenarioCount: 2,
            state: 'stable',
          },
          {
            dimensionId: 'coordination',
            score: 70,
            sampleCount: 2,
            scenarioCount: 2,
            state: 'stable',
          },
        ],
      }),
      'ready'
    )
  })

  test('orders the training timeline by persisted activity without inventing dates', () => {
    const base = {
      scenarioId: null,
      title: 'Practice',
      description: null,
      role: 'Counterpart',
      category: 'practice',
      difficulty: 'medium',
      mode: 'text' as const,
      trainingSource: null,
      messageCount: 2,
      roomId: null,
      reportId: null,
      reportState: {
        status: 'not_requested' as const,
        generation: null,
        message: null,
        completedWithoutReport: false,
      },
      evaluationState: null,
      failureReason: null,
      score: null,
      scoreStatus: 'pending' as const,
      progressLinked: false,
      taskMetadata: null,
    }
    const sessions = [
      {
        ...base,
        id: 'undated',
        status: 'created' as const,
        startedAt: null,
        completedAt: null,
      },
      {
        ...base,
        id: 'latest',
        status: 'completed' as const,
        startedAt: '2026-07-31T08:00:00Z',
        completedAt: '2026-08-01T08:00:00Z',
      },
      {
        ...base,
        id: 'failed',
        status: 'failed' as const,
        startedAt: '2026-07-30T08:00:00Z',
        completedAt: null,
      },
    ]

    assert.deepEqual(
      selectRecentTrainingActivity(sessions, 2).map((session) => session.id),
      ['latest', 'failed']
    )
    assert.equal(selectRecentTrainingActivity(sessions, 20)[2].id, 'undated')
  })
})

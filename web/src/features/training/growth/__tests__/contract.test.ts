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

import { buildTrainingGrowthSummary } from '../contract'

describe('training growth contract', () => {
  test('uses only completed, ready score records for progress summaries', () => {
    const summary = buildTrainingGrowthSummary([
      {
        scenarioId: 'renewal',
        sessionId: 'session-1',
        status: 'completed',
        score: 80,
        scoreStatus: 'ready',
        overallScore: 4,
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
        overallScore: null,
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
})

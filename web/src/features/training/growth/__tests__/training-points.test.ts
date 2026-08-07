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
import { afterEach, test } from 'node:test'

import { api } from '@/lib/http-client'

import {
  getTrainingPointsSummary,
  normalizeTrainingPointsSummary,
  trainingPointsSummaryUrl,
} from '../training-points'

const originalAdapter = api.defaults.adapter

afterEach(() => {
  api.defaults.adapter = originalAdapter
})

test('builds the persisted growth summary URL from the host training API base', () => {
  assert.equal(
    trainingPointsSummaryUrl('/api/talkwise/training/'),
    '/api/talkwise/training/growth/summary'
  )
  assert.equal(
    trainingPointsSummaryUrl('  '),
    '/api/talkwise/training/growth/summary'
  )
})

test('normalizes the Training Points ledger without deriving points in the browser', () => {
  assert.deepEqual(
    normalizeTrainingPointsSummary({
      unit: 'TP',
      unit_name: 'Training Points',
      total_points: 600,
      level: 2,
      level_title: 'Practitioner',
      current_level_points: 500,
      next_level_points: 1500,
      level_progress_percentage: 10,
      completed_sessions: 6,
      career_path: [
        {
          id: 'foundation',
          stage_number: 1,
          title: 'Workplace foundations',
          status: 'completed',
          required_scenario_ids: [
            'new-customer-discount',
            'recruiter-sales-interview',
          ],
          completed_scenario_count: 2,
          required_scenario_count: 2,
          focus_ids: ['attentiveness', 'expression'],
          recommended_scenario_ids: [],
        },
        {
          id: 'collaboration',
          stage_number: 2,
          title: 'Collaborative communication',
          status: 'current',
          required_scenario_ids: [
            'enterprise-demo-objection',
            'project-scope-creep-boundary',
          ],
          completed_scenario_count: 1,
          required_scenario_count: 2,
          focus_ids: ['expression', 'coordination'],
          recommended_scenario_ids: ['project-scope-creep-boundary'],
        },
        {
          id: 'upward-management',
          stage_number: 3,
          title: 'Upward management',
          status: 'locked',
          required_scenario_ids: [
            'daily-upward-results-report',
            'budget-freeze-expansion',
          ],
          completed_scenario_count: 0,
          required_scenario_count: 2,
          focus_ids: ['attentiveness', 'expression', 'coordination'],
          recommended_scenario_ids: [
            'daily-upward-results-report',
            'budget-freeze-expansion',
          ],
        },
      ],
      recent_events: [
        {
          id: 7,
          event_type: 'session_completed',
          points: 100,
          source_type: 'training_session',
          source_id: 'session-7',
          created_at: '2026-08-01T09:00:00Z',
        },
      ],
    }),
    {
      unit: 'TP',
      unitName: 'Training Points',
      totalPoints: 600,
      level: 2,
      levelTitle: 'Practitioner',
      currentLevelPoints: 500,
      nextLevelPoints: 1500,
      levelProgressPercentage: 10,
      completedSessions: 6,
      careerPath: [
        {
          id: 'foundation',
          stageNumber: 1,
          title: 'Workplace foundations',
          status: 'completed',
          requiredScenarioIds: [
            'new-customer-discount',
            'recruiter-sales-interview',
          ],
          completedScenarioCount: 2,
          requiredScenarioCount: 2,
          focusIds: ['attentiveness', 'expression'],
          recommendedScenarioIds: [],
        },
        {
          id: 'collaboration',
          stageNumber: 2,
          title: 'Collaborative communication',
          status: 'current',
          requiredScenarioIds: [
            'enterprise-demo-objection',
            'project-scope-creep-boundary',
          ],
          completedScenarioCount: 1,
          requiredScenarioCount: 2,
          focusIds: ['expression', 'coordination'],
          recommendedScenarioIds: ['project-scope-creep-boundary'],
        },
        {
          id: 'upward-management',
          stageNumber: 3,
          title: 'Upward management',
          status: 'locked',
          requiredScenarioIds: [
            'daily-upward-results-report',
            'budget-freeze-expansion',
          ],
          completedScenarioCount: 0,
          requiredScenarioCount: 2,
          focusIds: ['attentiveness', 'expression', 'coordination'],
          recommendedScenarioIds: [
            'daily-upward-results-report',
            'budget-freeze-expansion',
          ],
        },
      ],
      recentEvents: [
        {
          id: 7,
          eventType: 'session_completed',
          points: 100,
          sourceType: 'training_session',
          sourceId: 'session-7',
          createdAt: '2026-08-01T09:00:00Z',
        },
      ],
    }
  )
})

test('loads Training Points through the authenticated host training base', async () => {
  api.defaults.adapter = async (config) => {
    assert.equal(config.method, 'get')
    assert.equal(config.url, '/api/talkwise/training/growth/summary')
    return {
      data: {
        code: 0,
        message: '',
        data: {
          unit: 'TP',
          unit_name: 'Training Points',
          total_points: 100,
          level: 1,
          level_title: 'Foundation',
          current_level_points: 0,
          next_level_points: 500,
          level_progress_percentage: 20,
          completed_sessions: 1,
          career_path: [
            {
              id: 'foundation',
              stage_number: 1,
              title: 'Workplace foundations',
              status: 'current',
              required_scenario_ids: [
                'new-customer-discount',
                'recruiter-sales-interview',
              ],
              completed_scenario_count: 0,
              required_scenario_count: 2,
              focus_ids: ['attentiveness', 'expression'],
              recommended_scenario_ids: [
                'new-customer-discount',
                'recruiter-sales-interview',
              ],
            },
          ],
          recent_events: [],
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  const summary = await getTrainingPointsSummary('/api/talkwise/training')
  assert.equal(summary.totalPoints, 100)
  assert.equal(summary.levelProgressPercentage, 20)
  assert.equal(summary.careerPath[0]?.status, 'current')
})

test('does not invent a career path when an older backend omits the contract', () => {
  const summary = normalizeTrainingPointsSummary({
    unit: 'TP',
    unit_name: 'Training Points',
    total_points: 0,
    level: 1,
    level_title: 'Foundation',
    current_level_points: 0,
    next_level_points: 500,
    level_progress_percentage: 0,
    completed_sessions: 0,
    recent_events: [],
  })

  assert.deepEqual(summary.careerPath, [])
})

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
import test from 'node:test'

import {
  teamMemberDisplayId,
  toTeamCompetencyRanking,
  toTeamScenarioRanking,
} from './api'

test('strips the internal member namespace only for display', () => {
  assert.equal(teamMemberDisplayId('newapi:1'), '1')
  assert.equal(teamMemberDisplayId('1'), '1')
  assert.equal(teamMemberDisplayId('newapi:'), 'newapi:')
})

test('normalizes scoped team analytics records without accepting malformed IDs', () => {
  assert.deepEqual(
    toTeamCompetencyRanking({
      member_id: 'user-sales',
      member_name: 'Sales lead',
      rank: 1,
      average_score: 82.4,
      sample_count: 3,
      dimensions: [
        { dimension_id: 'persuasion', score: 83, sample_count: 3 },
        { dimension_id: '', score: 80, sample_count: 1 },
      ],
    }),
    {
      memberId: 'user-sales',
      memberName: 'Sales lead',
      rank: 1,
      averageScore: 82,
      sampleCount: 3,
      dimensions: [{ dimensionId: 'persuasion', score: 83, sampleCount: 3 }],
    }
  )
  assert.equal(
    toTeamScenarioRanking({
      scenario_id: '',
      member_id: 'user-sales',
      member_name: null,
      rank: 1,
      completed_sessions: 1,
      scored_sessions: 1,
      average_score: 80,
      last_practiced_at: null,
    }),
    null
  )
})

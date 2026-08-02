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

import axios from 'axios'

import { api } from '@/lib/http-client'

import {
  teamMemberDisplayId,
  addTrainingTeamMember,
  createTrainingTeam,
  isTrainingTeamAssignmentRequired,
  isTrainingTeamQueryLoading,
  listTrainingTeamMembers,
  listTrainingTeams,
  removeTrainingTeamMember,
  retryTrainingTeamQuery,
  searchTrainingTeamUsers,
  toTeamCompetencyRanking,
  toTeamScenarioRanking,
  toTrainingTeam,
  toTrainingTeamMember,
} from './api'

const originalAdapter = api.defaults.adapter

afterEach(() => {
  api.defaults.adapter = originalAdapter
})

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
      sample_count: 3,
      dimensions: [
        {
          dimension_id: 'attentiveness',
          score: 83,
          sample_count: 3,
          scenario_count: 2,
          state: 'stable',
        },
        {
          dimension_id: '',
          score: 80,
          sample_count: 1,
          scenario_count: 1,
          state: 'exploring',
        },
      ],
    }),
    {
      memberId: 'user-sales',
      memberName: 'Sales lead',
      sampleCount: 3,
      dimensions: [
        {
          dimensionId: 'attentiveness',
          score: 83,
          sampleCount: 3,
          scenarioCount: 2,
          state: 'stable',
        },
      ],
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

test('recognizes only the stable missing training-team assignment error', () => {
  const assignmentError = new axios.AxiosError('Request failed')
  assignmentError.response = {
    data: {
      code: 40000,
      message: 'Team analytics is unavailable without a team assignment',
      data: null,
      error: {
        details: {
          status_code: 422,
          detail: {
            code: 'TRAINING_TEAM_ASSIGNMENT_REQUIRED',
            message: 'Team analytics is unavailable without a team assignment',
          },
        },
      },
    },
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: {},
    config: { headers: new axios.AxiosHeaders() },
  }
  const otherError = new axios.AxiosError('Request failed')
  otherError.response = {
    ...assignmentError.response,
    data: { detail: 'Team analytics request failed' },
  }

  assert.equal(isTrainingTeamAssignmentRequired(assignmentError), true)
  assert.equal(isTrainingTeamAssignmentRequired(otherError), false)
  assert.equal(isTrainingTeamAssignmentRequired(new Error('offline')), false)
})

test('does not retry deterministic training-team client errors', () => {
  const clientError = new axios.AxiosError('Request failed')
  clientError.response = {
    data: {},
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: {},
    config: { headers: new axios.AxiosHeaders() },
  }
  const serverError = new axios.AxiosError('Request failed')
  serverError.response = {
    ...clientError.response,
    status: 503,
    statusText: 'Service Unavailable',
  }

  assert.equal(retryTrainingTeamQuery(0, clientError), false)
  assert.equal(retryTrainingTeamQuery(0, serverError), true)
  assert.equal(retryTrainingTeamQuery(1, new Error('offline')), true)
  assert.equal(retryTrainingTeamQuery(2, new Error('offline')), false)
})

test('shows a skeleton only while an enabled team query is awaiting data', () => {
  assert.equal(isTrainingTeamQueryLoading(true, true, false), true)
  assert.equal(isTrainingTeamQueryLoading(false, true, false), false)
  assert.equal(isTrainingTeamQueryLoading(true, true, true), false)
  assert.equal(isTrainingTeamQueryLoading(true, false, false), false)
})

test('keeps training membership separate from the gateway group', () => {
  assert.deepEqual(
    toTrainingTeam({
      id: 'training-team-sales',
      name: 'Sales coaching',
      created_time: 100,
      updated_time: 200,
    }),
    {
      id: 'training-team-sales',
      name: 'Sales coaching',
      createdTime: 100,
      updatedTime: 200,
    }
  )
  assert.deepEqual(
    toTrainingTeamMember({
      user_id: 7,
      username: 'alex',
      display_name: 'Alex',
      email: 'alex@example.com',
      platform_role: 1,
      status: 1,
      gateway_group: 'paid',
      team_role: 'admin',
      membership_team_id: 'training-team-sales',
      membership_team_name: 'Sales coaching',
    }),
    {
      userId: 7,
      username: 'alex',
      displayName: 'Alex',
      email: 'alex@example.com',
      platformRole: 1,
      status: 1,
      gatewayGroup: 'paid',
      teamRole: 'admin',
      membershipTeamId: 'training-team-sales',
      membershipTeamName: 'Sales coaching',
    }
  )
})

test('uses the admin training-team API without writing gateway user fields', async () => {
  api.defaults.adapter = async (config) => {
    if (config.method === 'get') {
      assert.equal(config.url, '/api/talkwise/admin/teams')
      assert.deepEqual(config.params, { start_index: 0, limit: 200 })
      return {
        data: {
          success: true,
          message: '',
          data: {
            teams: [
              {
                id: 'training-team-sales',
                name: 'Sales coaching',
                created_time: 100,
                updated_time: 100,
              },
            ],
            total: 1,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/api/talkwise/admin/teams')
    assert.deepEqual(JSON.parse(config.data as string), {
      name: 'Sales coaching',
    })
    return {
      data: {
        success: true,
        message: '',
        data: {
          id: 'training-team-sales',
          name: 'Sales coaching',
          created_time: 100,
          updated_time: 100,
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }
  }

  assert.equal((await listTrainingTeams()).items[0].id, 'training-team-sales')
  assert.equal(
    (await createTrainingTeam(' Sales coaching ')).name,
    'Sales coaching'
  )
})

test('lists, searches, adds, and removes independent training memberships', async () => {
  const member = {
    user_id: 7,
    username: 'alex',
    display_name: 'Alex',
    email: 'alex@example.com',
    platform_role: 1,
    status: 1,
    gateway_group: 'paid',
    team_role: 'member',
    membership_team_id: 'training-team-sales',
    membership_team_name: 'Sales coaching',
  }
  const base = '/api/talkwise/admin/teams/training-team-sales'
  api.defaults.adapter = async (config) => {
    let data: unknown
    if (config.method === 'get' && config.url === `${base}/members`) {
      data = {
        success: true,
        message: '',
        data: { members: [member], total: 1 },
      }
    } else if (
      config.method === 'get' &&
      config.url === `${base}/users/search`
    ) {
      assert.equal(config.params.keyword, 'alex')
      data = { success: true, message: '', data: { users: [member], total: 1 } }
    } else if (config.method === 'post' && config.url === `${base}/members`) {
      assert.deepEqual(JSON.parse(config.data as string), {
        user_id: 7,
        role: 'member',
      })
      data = { success: true, message: '', data: member }
    } else {
      assert.equal(config.method, 'delete')
      assert.equal(config.url, `${base}/members/7`)
      data = { success: true, message: '', data: { user_id: 7 } }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }

  assert.equal(
    (await listTrainingTeamMembers('training-team-sales')).items[0].userId,
    7
  )
  assert.equal(
    (await searchTrainingTeamUsers('training-team-sales', ' alex ')).total,
    1
  )
  assert.equal(
    (await addTrainingTeamMember('training-team-sales', 7, 'member'))
      .gatewayGroup,
    'paid'
  )
  await removeTrainingTeamMember('training-team-sales', 7)
})

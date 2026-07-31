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

import type { AuthUser } from '@/stores/auth-store'

import {
  resolveTrainingLegacySectionDestination,
  TRAINING_DIRECT_ROUTE_PATHS,
  TRAINING_LEGACY_SECTION_DESTINATIONS,
  TRAINING_SIDEBAR_ITEM,
  TRAINING_SIDEBAR_MODULE,
} from '../../section-registry'
import {
  createTrainingHostValue,
  hasAuthenticatedTrainingHost,
  normalizeTrainingApiBase,
  resolveTrainingHostRole,
} from '../contract'

const user: AuthUser = {
  id: 42,
  username: 'coach',
  display_name: ' Coach ',
  email: ' coach@example.com ',
  group: 'sales',
  role: 1,
}

describe('TrainingHostContext contract', () => {
  test('maps authenticated host state without promoting group to team', () => {
    const value = createTrainingHostValue({
      bootstrapState: 'complete',
      user,
      locale: 'zhCN',
      theme: 'dark',
      apiBase: ' https://talkwise.example/api/ ',
      demoSiteEnabled: true,
      displayTokenStatEnabled: false,
    })

    assert.equal(value.authStatus, 'authenticated')
    assert.equal(hasAuthenticatedTrainingHost(value), true)
    assert.deepEqual(value.user, {
      id: 42,
      username: 'coach',
      displayName: 'Coach',
      email: 'coach@example.com',
      group: 'sales',
    })
    assert.equal(value.team, null)
    assert.equal(value.locale, 'zh-CN')
    assert.equal(value.theme, 'dark')
    assert.equal(value.apiBase, 'https://talkwise.example/api')
    assert.deepEqual(value.featureFlags, {
      demoSite: true,
      displayTokenStats: false,
    })
  })

  test('preserves a team only when a verified host adapter supplies it', () => {
    const team = { id: 'newapi:sales', name: 'sales' }
    const value = createTrainingHostValue({
      bootstrapState: 'complete',
      user,
      team,
      theme: 'light',
    })

    assert.equal(value.team, team)
  })

  test('distinguishes loading from a completed anonymous bootstrap', () => {
    const loading = createTrainingHostValue({
      bootstrapState: 'checking',
      user: null,
      theme: 'light',
    })
    const anonymous = createTrainingHostValue({
      bootstrapState: 'complete',
      user: null,
      team: { id: 'unverified', name: 'Should not leak' },
      theme: 'light',
    })

    assert.equal(loading.authStatus, 'loading')
    assert.equal(anonymous.authStatus, 'anonymous')
    assert.equal(anonymous.role.kind, 'anonymous')
    assert.equal(anonymous.team, null)
    assert.equal(hasAuthenticatedTrainingHost(anonymous), false)
  })

  test('maps native NewAPI role values without changing their source value', () => {
    assert.deepEqual(resolveTrainingHostRole({ ...user, role: 100 }), {
      kind: 'super_admin',
      sourceValue: 100,
      isAdmin: true,
      isSuperAdmin: true,
    })
    assert.deepEqual(resolveTrainingHostRole({ ...user, role: 10 }), {
      kind: 'admin',
      sourceValue: 10,
      isAdmin: true,
      isSuperAdmin: false,
    })
    assert.equal(resolveTrainingHostRole({ ...user, role: 2 }).kind, 'user')
    assert.equal(resolveTrainingHostRole({ ...user, role: 0 }).kind, 'guest')
  })

  test('normalizes same-origin and trailing-slash API bases', () => {
    assert.equal(normalizeTrainingApiBase(undefined), '')
    assert.equal(normalizeTrainingApiBase('/'), '')
    assert.equal(normalizeTrainingApiBase('/talkwise///'), '/talkwise')
  })

  test('keeps every direct route under the authenticated training module', () => {
    assert.equal(TRAINING_SIDEBAR_MODULE, 'training')
    assert.equal(TRAINING_SIDEBAR_ITEM, 'studio')
    assert.deepEqual(TRAINING_DIRECT_ROUTE_PATHS, [
      '/training',
      '/training/scenarios',
      '/training/studio',
      '/training/live-coach',
      '/training/conversations',
      '/training/personas',
      '/training/personas/new',
      '/training/personas/:personaId',
      '/training/sessions',
      '/training/growth',
      '/training/growth/leaderboard',
      '/training/team/competencies',
      '/training/team/scenarios',
      '/training/prep/battle',
      '/training/prep/defense',
      '/training/settings',
    ])
    assert.equal(
      TRAINING_DIRECT_ROUTE_PATHS.every((path) => path.startsWith('/training')),
      true
    )
  })

  test('resolves the preserved legacy training sections to direct routes', () => {
    for (const [section, destination] of Object.entries(
      TRAINING_LEGACY_SECTION_DESTINATIONS
    )) {
      assert.equal(
        resolveTrainingLegacySectionDestination(section),
        destination
      )
    }
    assert.equal(resolveTrainingLegacySectionDestination('retired'), null)
  })
})

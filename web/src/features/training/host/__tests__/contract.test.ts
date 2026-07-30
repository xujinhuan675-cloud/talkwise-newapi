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
  createTrainingHostValue,
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
      theme: 'light',
    })

    assert.equal(loading.authStatus, 'loading')
    assert.equal(anonymous.authStatus, 'anonymous')
    assert.equal(anonymous.role.kind, 'anonymous')
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
})

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
  USER_ROLE,
  canManagePlatformRoles,
  getPlatformRole,
} from '../constants'
import { getAssignableManagementPermissions } from '../lib/management-permissions'
import { getUserActionMessageDetails } from '../lib/user-actions'

describe('platform role presentation', () => {
  test('maps persisted user roles to explicit platform role labels', () => {
    assert.equal(getPlatformRole(USER_ROLE.USER)?.labelKey, 'Regular user')
    assert.equal(getPlatformRole(USER_ROLE.ADMIN)?.labelKey, 'Platform admin')
    assert.equal(getPlatformRole(USER_ROLE.ROOT)?.labelKey, 'Platform owner')
  })

  test('does not present an unknown persisted role as a platform role', () => {
    assert.equal(getPlatformRole(99), undefined)
  })
})

describe('platform role actions', () => {
  test('only permits the platform owner to change platform roles', () => {
    assert.equal(canManagePlatformRoles(USER_ROLE.USER), false)
    assert.equal(canManagePlatformRoles(USER_ROLE.ADMIN), false)
    assert.equal(canManagePlatformRoles(USER_ROLE.ROOT), true)
    assert.equal(canManagePlatformRoles(), false)
  })

  test('uses explicit platform-admin success messages', () => {
    assert.deepEqual(getUserActionMessageDetails('promote'), {
      english: 'User set as platform admin successfully',
      chinese: '已设为平台管理员',
    })
    assert.deepEqual(getUserActionMessageDetails('demote'), {
      english: 'Platform admin access removed successfully',
      chinese: '已取消平台管理员权限',
    })
  })
})

describe('management permission registry', () => {
  test('gives the platform owner platform and team administration actions', () => {
    assert.deepEqual(
      getAssignableManagementPermissions(USER_ROLE.ROOT, USER_ROLE.USER).map(
        (permission) => permission.id
      ),
      ['platform-admin', 'training-team-admin']
    )
  })

  test('lets platform admins assign team scope without changing platform roles', () => {
    assert.deepEqual(
      getAssignableManagementPermissions(USER_ROLE.ADMIN, USER_ROLE.USER).map(
        (permission) => permission.id
      ),
      ['training-team-admin']
    )
  })

  test('does not add redundant team scope to platform operators', () => {
    assert.deepEqual(
      getAssignableManagementPermissions(USER_ROLE.ROOT, USER_ROLE.ADMIN).map(
        (permission) => permission.id
      ),
      ['platform-admin']
    )
  })
})

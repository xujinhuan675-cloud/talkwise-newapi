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

import type { NavGroup } from '@/components/layout/types'
import { ROLE } from '@/lib/roles'
import type { AuthUser } from '@/stores/auth-store'

import { filterSidebarGroupsByRole } from '../use-sidebar-view'

const groups: NavGroup[] = [
  {
    id: 'training',
    title: 'Training',
    items: [
      { title: 'Overview', url: '/training' },
      {
        title: 'Growth',
        items: [
          { title: 'My growth', url: '/training/growth' },
          {
            title: 'Training teams',
            url: '/training/team/members',
            requiredRole: ROLE.ADMIN,
          },
        ],
      },
    ],
  },
  {
    id: 'team-management',
    title: 'Team management',
    requiredTeamManagement: true,
    items: [{ title: 'Training teams', url: '/training/team/members' }],
  },
  {
    id: 'platform-management',
    title: 'Platform management',
    requiredRole: ROLE.ADMIN,
    items: [
      { title: 'Users', url: '/users', requiredRole: ROLE.ADMIN },
      {
        title: 'System settings',
        url: '/system-settings/site',
        requiredRole: ROLE.SUPER_ADMIN,
      },
    ],
  },
]

test('hides nested admin-only training entries from ordinary users', () => {
  const filtered = filterSidebarGroupsByRole(groups, ROLE.USER)
  assert.equal(
    filtered.some((group) => group.id === 'platform-management'),
    false
  )
  const growth = filtered[0].items[1]
  assert.equal('items' in growth && growth.items?.length, 1)
  assert.equal('items' in growth && growth.items?.[0].url, '/training/growth')
})

test('keeps the management console but hides root settings from platform admins', () => {
  const filtered = filterSidebarGroupsByRole(groups, ROLE.ADMIN)
  const growth = filtered[0].items[1]
  assert.equal('items' in growth && growth.items?.length, 2)
  const platform = filtered.find((group) => group.id === 'platform-management')
  assert.equal(platform?.items.length, 1)
  assert.equal(platform?.items[0]?.url, '/users')
})

test('shows platform settings to the platform owner', () => {
  const filtered = filterSidebarGroupsByRole(groups, ROLE.SUPER_ADMIN)
  const platform = filtered.find((group) => group.id === 'platform-management')
  assert.equal(platform?.items.length, 2)
})

test('shows team management to a team administrator without platform access', () => {
  const user: AuthUser = {
    id: 7,
    username: 'team-admin',
    role: ROLE.USER,
    team_role: 'admin',
  }
  const filtered = filterSidebarGroupsByRole(groups, ROLE.USER, user)

  assert.equal(
    filtered.some((group) => group.id === 'team-management'),
    true
  )
  assert.equal(
    filtered.some((group) => group.id === 'platform-management'),
    false
  )
})

test('hides team management from a regular team member', () => {
  const user: AuthUser = {
    id: 8,
    username: 'team-member',
    role: ROLE.USER,
    team_role: 'member',
  }
  const filtered = filterSidebarGroupsByRole(groups, ROLE.USER, user)

  assert.equal(
    filtered.some((group) => group.id === 'team-management'),
    false
  )
})

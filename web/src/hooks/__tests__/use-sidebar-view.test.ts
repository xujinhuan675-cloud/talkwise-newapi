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
    id: 'admin',
    title: 'Admin',
    items: [{ title: 'Users', url: '/users', requiredRole: ROLE.ADMIN }],
  },
]

test('hides nested admin-only training entries from ordinary users', () => {
  const filtered = filterSidebarGroupsByRole(groups, ROLE.USER)
  assert.equal(
    filtered.some((group) => group.id === 'admin'),
    false
  )
  const growth = filtered[0].items[1]
  assert.equal('items' in growth && growth.items?.length, 1)
  assert.equal('items' in growth && growth.items?.[0].url, '/training/growth')
})

test('keeps nested training administration entries for administrators', () => {
  const filtered = filterSidebarGroupsByRole(groups, ROLE.ADMIN)
  const growth = filtered[0].items[1]
  assert.equal('items' in growth && growth.items?.length, 2)
  assert.equal(
    filtered.some((group) => group.id === 'admin'),
    true
  )
})

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

import type { TFunction } from 'i18next'

import { getPlatformManagementNavGroups } from '../config/platform-management.config'
import { resolveSidebarView } from './sidebar-view-registry'

test('opens the platform-management view for NewAPI console routes', () => {
  for (const path of [
    '/dashboard/overview',
    '/usage-logs/common',
    '/users',
    '/system-info',
  ]) {
    assert.equal(resolveSidebarView(path)?.id, 'platform-management', path)
  }
})

test('keeps system settings as its deeper contextual view', () => {
  assert.equal(
    resolveSidebarView('/system-settings/site')?.id,
    'system-settings'
  )
})

test('keeps training routes in the root product navigation', () => {
  assert.equal(resolveSidebarView('/training/growth'), null)
})

test('places users under the operations group', () => {
  const groups = getPlatformManagementNavGroups(
    ((key: string) => key) as TFunction
  )
  assert.deepEqual(
    groups
      .find((group) => group.id === 'operations')
      ?.items.map((item) => ('url' in item ? item.url : undefined)),
    [
      '/dashboard/overview',
      '/dashboard/models',
      '/users',
      '/usage-logs/common',
      '/usage-logs/task',
      undefined,
    ]
  )
  assert.equal(
    groups
      .find((group) => group.id === 'system')
      ?.items.some((item) => 'url' in item && item.url === '/users'),
    false
  )
})

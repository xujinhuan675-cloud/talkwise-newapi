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
  parseHeaderNavModules as parseSettingsHeaderNavModules,
  parseSidebarModulesAdmin,
  SIDEBAR_MODULES_DEFAULT,
} from '@/features/system-settings/maintenance/config'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'

import { isSidebarRouteEnabled } from './use-sidebar-config'
import { buildTopNavLinks } from './use-top-nav-links'

const translate = (key: string) => key

describe('navigation settings integration', () => {
  test('builds the top navigation from every HeaderNavModules switch', () => {
    const modules = parseHeaderNavModulesFromStatus({
      HeaderNavModules: JSON.stringify({
        home: false,
        console: false,
        training: true,
        conversations: true,
        review: true,
        growth: true,
        pricing: { enabled: false, requireAuth: false },
        rankings: { enabled: true, requireAuth: true },
        docs: false,
        about: false,
      }),
    })

    const links = buildTopNavLinks({
      modules,
      docsLink: 'https://docs.example.com',
      isAuthenticated: false,
      translate,
    })

    assert.deepEqual(
      links.map(({ href, requiresAuth }) => ({ href, requiresAuth })),
      [
        { href: '/training', requiresAuth: true },
        { href: '/training/conversations', requiresAuth: true },
        { href: '/training/sessions', requiresAuth: true },
        { href: '/training/growth', requiresAuth: true },
        { href: '/rankings', requiresAuth: true },
      ]
    )
  })

  test('keeps enabled public modules public for authenticated users', () => {
    const modules = parseHeaderNavModulesFromStatus({
      HeaderNavModules: JSON.stringify({
        home: true,
        console: true,
        training: false,
        pricing: { enabled: true, requireAuth: true },
        rankings: { enabled: true, requireAuth: false },
        docs: true,
        about: true,
      }),
    })

    const links = buildTopNavLinks({
      modules,
      docsLink: 'https://docs.example.com',
      isAuthenticated: true,
      translate,
    })

    assert.deepEqual(
      links.map(({ href, requiresAuth, external }) => ({
        href,
        requiresAuth,
        external,
      })),
      [
        { href: '/', requiresAuth: undefined, external: undefined },
        { href: '/dashboard', requiresAuth: false, external: undefined },
        { href: '/pricing', requiresAuth: false, external: undefined },
        { href: '/rankings', requiresAuth: false, external: undefined },
        {
          href: 'https://docs.example.com',
          requiresAuth: undefined,
          external: true,
        },
        { href: '/about', requiresAuth: undefined, external: undefined },
      ]
    )
  })

  test('applies independent SidebarModulesAdmin route switches', () => {
    const adminConfig = parseSidebarModulesAdmin(
      JSON.stringify({
        ...SIDEBAR_MODULES_DEFAULT,
        training: {
          ...SIDEBAR_MODULES_DEFAULT.training,
          enabled: true,
          conversations: false,
          review: false,
        },
        personal: { enabled: true, topup: true, personal: true },
      })
    )

    assert.equal(
      isSidebarRouteEnabled('/training/assist', adminConfig),
      true
    )
    assert.equal(
      isSidebarRouteEnabled('/training/conversations', adminConfig),
      false
    )
    assert.equal(isSidebarRouteEnabled('/training/sessions', adminConfig), false)
    assert.equal(isSidebarRouteEnabled('/wallet', adminConfig), true)
  })

  test('migrates the legacy training switches to per-route settings', () => {
    const adminConfig = parseSidebarModulesAdmin(
      JSON.stringify({ training: { enabled: true, studio: false } })
    )

    assert.equal(isSidebarRouteEnabled('/training', adminConfig), false)
    assert.equal(
      isSidebarRouteEnabled('/training/conversations', adminConfig),
      false
    )
    assert.equal(isSidebarRouteEnabled('/training/sessions', adminConfig), false)
  })

  test('keeps settings and runtime header parsers aligned', () => {
    const serialized = JSON.stringify({
      home: true,
      training: true,
      conversations: false,
      review: true,
      growth: false,
      console: false,
    })
    const settingsConfig = parseSettingsHeaderNavModules(serialized)
    const runtimeConfig = parseHeaderNavModulesFromStatus({
      HeaderNavModules: serialized,
    })

    assert.deepEqual(
      {
        training: settingsConfig.training,
        conversations: settingsConfig.conversations,
        review: settingsConfig.review,
        growth: settingsConfig.growth,
      },
      {
        training: runtimeConfig.training,
        conversations: runtimeConfig.conversations,
        review: runtimeConfig.review,
        growth: runtimeConfig.growth,
      }
    )
  })
})

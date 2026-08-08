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

import type { SidebarModulesAdminConfig } from '@/features/system-settings/maintenance/config'

import { isSidebarRouteEnabled } from './use-sidebar-config'

const trainingModules = {
  overview: '/training',
  scenarios: '/training/scenarios',
  conversations: '/training/conversations',
  assist: '/training/assist',
  review: '/training/sessions',
  growth: '/training/growth',
  personas: '/training/personas',
  settings: '/training/settings',
  teamScenarios: '/training/team/scenarios',
  teamCompetencies: '/training/team/competencies',
  teamMembers: '/training/team/members',
} as const

function createConfig(
  enabledModule?: keyof typeof trainingModules,
  sectionEnabled = true
): SidebarModulesAdminConfig {
  return {
    training: {
      enabled: sectionEnabled,
      ...Object.fromEntries(
        Object.keys(trainingModules).map((module) => [
          module,
          module === enabledModule,
        ])
      ),
    },
  }
}

describe('sidebar administrator route visibility', () => {
  test('maps each training route to its own administrator module switch', () => {
    for (const [module, route] of Object.entries(trainingModules)) {
      const config = createConfig(module as keyof typeof trainingModules)

      assert.equal(isSidebarRouteEnabled(route, config), true)
      for (const otherRoute of Object.values(trainingModules)) {
        assert.equal(
          isSidebarRouteEnabled(otherRoute, config),
          otherRoute === route
        )
      }
    }
  })

  test('section switch disables every training route', () => {
    const config = createConfig('overview', false)

    assert.equal(isSidebarRouteEnabled('/training', config), false)
  })

  test('keeps routes without an administrator mapping visible', () => {
    assert.equal(isSidebarRouteEnabled('/future-module', createConfig()), true)
  })
})

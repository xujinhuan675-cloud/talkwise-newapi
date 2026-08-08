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
import { useMemo } from 'react'

import type { NavGroup, NavItem } from '@/components/layout/types'
import {
  parseSidebarModulesAdmin,
  type SidebarModulesAdminConfig,
} from '@/features/system-settings/maintenance/config'
import { useStatus } from '@/hooks/use-status'

/** Mapping from sidebar routes to platform administrator configuration keys. */
const URL_TO_CONFIG_MAP: Record<string, { section: string; module: string }> = {
  '/playground': { section: 'chat', module: 'playground' },
  '/training': { section: 'training', module: 'overview' },
  '/training/overview': { section: 'training', module: 'overview' },
  '/training/scenarios': { section: 'training', module: 'scenarios' },
  '/training/studio': { section: 'training', module: 'scenarios' },
  '/training/prep/battle': { section: 'training', module: 'scenarios' },
  '/training/prep/defense': { section: 'training', module: 'scenarios' },
  '/training/conversations': {
    section: 'training',
    module: 'conversations',
  },
  '/training/assist': { section: 'training', module: 'assist' },
  '/training/live-coach': { section: 'training', module: 'assist' },
  '/training/sessions': { section: 'training', module: 'review' },
  '/training/growth': { section: 'training', module: 'growth' },
  '/training/growth/leaderboard': { section: 'training', module: 'growth' },
  '/training/personas': { section: 'training', module: 'personas' },
  '/training/personas/new': { section: 'training', module: 'personas' },
  '/training/settings': { section: 'training', module: 'settings' },
  '/training/team/scenarios': {
    section: 'training',
    module: 'teamScenarios',
  },
  '/training/team/competencies': {
    section: 'training',
    module: 'teamCompetencies',
  },
  '/training/team/members': {
    section: 'training',
    module: 'teamMembers',
  },
  '/dashboard': { section: 'admin', module: 'overview' },
  '/dashboard/overview': { section: 'admin', module: 'overview' },
  '/dashboard/models': { section: 'admin', module: 'analytics' },
  '/dashboard/flow': { section: 'admin', module: 'analytics' },
  '/dashboard/users': { section: 'admin', module: 'analytics' },
  '/keys': { section: 'admin', module: 'key' },
  '/usage-logs': { section: 'admin', module: 'log' },
  '/usage-logs/common': { section: 'admin', module: 'log' },
  '/usage-logs/drawing': { section: 'admin', module: 'task' },
  '/usage-logs/task': { section: 'admin', module: 'task' },
  '/wallet': { section: 'personal', module: 'topup' },
  '/profile': { section: 'personal', module: 'personal' },
  '/channels': { section: 'admin', module: 'channel' },
  '/models': { section: 'admin', module: 'models' },
  '/models/metadata': { section: 'admin', module: 'models' },
  '/models/deployments': { section: 'admin', module: 'models' },
  '/users': { section: 'admin', module: 'user' },
  '/redemption-codes': { section: 'admin', module: 'redemption' },
  '/subscriptions': { section: 'admin', module: 'subscription' },
  '/system-settings': { section: 'admin', module: 'setting' },
  '/system-settings/site': { section: 'admin', module: 'setting' },
}

function parseSidebarConfig(
  value: string | null | undefined
): SidebarModulesAdminConfig {
  return parseSidebarModulesAdmin(value)
}

/** Check whether the platform administrator enabled a sidebar route. */
export function isSidebarRouteEnabled(
  url: string,
  adminConfig: SidebarModulesAdminConfig
): boolean {
  const mapping = URL_TO_CONFIG_MAP[url]
  if (!mapping) {
    return true
  }

  const { section, module } = mapping
  const adminSection = adminConfig[section]
  return Boolean(
    adminSection && adminSection.enabled && adminSection[module] === true
  )
}

function isNavItemVisible(
  item: NavItem,
  adminConfig: SidebarModulesAdminConfig
): boolean {
  if ('url' in item && item.url) {
    const configUrls = item.configUrls ?? [item.url]
    return configUrls.some((url) =>
      isSidebarRouteEnabled(url as string, adminConfig)
    )
  }

  if ('items' in item && item.items) {
    return item.items.some((subItem) =>
      isSidebarRouteEnabled(subItem.url as string, adminConfig)
    )
  }

  return true
}

function filterNavItems(
  items: NavItem[],
  adminConfig: SidebarModulesAdminConfig
): NavItem[] {
  return items
    .map((item) => {
      if ('items' in item && item.items) {
        return {
          ...item,
          items: item.items.filter((subItem) =>
            isSidebarRouteEnabled(subItem.url as string, adminConfig)
          ),
        }
      }
      return item
    })
    .filter((item) => isNavItemVisible(item, adminConfig))
}

/**
 * Apply the platform administrator's global sidebar visibility configuration.
 * Role and team permissions are applied by the layout after this global gate.
 */
export function useSidebarConfig(navGroups: NavGroup[]): NavGroup[] {
  const { status } = useStatus()
  const adminConfig = useMemo(
    () =>
      parseSidebarConfig(
        status?.SidebarModulesAdmin as string | null | undefined
      ),
    [status?.SidebarModulesAdmin]
  )

  return useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: filterNavItems(group.items, adminConfig),
        }))
        .filter((group) => group.items.length > 0),
    [navGroups, adminConfig]
  )
}

/** Check one route against the platform administrator sidebar setting. */
export function useIsSidebarModuleVisible(url: string): boolean {
  const { status } = useStatus()
  const adminConfig = parseSidebarConfig(
    status?.SidebarModulesAdmin as string | null | undefined
  )

  return isSidebarRouteEnabled(url, adminConfig)
}

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
import { useLocation } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { resolveSidebarView } from '@/components/layout/lib/sidebar-view-registry'
import type {
  NavGroup,
  NavItem,
  ResolvedSidebarView,
} from '@/components/layout/types'
import { ROLE } from '@/lib/roles'
import { isTrainingTeamManager } from '@/lib/training-team-permissions'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import { useSidebarConfig } from './use-sidebar-config'
import { useSidebarData } from './use-sidebar-data'

/** Sentinel key used for the root navigation in animation `key=` props */
const ROOT_VIEW_KEY = '__root'

export function filterSidebarGroupsByRole(
  groups: NavGroup[],
  role: number,
  user?: AuthUser | null
): NavGroup[] {
  return groups
    .filter((group) => {
      if (group.requiredRole !== undefined && role < group.requiredRole) {
        return false
      }
      if (group.requiredTeamManagement && !isTrainingTeamManager(user)) {
        return false
      }
      return true
    })
    .flatMap((group) => {
      const items: NavItem[] = []
      for (const item of group.items) {
        if (
          (item.requiredRole !== undefined && role < item.requiredRole) ||
          (item.requiredTeamManagement && !isTrainingTeamManager(user))
        ) {
          continue
        }
        if (!('items' in item) || !item.items) {
          items.push(item)
          continue
        }
        const allowedChildren = item.items.filter(
          (child) =>
            (child.requiredRole === undefined || role >= child.requiredRole) &&
            (!child.requiredTeamManagement || isTrainingTeamManager(user))
        )
        if (allowedChildren.length) {
          items.push({ ...item, items: allowedChildren })
        }
      }
      return items.length ? [{ ...group, items }] : []
    })
}

/**
 * Resolve the active sidebar view for the current location.
 *
 * - Returns the matching nested {@link SidebarView} (with its nav
 *   groups) when the URL belongs to a registered drill-in workspace.
 * Root and contextual views share platform-role, training-team and
 * sidebar-module filtering. Route guards remain authoritative for direct URL
 * access.
 */
export function useSidebarView(): ResolvedSidebarView {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (l) => l.pathname })
  const user = useAuthStore((s) => s.auth.user)
  const rootSidebarData = useSidebarData()
  const view = resolveSidebarView(pathname)
  const rawNavGroups = view ? view.getNavGroups(t) : rootSidebarData.navGroups
  const configFilteredGroups = useSidebarConfig(rawNavGroups)

  const navGroups = useMemo<NavGroup[]>(() => {
    const role = user?.role ?? ROLE.GUEST
    return filterSidebarGroupsByRole(configFilteredGroups, role, user)
  }, [configFilteredGroups, user])

  return {
    key: view?.id ?? ROOT_VIEW_KEY,
    view,
    navGroups,
  }
}

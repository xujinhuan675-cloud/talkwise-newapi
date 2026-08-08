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
import {
  ClipboardList,
  Headphones,
  History,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SidebarData } from '@/components/layout/types'
import { ROLE } from '@/lib/roles'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()

  return {
    navGroups: [
      {
        id: 'training',
        title: t('Training'),
        items: [
          {
            title: t('Training overview'),
            url: '/training',
            activeUrls: ['/training/overview'],
            icon: Home,
          },
          {
            title: t('Start training'),
            url: '/training/scenarios',
            icon: ClipboardList,
          },
          {
            title: t('Conversations'),
            url: '/training/conversations',
            icon: MessageSquare,
          },
          {
            title: t('In-call assist'),
            url: '/training/assist',
            icon: Headphones,
          },
          {
            title: t('Review'),
            url: '/training/sessions',
            icon: History,
          },
          {
            title: t('Growth'),
            url: '/training/growth',
            icon: TrendingUp,
          },
        ],
      },
      {
        id: 'training-configuration',
        title: t('Training configuration'),
        items: [
          {
            title: t('Personas'),
            url: '/training/personas',
            icon: Users,
          },
          {
            title: t('Training settings'),
            url: '/training/settings',
            icon: Settings,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          { title: t('Wallet'), url: '/wallet', icon: Wallet },
          { title: t('Profile'), url: '/profile', icon: User },
        ],
      },
      {
        id: 'team-management',
        title: t('Team management'),
        requiredTeamManagement: true,
        items: [
          {
            title: t('Scenario leaderboard'),
            url: '/training/team/scenarios',
            icon: TrendingUp,
          },
          {
            title: t('Competency leaderboard'),
            url: '/training/team/competencies',
            icon: LayoutDashboard,
          },
          {
            title: t('Training teams'),
            url: '/training/team/members',
            icon: Users,
          },
        ],
      },
      {
        id: 'platform-management',
        title: t('Platform management'),
        requiredRole: ROLE.ADMIN,
        items: [
          {
            title: t('Management console'),
            url: '/dashboard/overview',
            icon: Shield,
          },
        ],
      },
    ],
  }
}

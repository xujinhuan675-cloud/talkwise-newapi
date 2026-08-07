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
import { TRAINING_ASSIST_AVAILABILITY } from '@/features/training/section-registry'
import { ROLE } from '@/lib/roles'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return {
    navGroups: [
      {
        id: 'training',
        title: localize('Training', '\u8bad\u7ec3'),
        items: [
          {
            title: localize('Training overview', '\u8bad\u7ec3\u6982\u89c8'),
            url: '/training',
            activeUrls: ['/training/overview'],
            icon: Home,
          },
          {
            title: localize('Start training', '\u5f00\u59cb\u8bad\u7ec3'),
            url: '/training/scenarios',
            icon: ClipboardList,
          },
          {
            title: localize('Conversations', '\u5bf9\u8bdd'),
            url: '/training/conversations',
            icon: MessageSquare,
          },
          {
            title: localize('In-call assist', '\u4e34\u573a\u8f85\u52a9'),
            url: '/training/assist',
            icon: Headphones,
            badge: localize(
              TRAINING_ASSIST_AVAILABILITY.english,
              TRAINING_ASSIST_AVAILABILITY.chinese
            ),
            badgeVariant: TRAINING_ASSIST_AVAILABILITY.badgeVariant,
          },
          {
            title: localize('Review', '\u590d\u76d8'),
            url: '/training/sessions',
            icon: History,
          },
          {
            title: localize('Growth', '\u6210\u957f'),
            url: '/training/growth',
            icon: TrendingUp,
          },
        ],
      },
      {
        id: 'training-configuration',
        title: localize('Training configuration', '\u8bad\u7ec3\u914d\u7f6e'),
        items: [
          {
            title: localize('Personas', '\u89d2\u8272\u8d44\u4ea7'),
            url: '/training/personas',
            icon: Users,
          },
          {
            title: localize('Training settings', '\u8bad\u7ec3\u8bbe\u7f6e'),
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
        title: localize('Team management', '\u56e2\u961f\u7ba1\u7406'),
        requiredTeamManagement: true,
        items: [
          {
            title: localize('Scenario leaderboard', '\u573a\u666f\u6392\u884c'),
            url: '/training/team/scenarios',
            icon: TrendingUp,
          },
          {
            title: localize(
              'Competency leaderboard',
              '\u80fd\u529b\u6392\u884c'
            ),
            url: '/training/team/competencies',
            icon: LayoutDashboard,
          },
          {
            title: localize('Training teams', '\u8bad\u7ec3\u56e2\u961f'),
            url: '/training/team/members',
            icon: Users,
          },
        ],
      },
      {
        id: 'platform-management',
        title: localize('Platform management', '\u5e73\u53f0\u7ba1\u7406'),
        requiredRole: ROLE.ADMIN,
        items: [
          {
            title: localize(
              'Management console',
              '\u7ba1\u7406\u63a7\u5236\u53f0'
            ),
            url: '/dashboard/overview',
            icon: Shield,
          },
        ],
      },
    ],
  }
}

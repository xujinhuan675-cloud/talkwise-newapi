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
  Activity,
  Box,
  ClipboardList,
  CreditCard,
  FileText,
  History,
  Home,
  Key,
  LayoutDashboard,
  ListTodo,
  Radio,
  ServerCog,
  Settings,
  Ticket,
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
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return {
    navGroups: [
      {
        id: 'training',
        title: localize('Training', '训练'),
        items: [
          {
            title: localize('Training overview', '训练概览'),
            url: '/training',
            activeUrls: ['/training/overview'],
            icon: Home,
          },
          {
            title: localize('Practice', '练习'),
            icon: ClipboardList,
            items: [
              {
                title: localize('Scenarios', '场景训练'),
                url: '/training/scenarios',
              },
              {
                title: localize('Training studio', '训练工作台'),
                url: '/training/studio',
              },
              {
                title: localize('Live coach', '实时教练'),
                url: '/training/live-coach',
              },
              {
                title: localize('Conversations', '对话'),
                url: '/training/conversations',
              },
              {
                title: localize('Personas', '角色资产'),
                url: '/training/personas',
              },
            ],
          },
          {
            title: localize('Review', '复盘'),
            url: '/training/sessions',
            icon: History,
          },
          {
            title: localize('Growth', '成长'),
            icon: TrendingUp,
            items: [
              {
                title: localize('Growth overview', '成长概览'),
                url: '/training/growth',
              },
              {
                title: localize('Scenario leaderboard', '场景排行'),
                url: '/training/team/scenarios',
                requiredRole: ROLE.ADMIN,
              },
              {
                title: localize('Competency leaderboard', '能力排行'),
                url: '/training/team/competencies',
                requiredRole: ROLE.ADMIN,
              },
              {
                title: localize('Training teams', '\u8bad\u7ec3\u56e2\u961f'),
                url: '/training/team/members',
                requiredRole: ROLE.ADMIN,
              },
            ],
          },
          {
            title: localize('Training settings', '训练设置'),
            url: '/training/settings',
            icon: Settings,
          },
        ],
      },
      {
        id: 'personal',
        title: t('Personal'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
        ],
      },
      {
        id: 'admin',
        title: t('Admin'),
        items: [
          {
            title: localize('Platform overview', '平台概览'),
            url: '/dashboard/overview',
            icon: Activity,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: localize('Operational data', '运营数据'),
            url: '/dashboard/models',
            activeUrls: ['/dashboard/flow', '/dashboard/users'],
            icon: LayoutDashboard,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Usage Logs'),
            url: '/usage-logs/common',
            icon: FileText,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Task Logs'),
            url: '/usage-logs/task',
            activeUrls: ['/usage-logs/drawing'],
            configUrls: ['/usage-logs/drawing', '/usage-logs/task'],
            icon: ListTodo,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('Subscriptions'),
            url: '/subscriptions',
            icon: CreditCard,
            requiredRole: ROLE.ADMIN,
          },
          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
          {
            title: t('System Settings'),
            url: '/system-settings/site',
            activeUrls: ['/system-settings'],
            icon: Settings,
            requiredRole: ROLE.ADMIN,
          },
        ],
      },
    ],
  }
}

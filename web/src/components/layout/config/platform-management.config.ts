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
import type { TFunction } from 'i18next'
import {
  Activity,
  Box,
  CreditCard,
  FileText,
  Key,
  LayoutDashboard,
  ListTodo,
  Radio,
  ServerCog,
  Settings,
  Users,
} from 'lucide-react'

import i18n from '@/i18n/config'
import { ROLE } from '@/lib/roles'

import type { NavGroup, SidebarView } from '../types'

function localize(t: TFunction, english: string, chinese: string): string {
  return t(english, {
    defaultValue: i18n.language?.startsWith('zh') ? chinese : english,
  })
}

export function getPlatformManagementNavGroups(t: TFunction): NavGroup[] {
  return [
    {
      id: 'operations',
      title: localize(t, 'Operations', '\u8fd0\u8425'),
      requiredRole: ROLE.ADMIN,
      items: [
        {
          title: localize(t, 'Platform overview', '\u5e73\u53f0\u6982\u89c8'),
          url: '/dashboard/overview',
          icon: Activity,
          requiredRole: ROLE.ADMIN,
        },
        {
          title: localize(t, 'Operational data', '\u8fd0\u8425\u6570\u636e'),
          url: '/dashboard/models',
          activeUrls: ['/dashboard/flow', '/dashboard/users'],
          icon: LayoutDashboard,
          requiredRole: ROLE.ADMIN,
        },
        {
          title: t('Users'),
          url: '/users',
          icon: Users,
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
          title: localize(
            t,
            'Subscriptions & redemption',
            '\u8ba2\u9605\u4e0e\u5151\u6362'
          ),
          icon: CreditCard,
          requiredRole: ROLE.ADMIN,
          items: [
            { title: t('Subscriptions'), url: '/subscriptions' },
            { title: t('Redemption Codes'), url: '/redemption-codes' },
          ],
        },
      ],
    },
    {
      id: 'system',
      title: localize(t, 'System', '\u7cfb\u7edf'),
      requiredRole: ROLE.ADMIN,
      items: [
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
          title: t('API Keys'),
          url: '/keys',
          icon: Key,
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
          requiredRole: ROLE.SUPER_ADMIN,
        },
      ],
    },
  ]
}

export const PLATFORM_MANAGEMENT_VIEW: SidebarView = {
  id: 'platform-management',
  pathPattern:
    /^\/(?:dashboard|keys|usage-logs|channels|models|users|redemption-codes|subscriptions|system-info)(?:\/|$)/,
  parent: {
    to: '/training',
    label: 'Back',
  },
  getNavGroups: getPlatformManagementNavGroups,
}

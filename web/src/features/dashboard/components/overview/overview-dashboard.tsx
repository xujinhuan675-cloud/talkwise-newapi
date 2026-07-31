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
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowRight,
  BarChart3,
  FileText,
  RadioTower,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { useDashboardContentVisibility } from '../../hooks/use-status-data'
import { AnnouncementsPanel } from './announcements-panel'
import { PerformanceHealthPanel } from './performance-health-panel'
import { UptimePanel } from './uptime-panel'

type PlatformAction =
  | {
      title: string
      description: string
      icon: LucideIcon
      to: '/dashboard/$section'
      params: { section: 'models' }
    }
  | {
      title: string
      description: string
      icon: LucideIcon
      to: '/usage-logs/$section'
      params: { section: 'common' }
    }
  | {
      title: string
      description: string
      icon: LucideIcon
      to: '/users'
    }
  | {
      title: string
      description: string
      icon: LucideIcon
      to: '/channels'
    }

function PlatformActionLink({ action }: { action: PlatformAction }) {
  if ('params' in action) {
    return <Link to={action.to} params={action.params} />
  }

  return <Link to={action.to} />
}

export function OverviewDashboard() {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const { announcements, uptimeKuma } = useDashboardContentVisibility()

  const actions: PlatformAction[] = [
    {
      title: localize('Operational data', '运营数据'),
      description: localize(
        'Review traffic, model calls, and user activity trends.',
        '查看平台流量、模型调用和用户活跃趋势。'
      ),
      to: '/dashboard/$section',
      params: { section: 'models' },
      icon: BarChart3,
    },
    {
      title: localize('Usage logs', '使用日志'),
      description: localize(
        'Inspect individual requests, errors, and consumption records.',
        '查看单次请求、错误和消耗记录。'
      ),
      to: '/usage-logs/$section',
      params: { section: 'common' },
      icon: FileText,
    },
    {
      title: localize('Users', '用户'),
      description: localize(
        'Manage accounts and review user-level operational data.',
        '管理账号并查看用户维度的运营数据。'
      ),
      to: '/users',
      icon: Users,
    },
    {
      title: localize('Channels', '渠道'),
      description: localize(
        'Manage upstream providers and routing availability.',
        '管理上游服务商和路由可用性。'
      ),
      to: '/channels',
      icon: RadioTower,
    },
  ]

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Activity className='size-4' aria-hidden='true' />
            {localize('Platform operations', '平台运营')}
          </CardTitle>
          <CardDescription>
            {localize(
              'Review service health, platform activity, and administrative work from one place.',
              '集中查看服务健康度、平台活动和管理工作。'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-2 md:grid-cols-2'>
          {actions.map((action) => {
            const Icon = action.icon
            return (
              <Button
                key={action.to}
                variant='outline'
                className='h-auto justify-start px-3 py-3 text-left'
                render={<PlatformActionLink action={action} />}
              >
                <span className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
                  <Icon className='size-4' aria-hidden='true' />
                </span>
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <span className='truncate text-sm font-medium'>
                    {action.title}
                  </span>
                  <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
                    {action.description}
                  </span>
                </span>
                <ArrowRight
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              </Button>
            )
          })}
        </CardContent>
      </Card>

      <div className='grid gap-4 xl:grid-cols-2'>
        <PerformanceHealthPanel />
        {announcements && <AnnouncementsPanel />}
      </div>

      {uptimeKuma && <UptimePanel />}
    </div>
  )
}

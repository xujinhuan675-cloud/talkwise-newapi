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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { CircleAlert, ClipboardCheck, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { TrainingHostProvider, useTrainingHost } from '../host'
import { listReviewSessions, reviewRequestErrorMessage } from './api'
import type { ReviewSession, TrainingSessionStatus } from './types'

const route = getRouteApi('/_authenticated/training/sessions')

function formatDate(value: string | null, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusVariant(status: TrainingSessionStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'active') return 'warning' as const
  return 'info' as const
}

function sessionModeLabel(
  mode: ReviewSession['mode'],
  localize: (english: string, chinese: string) => string
): string {
  const labels: Record<ReviewSession['mode'], readonly [string, string]> = {
    realtime: ['Realtime voice', '实时语音'],
    text: ['Text', '文本'],
    video: ['Video', '视频'],
    voice: ['Voice', '语音'],
  }
  return localize(...labels[mode])
}

function sessionStatusLabel(
  status: TrainingSessionStatus,
  localize: (english: string, chinese: string) => string
): string {
  const labels: Record<TrainingSessionStatus, readonly [string, string]> = {
    active: ['Active', '进行中'],
    completed: ['Completed', '已完成'],
    created: ['Created', '已创建'],
    failed: ['Failed', '失败'],
  }
  return localize(...labels[status])
}

function SessionDataTable({
  sessions,
  total,
  pagination,
  onPaginationChange,
  ensurePageInRange,
  isLoading,
  isFetching,
  locale,
  localize,
}: {
  sessions: ReviewSession[]
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  ensurePageInRange: (pageCount: number) => void
  isLoading: boolean
  isFetching: boolean
  locale: string
  localize: (english: string, chinese: string) => string
}) {
  const columns = useMemo<ColumnDef<ReviewSession>[]>(
    () => [
      {
        id: 'session',
        header: localize('Session', '训练会话'),
        cell: ({ row }) => {
          const session = row.original
          return (
            <div className='min-w-0'>
              <Link
                to='/training/sessions/$sessionId'
                params={{ sessionId: session.id }}
                className='hover:text-primary block truncate font-medium'
              >
                {session.title}
              </Link>
              <div className='text-muted-foreground mt-1 truncate text-xs'>
                {session.description || session.role}
              </div>
            </div>
          )
        },
      },
      {
        id: 'mode',
        header: localize('Mode', '模式'),
        cell: ({ row }) => sessionModeLabel(row.original.mode, localize),
      },
      {
        id: 'status',
        header: localize('Status', '状态'),
        cell: ({ row }) => {
          const session = row.original
          return (
            <StatusBadge
              label={sessionStatusLabel(session.status, localize)}
              variant={statusVariant(session.status)}
              copyable={false}
            />
          )
        },
      },
      {
        id: 'messages',
        header: localize('Messages', '消息'),
        cell: ({ row }) => row.original.messageCount,
      },
      {
        id: 'last-activity',
        header: localize('Last activity', '最近活动'),
        cell: ({ row }) =>
          formatDate(
            row.original.completedAt || row.original.startedAt,
            locale
          ),
      },
    ],
    [locale, localize]
  )
  const { table } = useDataTable({
    data: sessions,
    columns,
    getRowId: (session) => session.id,
    enableRowSelection: false,
    pagination,
    onPaginationChange,
    manualPagination: true,
    totalCount: total,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyIcon={<ClipboardCheck />}
      emptyTitle={localize('No training sessions yet', '暂无训练记录')}
      emptyDescription={localize(
        'Created and completed training sessions will appear here.',
        '已创建或已完成的训练会话会显示在这里。'
      )}
      skeletonKeyPrefix='training-session-skeleton'
      toolbarProps={null}
      fixedHeight={false}
      tableClassName='min-w-170'
      getColumnClassName={(columnId) => {
        if (columnId === 'session') return 'max-w-96 whitespace-normal'
        if (columnId === 'mode') return 'capitalize'
        if (columnId === 'messages') return 'text-right tabular-nums'
        if (columnId === 'last-activity') {
          return 'text-muted-foreground whitespace-nowrap text-right text-xs'
        }
        return undefined
      }}
    />
  )
}

export function TrainingSessions() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search: route.useSearch(),
      navigate: route.useNavigate(),
      pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
      globalFilter: { enabled: false },
    })
  const sessionsQuery = useQuery({
    queryKey: [
      'training',
      'review-sessions',
      host.apiBase,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      listReviewSessions(host.apiBase, {
        skip: pagination.pageIndex * pagination.pageSize,
        limit: pagination.pageSize,
      }),
    enabled: host.authStatus === 'authenticated',
    placeholderData: (previousData) => previousData,
  })

  if (host.authStatus === 'anonymous') {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>{localize('Sign-in required', '需要登录')}</AlertTitle>
        <AlertDescription>
          {localize(
            'Your session is no longer available.',
            '当前登录会话已不可用。'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (sessionsQuery.isError) {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Failed to load training sessions', '训练记录加载失败')}
        </AlertTitle>
        <AlertDescription>
          {reviewRequestErrorMessage(
            sessionsQuery.error,
            localize('Request failed', '请求失败')
          )}
        </AlertDescription>
        <div className='col-start-2 mt-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void sessionsQuery.refetch()}
          >
            <RefreshCw />
            {localize('Retry', '重试')}
          </Button>
        </div>
      </Alert>
    )
  }

  return (
    <SessionDataTable
      sessions={sessionsQuery.data?.items ?? []}
      total={sessionsQuery.data?.total ?? 0}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      ensurePageInRange={ensurePageInRange}
      isLoading={host.authStatus === 'loading' || sessionsQuery.isPending}
      isFetching={sessionsQuery.isFetching}
      locale={i18n.language}
      localize={localize}
    />
  )
}

export function TrainingSessionsPage() {
  const { i18n, t } = useTranslation()
  const title = t('Training sessions', {
    defaultValue: i18n.language.startsWith('zh')
      ? '训练记录'
      : 'Training sessions',
  })

  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>{title}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <TrainingSessions />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

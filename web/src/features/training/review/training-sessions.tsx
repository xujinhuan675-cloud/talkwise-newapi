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
import { Link } from '@tanstack/react-router'
import { type ColumnDef } from '@tanstack/react-table'
import { CircleAlert, ClipboardCheck, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  listReviewSessions,
  listScenarioProgress,
  mergeReviewSessionScores,
  reviewRequestErrorMessage,
} from './api'
import type { ReviewSession, TrainingSessionStatus } from './types'

const SKELETON_ROWS = Array.from(
  { length: 5 },
  (_, index) => `training-session-skeleton-${index + 1}`
)

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

function sessionTimestamp(session: ReviewSession): number {
  const value = session.completedAt || session.startedAt
  return value ? Date.parse(value) || 0 : 0
}

function statusVariant(status: TrainingSessionStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'active') return 'warning' as const
  return 'info' as const
}

function SessionTableSkeleton() {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <Table className='min-w-190'>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 6 }, (_, index) => (
              <TableHead key={`training-session-heading-${index + 1}`}>
                <Skeleton className='h-4 w-20' />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SKELETON_ROWS.map((row) => (
            <TableRow key={row}>
              {Array.from({ length: 6 }, (_, index) => (
                <TableCell key={`${row}-${index + 1}`}>
                  <Skeleton className='h-4 w-24' />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function TrainingSessions() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const [query, setQuery] = useState('')
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  const sessionsQuery = useQuery({
    queryKey: ['training', 'review-sessions', host.apiBase],
    queryFn: () => listReviewSessions(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const progressQuery = useQuery({
    queryKey: ['training', 'scenario-progress', host.apiBase],
    queryFn: () => listScenarioProgress(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })

  const sessions = useMemo(() => {
    const scoredSessions = mergeReviewSessionScores(
      sessionsQuery.data ?? [],
      progressQuery.data ?? []
    )
    return scoredSessions.sort(
      (first, second) => sessionTimestamp(second) - sessionTimestamp(first)
    )
  }, [progressQuery.data, sessionsQuery.data])
  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return sessions
    return sessions.filter((session) =>
      [
        session.title,
        session.description,
        session.role,
        session.category,
        session.difficulty,
        session.scenarioId,
        session.id,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
    )
  }, [query, sessions])
  const isLoading =
    host.authStatus === 'loading' ||
    sessionsQuery.isPending ||
    progressQuery.isPending
  const error = sessionsQuery.error || progressQuery.error

  if (host.authStatus === 'anonymous') {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Sign-in required', '\u9700\u8981\u767b\u5f55')}
        </AlertTitle>
        <AlertDescription>
          {localize(
            'Your session is no longer available.',
            '\u5f53\u524d\u767b\u5f55\u4f1a\u8bdd\u5df2\u4e0d\u53ef\u7528\u3002'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-52 flex-1 sm:max-w-sm'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={localize(
              'Search training sessions...',
              '\u641c\u7d22\u8bad\u7ec3\u8bb0\u5f55...'
            )}
            aria-label={localize(
              'Search training sessions',
              '\u641c\u7d22\u8bad\u7ec3\u8bb0\u5f55'
            )}
            className='pl-8'
          />
        </div>
      </div>

      {error && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize(
              'Failed to load training sessions',
              '\u8bad\u7ec3\u8bb0\u5f55\u52a0\u8f7d\u5931\u8d25'
            )}
          </AlertTitle>
          <AlertDescription>
            {reviewRequestErrorMessage(
              error,
              localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
            )}
          </AlertDescription>
          <div className='col-start-2 mt-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                void sessionsQuery.refetch()
                void progressQuery.refetch()
              }}
            >
              <RefreshCw />
              {localize('Retry', '\u91cd\u8bd5')}
            </Button>
          </div>
        </Alert>
      )}
      {!error && isLoading && <SessionTableSkeleton />}
      {!error && !isLoading && filteredSessions.length === 0 && (
        <div className='rounded-lg border p-8'>
          <Empty className='border-none p-0'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                {query.trim() ? <Search /> : <ClipboardCheck />}
              </EmptyMedia>
              <EmptyTitle>
                {query.trim()
                  ? localize(
                      'No matching sessions',
                      '\u6ca1\u6709\u5339\u914d\u7684\u8bad\u7ec3\u8bb0\u5f55'
                    )
                  : localize(
                      'No training sessions yet',
                      '\u6682\u65e0\u8bad\u7ec3\u8bb0\u5f55'
                    )}
              </EmptyTitle>
              <EmptyDescription>
                {query.trim()
                  ? localize(
                      'Try a different search term.',
                      '\u8bf7\u5c1d\u8bd5\u5176\u4ed6\u641c\u7d22\u8bcd\u3002'
                    )
                  : localize(
                      'Created and completed training sessions will appear here.',
                      '\u5df2\u521b\u5efa\u6216\u5df2\u5b8c\u6210\u7684\u8bad\u7ec3\u4f1a\u8bdd\u4f1a\u663e\u793a\u5728\u8fd9\u91cc\u3002'
                    )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
      {!error && !isLoading && filteredSessions.length > 0 && (
        <SessionDataTable
          sessions={filteredSessions}
          locale={i18n.language}
          localize={localize}
        />
      )}
    </div>
  )
}

function SessionDataTable({
  sessions,
  locale,
  localize,
}: {
  sessions: ReviewSession[]
  locale: string
  localize: (english: string, chinese: string) => string
}) {
  const columns = useMemo<ColumnDef<ReviewSession>[]>(
    () => [
      {
        id: 'session',
        header: localize('Session', '\u8bad\u7ec3\u4f1a\u8bdd'),
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
        header: localize('Mode', '\u6a21\u5f0f'),
        cell: ({ row }) => row.original.mode,
      },
      {
        id: 'status',
        header: localize('Status', '\u72b6\u6001'),
        cell: ({ row }) => {
          const session = row.original
          return (
            <StatusBadge
              label={session.status.replace('_', ' ')}
              variant={statusVariant(session.status)}
              copyable={false}
            />
          )
        },
      },
      {
        id: 'score',
        header: localize('Score', '\u5f97\u5206'),
        cell: ({ row }) => {
          const session = row.original
          return session.scoreStatus === 'ready' && session.score !== null
            ? `${session.score}/100`
            : '-'
        },
      },
      {
        id: 'messages',
        header: localize('Messages', '\u6d88\u606f'),
        cell: ({ row }) => row.original.messageCount,
      },
      {
        id: 'last-activity',
        header: localize('Last activity', '\u6700\u8fd1\u6d3b\u52a8'),
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
  })

  useEffect(() => {
    table.resetPageIndex()
  }, [sessions, table])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      fixedHeight={false}
      tableClassName='min-w-190'
      getColumnClassName={(columnId) => {
        if (columnId === 'session') return 'max-w-96 whitespace-normal'
        if (columnId === 'mode') return 'capitalize'
        if (columnId === 'score' || columnId === 'messages') {
          return 'text-right tabular-nums'
        }
        if (columnId === 'last-activity') {
          return 'text-muted-foreground whitespace-nowrap text-xs'
        }
        return undefined
      }}
    />
  )
}

export function TrainingSessionsPage() {
  const { i18n, t } = useTranslation()
  const title = t('Training sessions', {
    defaultValue: i18n.language.startsWith('zh')
      ? '\u8bad\u7ec3\u8bb0\u5f55'
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

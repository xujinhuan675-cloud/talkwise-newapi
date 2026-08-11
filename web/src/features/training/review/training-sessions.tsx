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
import { getRouteApi } from '@tanstack/react-router'
import type {
  ColumnFiltersState,
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { CircleAlert, ClipboardCheck, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  DataTableRow,
  useDataTable,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { formatTrainingDateTime } from '../date'
import { TrainingHostProvider, useTrainingHost } from '../host'
import { listTrainingScenarios } from '../scenarios/api'
import { trainingSessionStatusDisplayLabel } from '../training-display-labels'
import {
  listReviewSessions,
  listScenarioProgress,
  mergeReviewSessionScores,
  reviewRequestAccessState,
  reviewRequestErrorMessage,
} from './api'
import { reviewReportStatusPresentation } from './report-state-presentation'
import { reviewScorePresentation } from './score-state-presentation'
import { trainingSessionEntryDestination } from './session-entry-navigation'
import { TrainingSessionEntryLink } from './training-session-entry-link'
import type {
  ReviewSession,
  TrainingSessionMode,
  TrainingSessionStatus,
} from './types'

const route = getRouteApi('/_authenticated/training/sessions')

const TRAINING_SESSION_MODES: TrainingSessionMode[] = [
  'text',
  'voice',
  'video',
  'realtime',
]

const TRAINING_SESSION_SOURCES = [
  'newapi_training_studio',
  'scenario_training',
  'battle_prep',
  'persona_builder',
  'defense_prep',
] as const

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
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

function sessionSourceLabel(
  source: string | null,
  localize: (english: string, chinese: string) => string
): string {
  if (!source) return localize('Not recorded', '未记录')
  const labels: Record<string, readonly [string, string]> = {
    battle_prep: ['Battle prep', '攻坚准备'],
    defense_prep: ['Defense prep', '答辩准备'],
    newapi_training_studio: ['Training studio', '训练工作台'],
    persona_builder: ['Persona training', '角色训练'],
    scenario_training: ['Scenario training', '场景训练'],
  }
  const label = labels[source]
  if (label) return localize(...label)
  const neutralSource = source.replace(/^newapi[_.:-]*/i, '') || source
  return neutralSource.replaceAll('_', ' ')
}

function accessErrorCopy(
  error: unknown,
  localize: (english: string, chinese: string) => string
): { description: string; title: string } | null {
  const accessState = reviewRequestAccessState(error)
  if (accessState === 'unauthorized') {
    return {
      title: localize('Sign-in required', '需要登录'),
      description: localize(
        'Your authenticated session is no longer valid. Sign in again to continue.',
        '当前登录会话已失效，请重新登录后继续。'
      ),
    }
  }
  if (accessState === 'forbidden') {
    return {
      title: localize('Access denied', '无权访问'),
      description: localize(
        'You do not have permission to view these training sessions.',
        '你没有查看这些训练会话的权限。'
      ),
    }
  }
  return null
}

function SessionDataTable({
  sessions,
  total,
  pagination,
  onPaginationChange,
  ensurePageInRange,
  isLoading,
  isFetching,
  language,
  localize,
  onOpenSession,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  scenarioOptions,
  activityFrom,
  activityTo,
  onActivityRangeChange,
}: {
  sessions: ReviewSession[]
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  ensurePageInRange: (pageCount: number) => void
  isLoading: boolean
  isFetching: boolean
  language: string
  localize: (english: string, chinese: string) => string
  onOpenSession: (session: ReviewSession) => void
  columnFilters: ColumnFiltersState
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>
  globalFilter: string
  onGlobalFilterChange?: OnChangeFn<string>
  scenarioOptions: Array<{ label: string; value: string }>
  activityFrom?: Date
  activityTo?: Date
  onActivityRangeChange: (range: { start?: Date; end?: Date }) => void
}) {
  const hasActiveFilters = Boolean(
    globalFilter.trim() ||
    columnFilters.length > 0 ||
    activityFrom ||
    activityTo
  )
  const columns = useMemo<ColumnDef<ReviewSession>[]>(
    () => [
      {
        id: 'session',
        header: localize('Session', '训练会话'),
        meta: { mobileTitle: true },
        cell: ({ row }) => {
          const session = row.original
          return (
            <div className='min-w-0'>
              <div className='truncate font-medium'>{session.title}</div>
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
        id: 'source',
        header: localize('Source', '来源'),
        accessorFn: (session) => session.trainingSource ?? '',
        cell: ({ row }) =>
          sessionSourceLabel(row.original.trainingSource, localize),
      },
      {
        id: 'status',
        header: localize('Status', '状态'),
        meta: { mobileBadge: true },
        cell: ({ row }) => {
          const session = row.original
          return (
            <StatusBadge
              label={trainingSessionStatusDisplayLabel(
                session.status,
                language
              )}
              variant={statusVariant(session.status)}
              copyable={false}
            />
          )
        },
      },
      {
        id: 'report',
        header: localize('Review report', '复盘报告'),
        cell: ({ row }) => {
          const presentation = reviewReportStatusPresentation(
            row.original.reportState,
            localize
          )
          return (
            <StatusBadge
              label={presentation.label}
              variant={presentation.variant}
              copyable={false}
            />
          )
        },
      },
      {
        id: 'score',
        header: localize('Score result', '评分结果'),
        cell: ({ row }) => {
          const session = row.original
          return reviewScorePresentation(
            {
              evaluationState: session.evaluationState,
              progressLinked: session.progressLinked === true,
              reportState: session.reportState,
              score: session.score,
              scoreStatus: session.scoreStatus,
            },
            localize
          ).label
        },
      },
      {
        id: 'messages',
        header: localize('Messages', '消息'),
        cell: ({ row }) => row.original.messageCount,
      },
      {
        id: 'last-activity',
        header: localize('Training time', '训练时间'),
        cell: ({ row }) =>
          formatTrainingDateTime(
            row.original.completedAt || row.original.startedAt
          ),
      },
    ],
    [language, localize]
  )
  const { table } = useDataTable({
    data: sessions,
    columns,
    getRowId: (session) => session.id,
    enableRowSelection: false,
    pagination,
    columnFilters,
    globalFilter,
    onPaginationChange,
    onColumnFiltersChange,
    onGlobalFilterChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: total,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      renderRow={(row, helpers) => (
        <DataTableRow
          key={row.id}
          row={row}
          cellRenderColumns={columns}
          className='hover:bg-muted/50 cursor-pointer transition-colors'
          getColumnClassName={(columnId) => helpers.getCellClassName(columnId)}
          role='link'
          tabIndex={0}
          onClick={(event) => {
            const target = event.target
            if (
              target instanceof Element &&
              target.closest('a, button, input, select, textarea')
            ) {
              return
            }
            onOpenSession(row.original)
          }}
          onKeyDown={(event) => {
            if (
              event.target === event.currentTarget &&
              (event.key === 'Enter' || event.key === ' ')
            ) {
              event.preventDefault()
              onOpenSession(row.original)
            }
          }}
        />
      )}
      mobileProps={{
        renderRow: (row, content) => (
          <TrainingSessionEntryLink
            className='hover:bg-muted/50 block [background-color:var(--data-table-card-bg,var(--table-row))] px-3 py-2.5 transition-colors'
            sessionId={row.original.id}
            status={row.original.status}
          >
            {content}
          </TrainingSessionEntryLink>
        ),
      }}
      emptyIcon={<ClipboardCheck />}
      emptyTitle={
        hasActiveFilters
          ? localize('No matching training sessions', '没有匹配的训练记录')
          : localize('No training sessions yet', '暂无训练记录')
      }
      emptyDescription={localize(
        hasActiveFilters
          ? 'Try changing or clearing the current filters.'
          : 'Created and completed training sessions will appear here.',
        hasActiveFilters
          ? '请调整或清除当前筛选条件。'
          : '已创建或已完成的训练会话会显示在这里。'
      )}
      skeletonKeyPrefix='training-session-skeleton'
      toolbarProps={{
        searchPlaceholder: localize(
          'Search scenario, session, category...',
          '搜索场景、会话、分类...'
        ),
        searchDebounceMs: 400,
        additionalSearch: (
          <CompactDateTimeRangePicker
            start={activityFrom}
            end={activityTo}
            onChange={onActivityRangeChange}
            className='w-full sm:w-auto sm:max-w-96'
          />
        ),
        hasAdditionalFilters: Boolean(activityFrom || activityTo),
        onReset: () => onActivityRangeChange({}),
        filters: [
          {
            columnId: 'session',
            title: localize('Scenario', '场景'),
            options: scenarioOptions,
            singleSelect: true,
          },
          {
            columnId: 'mode',
            title: localize('Mode', '模式'),
            options: TRAINING_SESSION_MODES.map((mode) => ({
              label: sessionModeLabel(mode, localize),
              value: mode,
            })),
            singleSelect: true,
          },
          {
            columnId: 'source',
            title: localize('Source', '来源'),
            options: TRAINING_SESSION_SOURCES.map((source) => ({
              label: sessionSourceLabel(source, localize),
              value: source,
            })),
            singleSelect: true,
          },
        ],
        hideViewOptions: true,
      }}
      fixedHeight={false}
      tableClassName='min-w-170'
      getColumnClassName={(columnId) => {
        if (columnId === 'session') return 'max-w-96 whitespace-normal'
        if (columnId === 'mode') return 'capitalize'
        if (columnId === 'source') return 'whitespace-nowrap'
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
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const tableState = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'query', trim: true },
    columnFilters: [
      { columnId: 'session', searchKey: 'scenario', type: 'array' },
      { columnId: 'mode', searchKey: 'mode', type: 'array' },
      { columnId: 'source', searchKey: 'source', type: 'array' },
    ],
  })
  const scenarioId = (
    tableState.columnFilters.find((filter) => filter.id === 'session')
      ?.value as string[] | undefined
  )?.[0]
  const mode = (
    tableState.columnFilters.find((filter) => filter.id === 'mode')?.value as
      | TrainingSessionMode[]
      | undefined
  )?.[0]
  const source = (
    tableState.columnFilters.find((filter) => filter.id === 'source')?.value as
      | string[]
      | undefined
  )?.[0]
  const activityFrom = validDate(search.activityFrom)
  const activityTo = validDate(search.activityTo)
  const onActivityRangeChange = (range: { start?: Date; end?: Date }) => {
    const isReversed =
      range.start && range.end && range.start.getTime() > range.end.getTime()
    const start = isReversed ? range.end : range.start
    const end = isReversed ? range.start : range.end
    navigate({
      search: (previous) => ({
        ...previous,
        page: undefined,
        activityFrom: start?.toISOString(),
        activityTo: end?.toISOString(),
      }),
    })
  }
  const onOpenSession = (session: ReviewSession) => {
    const destination = trainingSessionEntryDestination(
      session.status,
      session.id
    )
    if (destination.kind === 'resume') {
      void navigate({
        search: destination.search,
        to: destination.to,
      })
      return
    }
    void navigate({
      params: destination.params,
      to: destination.to,
    })
  }
  const scenariosQuery = useQuery({
    queryKey: ['training', 'review-scenarios', host.apiBase],
    queryFn: () => listTrainingScenarios(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const sessionsQuery = useQuery({
    queryKey: [
      'training',
      'review-sessions',
      host.apiBase,
      tableState.pagination.pageIndex,
      tableState.pagination.pageSize,
      tableState.globalFilter,
      scenarioId,
      mode,
      source,
      search.activityFrom,
      search.activityTo,
    ],
    queryFn: () =>
      listReviewSessions(host.apiBase, {
        skip: tableState.pagination.pageIndex * tableState.pagination.pageSize,
        limit: tableState.pagination.pageSize,
        scenarioId,
        query: tableState.globalFilter,
        mode,
        source,
        activityFrom: activityFrom?.toISOString(),
        activityTo: activityTo?.toISOString(),
      }),
    enabled: host.authStatus === 'authenticated',
    placeholderData: (previousData) => previousData,
  })
  const progressQuery = useQuery({
    queryKey: ['training', 'review-progress', host.apiBase],
    queryFn: () => listScenarioProgress(host.apiBase, { skip: 0, limit: 500 }),
    enabled: host.authStatus === 'authenticated',
  })
  const sessions = mergeReviewSessionScores(
    sessionsQuery.data?.items ?? [],
    progressQuery.data?.items ?? []
  )
  const scenarioOptions = (scenariosQuery.data ?? []).map((scenario) => ({
    label: scenario.title,
    value: scenario.id,
  }))
  const sessionsAccessError = sessionsQuery.isError
    ? accessErrorCopy(sessionsQuery.error, localize)
    : null

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
          {sessionsAccessError?.title ??
            localize('Failed to load training sessions', '训练记录加载失败')}
        </AlertTitle>
        <AlertDescription>
          {sessionsAccessError?.description ??
            reviewRequestErrorMessage(
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
    <div className='space-y-3'>
      {scenariosQuery.isError && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {localize('Scenario filter unavailable', '场景筛选暂不可用')}
          </AlertTitle>
          <AlertDescription>
            {reviewRequestErrorMessage(
              scenariosQuery.error,
              localize('Request failed', '请求失败')
            )}
          </AlertDescription>
        </Alert>
      )}
      {progressQuery.isError && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {localize('Score results unavailable', '评分结果暂不可用')}
          </AlertTitle>
          <AlertDescription>
            {reviewRequestErrorMessage(
              progressQuery.error,
              localize('Request failed', '请求失败')
            )}
          </AlertDescription>
        </Alert>
      )}
      <SessionDataTable
        sessions={sessions}
        total={sessionsQuery.data?.total ?? 0}
        pagination={tableState.pagination}
        onPaginationChange={tableState.onPaginationChange}
        ensurePageInRange={tableState.ensurePageInRange}
        isLoading={host.authStatus === 'loading' || sessionsQuery.isPending}
        isFetching={sessionsQuery.isFetching}
        language={i18n.language}
        localize={localize}
        onOpenSession={onOpenSession}
        columnFilters={tableState.columnFilters}
        onColumnFiltersChange={tableState.onColumnFiltersChange}
        globalFilter={tableState.globalFilter ?? ''}
        onGlobalFilterChange={tableState.onGlobalFilterChange}
        scenarioOptions={scenarioOptions}
        activityFrom={activityFrom}
        activityTo={activityTo}
        onActivityRangeChange={onActivityRangeChange}
      />
    </div>
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

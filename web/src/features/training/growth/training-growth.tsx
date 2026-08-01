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
import {
  CircleAlert,
  History,
  RefreshCw,
  Target,
  UserRound,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { getTrainingScenarioConfig } from '../config/api'
import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  getTrainingCompetencyRadar,
  getScenarioProgressSummary,
  listReviewSessions,
  listScenarioProgress,
  mergeReviewSessionScores,
  reviewRequestErrorMessage,
} from '../review/api'
import type {
  ReviewSession,
  ScenarioProgress,
  ScenarioProgressStatus,
  TrainingCompetencyRadar,
  TrainingSessionStatus,
} from '../review/types'
import {
  getTrainingGrowthProfileState,
  getTrainingGrowthScoreState,
  selectRecentTrainingActivity,
} from './contract'

const route = getRouteApi('/_authenticated/training/growth')

const COMPETENCY_LABELS: Record<string, [string, string]> = {
  persuasion: ['Persuasion', '说服力'],
  emotional_management: ['Emotional management', '情绪管理'],
  active_listening: ['Active listening', '主动倾听'],
  structured_expression: ['Structured expression', '结构表达'],
  conflict_resolution: ['Conflict resolution', '冲突处理'],
  stakeholder_alignment: ['Stakeholder alignment', '利益相关者对齐'],
}

const competencyRadarChartConfig = {
  score: {
    label: 'Average score',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

function formatDate(value: string | null, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusVariant(status: ScenarioProgressStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'in_progress') return 'warning' as const
  return 'info' as const
}

function progressStatusLabel(
  status: ScenarioProgressStatus,
  localize: (english: string, chinese: string) => string
): string {
  const labels: Record<ScenarioProgressStatus, readonly [string, string]> = {
    completed: ['Completed', '已完成'],
    failed: ['Failed', '失败'],
    in_progress: ['In progress', '进行中'],
    not_started: ['Not started', '未开始'],
  }
  return localize(...labels[status])
}

function sessionStatusVariant(status: TrainingSessionStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'active') return 'warning' as const
  return 'info' as const
}

function sessionStatusLabel(
  status: TrainingSessionStatus,
  localize: (english: string, chinese: string) => string
): string {
  const labels: Record<TrainingSessionStatus, readonly [string, string]> = {
    active: ['Active', '进行中'],
    completed: ['Completed', '已完成'],
    created: ['Created', '待开始'],
    failed: ['Failed', '失败'],
  }
  return localize(...labels[status])
}

function GrowthSkeleton() {
  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-3'>
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={`training-growth-skeleton-${index + 1}`} size='sm'>
            <CardHeader>
              <Skeleton className='h-4 w-28' />
            </CardHeader>
            <CardContent className='space-y-2'>
              <Skeleton className='h-7 w-20' />
              <Skeleton className='h-3 w-full' />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='space-y-3 rounded-lg border p-4'>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton
            key={`training-growth-row-${index + 1}`}
            className='h-5 w-full'
          />
        ))}
      </div>
    </div>
  )
}

function TrainingCompetencyRadarCard({
  radar,
  isPending,
  isError,
  onRetry,
  localize,
  userName,
}: {
  radar: TrainingCompetencyRadar | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  localize: (english: string, chinese: string) => string
  userName: string
}) {
  const chartData = (radar?.dimensions ?? []).map((dimension) => {
    const labels = COMPETENCY_LABELS[dimension.dimensionId]
    return {
      dimension: labels
        ? localize(labels[0], labels[1])
        : dimension.dimensionId,
      score: dimension.score,
    }
  })
  const hasRadar = getTrainingGrowthProfileState(radar) === 'ready'

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <UserRound className='text-muted-foreground size-4' />
          {localize('Communication profile', '沟通能力名片')}
        </CardTitle>
        <CardDescription>{userName}</CardDescription>
        {hasRadar && radar && (
          <CardAction>
            <Badge variant='secondary'>
              {localize(
                `${radar.sampleSize} scored sessions`,
                `${radar.sampleSize} 次已评分训练`
              )}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className='mx-auto size-70 rounded-full' />}
        {isError && (
          <div className='text-muted-foreground flex min-h-60 flex-col items-center justify-center gap-3 text-sm'>
            <span>
              {localize(
                'Unable to load competency scores.',
                '无法加载能力评分。'
              )}
            </span>
            <Button size='sm' variant='outline' onClick={onRetry}>
              <RefreshCw />
              {localize('Retry', '重试')}
            </Button>
          </div>
        )}
        {!isPending && !isError && hasRadar && radar && (
          <div className='grid items-center gap-6 lg:grid-cols-2'>
            <ChartContainer
              className='mx-auto aspect-square h-72 w-full max-w-md'
              config={competencyRadarChartConfig}
            >
              <RadarChart data={chartData} outerRadius='72%'>
                <PolarGrid />
                <PolarAngleAxis dataKey='dimension' tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                <Radar
                  dataKey='score'
                  fill='var(--color-score)'
                  fillOpacity={0.2}
                  name={localize('Average score', '平均得分')}
                  stroke='var(--color-score)'
                  strokeWidth={2}
                />
              </RadarChart>
            </ChartContainer>
            <div className='space-y-4'>
              {radar.dimensions.map((dimension) => {
                const labels = COMPETENCY_LABELS[dimension.dimensionId]
                const label = labels
                  ? localize(labels[0], labels[1])
                  : dimension.dimensionId
                return (
                  <div key={dimension.dimensionId} className='space-y-1.5'>
                    <Progress value={dimension.score}>
                      <ProgressLabel>{label}</ProgressLabel>
                      <ProgressValue>
                        {() => `${dimension.score}/100`}
                      </ProgressValue>
                    </Progress>
                    <div className='text-muted-foreground text-xs tabular-nums'>
                      {localize(
                        `${dimension.sampleCount} scored samples`,
                        `${dimension.sampleCount} 个有效评分样本`
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {!isPending && !isError && !hasRadar && (
          <div className='text-muted-foreground flex min-h-60 items-center justify-center text-center text-sm'>
            {localize(
              'Complete scored training sessions to build your competency profile.',
              '完成并获得评分的训练后，这里会展示能力画像。'
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TrainingActivityTimeline({
  sessions,
  isPending,
  isError,
  onRetry,
  locale,
  localize,
}: {
  sessions: ReviewSession[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
  locale: string
  localize: (english: string, chinese: string) => string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <History className='text-muted-foreground size-4' />
          {localize('Recent training activity', '近期训练时间线')}
        </CardTitle>
        <CardDescription>
          {localize(
            'Persisted TrainingSession activity in your current access scope',
            '当前身份权限范围内已持久化的训练会话'
          )}
        </CardDescription>
        <CardAction>
          <Button
            size='sm'
            variant='outline'
            render={<Link to='/training/sessions' />}
          >
            {localize('View all', '查看全部')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending && (
          <div className='space-y-3'>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton
                key={`training-activity-skeleton-${index + 1}`}
                className='h-12 w-full'
              />
            ))}
          </div>
        )}
        {isError && (
          <div className='text-muted-foreground flex min-h-28 flex-col items-center justify-center gap-3 text-sm'>
            <span>
              {localize(
                'Unable to load recent activity.',
                '无法加载近期训练。'
              )}
            </span>
            <Button size='sm' variant='outline' onClick={onRetry}>
              <RefreshCw />
              {localize('Retry', '重试')}
            </Button>
          </div>
        )}
        {!isPending && !isError && sessions.length === 0 && (
          <div className='text-muted-foreground flex min-h-28 flex-col items-center justify-center gap-3 text-center text-sm'>
            <span>
              {localize('No training activity yet.', '暂无训练记录。')}
            </span>
            <Button render={<Link to='/training/scenarios' />}>
              {localize('Browse scenarios', '查看场景')}
            </Button>
          </div>
        )}
        {!isPending && !isError && sessions.length > 0 && (
          <div className='divide-y'>
            {sessions.map((session) => (
              <div
                key={session.id}
                className='grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 first:pt-0 last:pb-0'
              >
                <div className='min-w-0'>
                  <Link
                    to='/training/sessions/$sessionId'
                    params={{ sessionId: session.id }}
                    className='hover:text-primary block truncate font-medium'
                  >
                    {session.title}
                  </Link>
                  <div className='text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
                    <span>
                      {formatDate(
                        session.completedAt ?? session.startedAt,
                        locale
                      )}
                    </span>
                    <span>{session.mode}</span>
                    {session.scoreStatus === 'ready' &&
                      session.score !== null && (
                        <span className='tabular-nums'>
                          {session.score}/100
                        </span>
                      )}
                  </div>
                </div>
                <StatusBadge
                  label={sessionStatusLabel(session.status, localize)}
                  variant={sessionStatusVariant(session.status)}
                  copyable={false}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ScenarioProgressDataTable({
  progress,
  total,
  pagination,
  onPaginationChange,
  ensurePageInRange,
  isFetching,
  locale,
  localize,
  scenarioTitles,
}: {
  progress: ScenarioProgress[]
  total: number
  pagination: PaginationState
  onPaginationChange: OnChangeFn<PaginationState>
  ensurePageInRange: (pageCount: number) => void
  isFetching: boolean
  locale: string
  localize: (english: string, chinese: string) => string
  scenarioTitles: ReadonlyMap<string, string>
}) {
  const columns = useMemo<ColumnDef<ScenarioProgress>[]>(
    () => [
      {
        id: 'scenario',
        header: localize('Scenario', '场景'),
        cell: ({ row }) =>
          scenarioTitles.get(row.original.scenarioId) ??
          row.original.scenarioId,
      },
      {
        id: 'status',
        header: localize('Status', '状态'),
        cell: ({ row }) => (
          <StatusBadge
            label={progressStatusLabel(row.original.status, localize)}
            variant={statusVariant(row.original.status)}
            copyable={false}
          />
        ),
      },
      {
        id: 'score',
        header: localize('Score', '得分'),
        cell: ({ row }) => {
          const item = row.original
          const scoreState = getTrainingGrowthScoreState(item)
          if (scoreState === 'ready') return `${item.score}/100`
          if (scoreState === 'pending') {
            return localize('Pending', '待评分')
          }
          if (scoreState === 'failed') {
            return localize('Unavailable', '不可用')
          }
          return localize('Not scored', '未评分')
        },
      },
      {
        id: 'last-practiced',
        header: localize('Last practiced', '最近练习'),
        cell: ({ row }) => formatDate(row.original.lastPracticedAt, locale),
      },
    ],
    [locale, localize, scenarioTitles]
  )
  const { table } = useDataTable({
    data: progress,
    columns,
    getRowId: (item) => item.scenarioId,
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
      isFetching={isFetching}
      emptyIcon={<Target />}
      emptyTitle={localize('No scenario progress yet', '暂无场景进度')}
      emptyDescription={localize(
        'Complete a scenario to see its latest status and score.',
        '完成一次场景训练后，这里会显示最新状态与评分。'
      )}
      emptyAction={
        <Button render={<Link to='/training/scenarios' />}>
          {localize('Browse scenarios', '查看场景')}
        </Button>
      }
      skeletonKeyPrefix='training-growth-skeleton'
      toolbarProps={null}
      fixedHeight={false}
      tableClassName='min-w-150'
      getColumnClassName={(columnId) => {
        if (columnId === 'scenario') return 'font-medium'
        if (columnId === 'score') return 'text-right tabular-nums'
        if (columnId === 'last-practiced') {
          return 'text-muted-foreground whitespace-nowrap text-right text-xs'
        }
        return undefined
      }}
    />
  )
}

function TrainingGrowthContent() {
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
  const progressQuery = useQuery({
    queryKey: [
      'training',
      'scenario-progress',
      host.apiBase,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      listScenarioProgress(host.apiBase, {
        skip: pagination.pageIndex * pagination.pageSize,
        limit: pagination.pageSize,
      }),
    enabled: host.authStatus === 'authenticated',
    placeholderData: (previousData) => previousData,
  })
  const summaryQuery = useQuery({
    queryKey: ['training', 'scenario-progress-summary', host.apiBase],
    queryFn: () => getScenarioProgressSummary(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const radarQuery = useQuery({
    queryKey: ['training', 'competency-radar', host.apiBase],
    queryFn: () => getTrainingCompetencyRadar(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const activityQuery = useQuery({
    queryKey: ['training', 'growth-activity', host.apiBase],
    queryFn: async () => {
      const [sessions, progress] = await Promise.all([
        listReviewSessions(host.apiBase, { skip: 0, limit: 20 }),
        listScenarioProgress(host.apiBase, { skip: 0, limit: 500 }),
      ])
      return selectRecentTrainingActivity(
        mergeReviewSessionScores(sessions.items, progress.items),
        6
      )
    },
    enabled: host.authStatus === 'authenticated',
  })
  const scenarioConfigQuery = useQuery({
    queryKey: ['training', 'scenario-config', host.apiBase],
    queryFn: () => getTrainingScenarioConfig(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const scenarioTitles = useMemo(
    () =>
      new Map(
        scenarioConfigQuery.data?.scenarios.map((scenario) => [
          scenario.id,
          scenario.title,
        ]) ?? []
      ),
    [scenarioConfigQuery.data]
  )
  const isLoading =
    host.authStatus === 'loading' ||
    progressQuery.isPending ||
    summaryQuery.isPending
  const error = progressQuery.error || summaryQuery.error

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

  if (error) {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Failed to load scenario progress', '场景进度加载失败')}
        </AlertTitle>
        <AlertDescription>
          {reviewRequestErrorMessage(
            error,
            localize('Request failed', '请求失败')
          )}
        </AlertDescription>
        <div className='col-start-2 mt-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void progressQuery.refetch()
              void summaryQuery.refetch()
            }}
          >
            <RefreshCw />
            {localize('Retry', '重试')}
          </Button>
        </div>
      </Alert>
    )
  }

  if (isLoading) return <GrowthSkeleton />

  const summary = summaryQuery.data
  if (!summary) return <GrowthSkeleton />

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-3'>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>
              {localize('Scenario completion', '场景完成度')}
            </CardTitle>
            <CardDescription>
              {localize('Latest status per scenario', '每个场景的最新状态')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={summary.completionPercentage}>
              <ProgressLabel>{localize('Completed', '已完成')}</ProgressLabel>
              <ProgressValue />
            </Progress>
            <div className='text-muted-foreground mt-2 text-xs tabular-nums'>
              {localize(
                `${summary.completedScenarios} of ${summary.trackedScenarios} scenarios`,
                `${summary.completedScenarios} / ${summary.trackedScenarios} 个场景`
              )}
            </div>
          </CardContent>
        </Card>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{localize('Average score', '平均得分')}</CardTitle>
            <CardDescription>
              {localize('Only completed evaluations', '仅基于已出结果的评估')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-semibold tabular-nums'>
              {summary.averageScore === null
                ? '-'
                : `${summary.averageScore}/100`}
            </div>
            <div className='text-muted-foreground mt-2 text-xs tabular-nums'>
              {localize(
                `${summary.scoredScenarios} scored scenarios`,
                `${summary.scoredScenarios} 个已评分场景`
              )}
            </div>
          </CardContent>
        </Card>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{localize('Review records', '复盘记录')}</CardTitle>
            <CardDescription>
              {localize(
                'Inspect individual training sessions',
                '查看单次训练记录'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant='outline'
              size='sm'
              render={<Link to='/training/sessions' />}
            >
              {localize('Open reviews', '打开复盘')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <TrainingCompetencyRadarCard
        radar={radarQuery.data}
        isPending={radarQuery.isPending}
        isError={radarQuery.isError}
        onRetry={() => void radarQuery.refetch()}
        localize={localize}
        userName={
          host.user?.displayName ||
          host.user?.username ||
          localize('Current learner', '当前学员')
        }
      />

      <TrainingActivityTimeline
        sessions={activityQuery.data ?? []}
        isPending={activityQuery.isPending}
        isError={activityQuery.isError}
        onRetry={() => void activityQuery.refetch()}
        locale={i18n.language}
        localize={localize}
      />

      <ScenarioProgressDataTable
        progress={progressQuery.data?.items ?? []}
        total={progressQuery.data?.total ?? 0}
        pagination={pagination}
        onPaginationChange={onPaginationChange}
        ensurePageInRange={ensurePageInRange}
        isFetching={progressQuery.isFetching}
        locale={i18n.language}
        localize={localize}
        scenarioTitles={scenarioTitles}
      />
    </div>
  )
}

export function TrainingGrowthPage() {
  const { i18n, t } = useTranslation()
  const title = t('Growth', {
    defaultValue: i18n.language.startsWith('zh') ? '成长' : 'Growth',
  })

  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>{title}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <TrainingGrowthContent />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

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
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleAlert,
  ClipboardCheck,
  ListChecks,
  MessagesSquare,
  RefreshCw,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AnnouncementsPanel } from '@/features/dashboard/components/overview/announcements-panel'
import { FAQPanel } from '@/features/dashboard/components/overview/faq-panel'
import { useDashboardContentVisibility } from '@/features/dashboard/hooks/use-status-data'
import { cn } from '@/lib/utils'

import { useTrainingHost } from '../host'
import {
  getScenarioProgressSummary,
  listReviewSessions,
  listScenarioProgress,
  reviewRequestErrorMessage,
} from '../review/api'
import type { ReviewSession, TrainingSessionStatus } from '../review/types'
import {
  listTrainingScenarios,
  trainingRequestErrorMessage,
} from '../scenarios/api'
import type {
  TrainingScenarioCategory,
  TrainingScenarioDifficulty,
} from '../scenarios/types'
import {
  selectTrainingOverviewRecommendation,
  type TrainingOverviewRecommendationReason,
} from './training-overview-contract'

const RECENT_SESSIONS_LIMIT = 3
const SCENARIO_PROGRESS_LIMIT = 100
const TRAINING_SETUP_GUIDE_VISIBILITY_STORAGE_KEY =
  'training_overview_setup_guide_expanded'

type Localize = (english: string, chinese: string) => string

function formatDate(value: string | null, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function sessionStatusVariant(status: TrainingSessionStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'failed') return 'danger' as const
  if (status === 'active') return 'warning' as const
  return 'info' as const
}

function sessionStatusLabel(status: TrainingSessionStatus, localize: Localize) {
  const labels: Record<TrainingSessionStatus, readonly [string, string]> = {
    active: ['Active', '进行中'],
    completed: ['Completed', '已完成'],
    created: ['Created', '已创建'],
    failed: ['Failed', '失败'],
  }
  return localize(...labels[status])
}

function sessionModeLabel(mode: ReviewSession['mode'], localize: Localize) {
  const labels: Record<ReviewSession['mode'], readonly [string, string]> = {
    realtime: ['Realtime voice', '实时语音'],
    text: ['Text', '文本'],
    video: ['Video', '视频'],
    voice: ['Voice', '语音'],
  }
  return localize(...labels[mode])
}

function categoryLabel(value: TrainingScenarioCategory, localize: Localize) {
  const labels: Record<TrainingScenarioCategory, readonly [string, string]> = {
    sales: ['Sales', '销售'],
    customer_service: ['Customer service', '客户服务'],
    negotiation: ['Negotiation', '谈判'],
    interview: ['Interview', '面试'],
    workplace: ['Workplace', '职场'],
  }
  return localize(...labels[value])
}

function difficultyLabel(
  value: TrainingScenarioDifficulty,
  localize: Localize
) {
  const labels: Record<TrainingScenarioDifficulty, readonly [string, string]> =
    {
      easy: ['Easy', '简单'],
      medium: ['Medium', '中等'],
      hard: ['Hard', '困难'],
      expert: ['Expert', '专家'],
    }
  return localize(...labels[value])
}

function recommendationReasonLabel(
  reason: TrainingOverviewRecommendationReason,
  localize: Localize
) {
  const labels: Record<
    TrainingOverviewRecommendationReason,
    readonly [string, string]
  > = {
    in_progress: ['Continue an active practice', '继续进行中的训练'],
    required: ['Required scenario to finish first', '必练场景，建议先完成'],
    not_started: ['A good place to begin', '适合作为下一次练习'],
    failed: ['Recovery practice after a failed run', '上次未通过，适合补练'],
    score_below_target: ['Score has room to improve', '分数还有提升空间'],
    warm_up: ['Good warm-up scenario', '适合直接热身'],
  }
  return localize(...labels[reason])
}

function OverviewSkeleton() {
  return (
    <div className='space-y-3'>
      <div className='grid gap-3 md:grid-cols-3'>
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={`training-overview-summary-skeleton-${index + 1}`}>
            <CardHeader>
              <Skeleton className='h-4 w-28' />
              <Skeleton className='h-3 w-44' />
            </CardHeader>
            <CardContent className='space-y-3'>
              <Skeleton className='h-7 w-20' />
              <Skeleton className='h-2 w-full' />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='grid gap-3 xl:grid-cols-2'>
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={`training-overview-detail-skeleton-${index + 1}`}>
            <CardHeader>
              <Skeleton className='h-5 w-40' />
              <Skeleton className='h-3 w-56' />
            </CardHeader>
            <CardContent className='space-y-3'>
              <Skeleton className='h-16 w-full' />
              <Skeleton className='h-16 w-full' />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function OverviewRequestError({
  error,
  title,
  fallback,
  retryLabel,
  errorMessage,
  onRetry,
}: {
  error: unknown
  title: string
  fallback: string
  retryLabel: string
  errorMessage: (error: unknown, fallback: string) => string
  onRetry: () => void
}) {
  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errorMessage(error, fallback)}</AlertDescription>
      <div className='col-start-2 mt-2'>
        <Button variant='outline' size='sm' onClick={onRetry}>
          <RefreshCw />
          {retryLabel}
        </Button>
      </div>
    </Alert>
  )
}

function RecentSessions({
  sessions,
  locale,
  localize,
}: {
  sessions: ReviewSession[]
  locale: string
  localize: Localize
}) {
  return (
    <Card className='h-full'>
      <CardHeader>
        <CardAction>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={localize('View all sessions', '查看全部训练记录')}
            render={<Link to='/training/sessions' />}
          >
            <ArrowRight />
          </Button>
        </CardAction>
        <CardTitle>{localize('Recent training', '最近训练')}</CardTitle>
        <CardDescription>
          {localize(
            'Return to a session or review its selected path.',
            '回到已开始的训练，或复盘已选择的对话路径。'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <Empty className='border-none py-6'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <ClipboardCheck />
              </EmptyMedia>
              <EmptyTitle>
                {localize('No training sessions yet', '暂无训练记录')}
              </EmptyTitle>
              <EmptyDescription>
                {localize(
                  'Created and completed sessions will appear here.',
                  '创建或完成的训练会话会显示在这里。'
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant='outline'
                size='sm'
                render={<Link to='/training/scenarios' />}
              >
                <MessagesSquare />
                {localize('Browse scenarios', '浏览训练场景')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className='divide-y rounded-lg border'>
            {sessions.map((session) => (
              <Link
                key={session.id}
                to='/training/sessions/$sessionId'
                params={{ sessionId: session.id }}
                className='hover:bg-muted/50 flex items-center gap-3 px-3 py-3 transition-colors'
              >
                <div className='min-w-0 flex-1'>
                  <div className='truncate text-sm font-medium'>
                    {session.title}
                  </div>
                  <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs'>
                    <span>{sessionModeLabel(session.mode, localize)}</span>
                    <span>
                      {formatDate(
                        session.completedAt || session.startedAt,
                        locale
                      )}
                    </span>
                  </div>
                </div>
                <StatusBadge
                  label={sessionStatusLabel(session.status, localize)}
                  variant={sessionStatusVariant(session.status)}
                  copyable={false}
                />
                <ArrowRight className='text-muted-foreground size-4 shrink-0' />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type TrainingSetupPath =
  | '/training/scenarios'
  | '/training/sessions'
  | '/training/growth'

type TrainingSetupStep = {
  title: string
  description: string
  to: TrainingSetupPath
  icon: LucideIcon
  completed: boolean
}

type TrainingQuickAction = Omit<TrainingSetupStep, 'completed'>

function getSavedTrainingSetupGuideExpanded(): boolean | null {
  if (typeof window === 'undefined') return null
  const saved = window.localStorage.getItem(
    TRAINING_SETUP_GUIDE_VISIBILITY_STORAGE_KEY
  )
  if (saved === 'expanded') return true
  if (saved === 'collapsed') return false
  return null
}

function saveTrainingSetupGuideExpanded(expanded: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    TRAINING_SETUP_GUIDE_VISIBILITY_STORAGE_KEY,
    expanded ? 'expanded' : 'collapsed'
  )
}

function TrainingSetupStepItem(props: {
  step: TrainingSetupStep
  index: number
  isLast: boolean
}) {
  const Icon = props.step.icon
  const StatusIcon = props.step.completed ? Check : Circle

  return (
    <li className='relative flex gap-3 pb-2.5 last:pb-0'>
      {!props.isLast && (
        <span
          className='bg-border absolute top-9 bottom-0 left-4 w-px'
          aria-hidden='true'
        />
      )}
      <span
        className={cn(
          'bg-background relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border shadow-xs',
          props.step.completed && 'border-success/30 bg-success/10'
        )}
      >
        <StatusIcon
          className={props.step.completed ? 'text-success size-4' : 'size-4'}
          aria-hidden='true'
        />
      </span>

      <Link
        to={props.step.to}
        className='bg-background/70 hover:bg-muted/50 focus-visible:ring-ring flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left shadow-xs transition-colors outline-none focus-visible:ring-2'
      >
        <span className='flex min-w-0 items-start gap-2.5'>
          <span className='bg-muted mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg'>
            <Icon className='size-3.5' aria-hidden='true' />
          </span>
          <span className='flex min-w-0 flex-col gap-0.5'>
            <span className='flex items-center gap-2 text-sm font-medium'>
              <span className='text-muted-foreground font-mono text-xs tabular-nums'>
                {props.index + 1}.
              </span>
              <span className='truncate'>{props.step.title}</span>
            </span>
            <span className='text-muted-foreground line-clamp-1 text-xs'>
              {props.step.description}
            </span>
          </span>
        </span>
        <ArrowRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Link>
    </li>
  )
}

function TrainingQuickActionItem(props: { action: TrainingQuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='outline'
      className='h-auto justify-start rounded-xl px-3 py-3 text-left'
      render={<Link to={props.action.to} />}
    >
      <span className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg'>
        <Icon className='size-4' aria-hidden='true' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate text-sm font-medium'>
          {props.action.title}
        </span>
        <span className='text-muted-foreground line-clamp-2 text-xs leading-relaxed'>
          {props.action.description}
        </span>
      </span>
    </Button>
  )
}

function CompactTrainingQuickAction(props: { action: TrainingQuickAction }) {
  const Icon = props.action.icon

  return (
    <Button
      variant='outline'
      size='sm'
      className='bg-background/70 h-8 min-w-24 gap-1.5 px-2.5'
      render={<Link to={props.action.to} />}
    >
      <Icon data-icon='inline-start' />
      <span>{props.action.title}</span>
    </Button>
  )
}

function TrainingSetupGuide({
  hasPracticed,
  hasSessions,
  hasCompletedReview,
  localize,
}: {
  hasPracticed: boolean
  hasSessions: boolean
  hasCompletedReview: boolean
  localize: Localize
}) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(() =>
    getSavedTrainingSetupGuideExpanded()
  )
  const steps: TrainingSetupStep[] = [
    {
      title: localize('Choose a scenario', '选择场景'),
      description: localize(
        'Pick a real conversation to practice.',
        '选择一个真实沟通场景开始练习。'
      ),
      to: '/training/scenarios',
      icon: MessagesSquare,
      completed: hasPracticed,
    },
    {
      title: localize('Start training', '开始训练'),
      description: localize(
        'Complete a focused practice session.',
        '完成一次聚焦的场景练习。'
      ),
      to: '/training/scenarios',
      icon: ListChecks,
      completed: hasSessions,
    },
    {
      title: localize('Review and improve', '复盘并改进'),
      description: localize(
        'Turn feedback into your next action.',
        '将反馈转化为下一次行动。'
      ),
      to: '/training/sessions',
      icon: ClipboardCheck,
      completed: hasCompletedReview,
    },
  ]
  const quickActions: TrainingQuickAction[] = [
    {
      title: localize('Scenarios', '场景训练'),
      description: localize(
        'Choose the next situation to practice.',
        '选择下一次要练习的真实场景。'
      ),
      to: '/training/scenarios',
      icon: MessagesSquare,
    },
    {
      title: localize('Review', '复盘'),
      description: localize(
        'Return to sessions and selected conversation paths.',
        '回看训练会话和已选择的对话路径。'
      ),
      to: '/training/sessions',
      icon: ClipboardCheck,
    },
    {
      title: localize('Growth', '成长'),
      description: localize(
        'Find recurring strengths and the next improvement area.',
        '发现反复出现的优势和下一项改进重点。'
      ),
      to: '/training/growth',
      icon: BarChart3,
    },
  ]
  const completedStepCount = steps.filter((step) => step.completed).length
  const setupComplete = completedStepCount === steps.length
  const setupGuideExpanded = manualExpanded ?? !setupComplete

  const handleToggle = () => {
    const nextExpanded = !setupGuideExpanded
    setManualExpanded(nextExpanded)
    saveTrainingSetupGuideExpanded(nextExpanded)
  }

  if (setupGuideExpanded) {
    return (
      <CardStaggerContainer className='grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'>
        <CardStaggerItem className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
          <div className='h-full p-4 sm:p-5'>
            <div className='flex h-full min-w-0 flex-col gap-5'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='flex max-w-2xl flex-col gap-1'>
                  <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wider uppercase'>
                    <ListChecks className='size-3.5' aria-hidden='true' />
                    {localize('Get started', '开始训练')}
                  </div>
                  <h3 className='text-xl font-semibold tracking-tight sm:text-2xl'>
                    {localize(
                      'Build a repeatable training loop',
                      '建立可重复的训练闭环'
                    )}
                  </h3>
                  <p className='text-muted-foreground max-w-xl text-sm leading-relaxed'>
                    {localize(
                      'Choose a scenario, complete a focused practice, and turn feedback into your next action.',
                      '选择场景，完成一次聚焦练习，并将反馈转化为下一次行动。'
                    )}
                  </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Button variant='outline' size='sm' onClick={handleToggle}>
                    <ChevronUp data-icon='inline-start' />
                    {localize('Hide training guide', '收起训练引导')}
                  </Button>
                  <Button size='sm' render={<Link to='/training/scenarios' />}>
                    <MessagesSquare data-icon='inline-start' />
                    {localize('Start training', '开始训练')}
                  </Button>
                </div>
              </div>

              <ol className='bg-background/45 rounded-2xl border p-2'>
                {steps.map((step, index) => (
                  <TrainingSetupStepItem
                    key={step.title}
                    step={step}
                    index={index}
                    isLast={index === steps.length - 1}
                  />
                ))}
              </ol>
            </div>
          </div>
        </CardStaggerItem>

        <CardStaggerItem className='bg-card h-full rounded-2xl border p-4 shadow-xs sm:p-5'>
          <div className='flex h-full flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <div className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                {localize('Next actions', '下一步行动')}
              </div>
              <h3 className='text-lg font-semibold tracking-tight'>
                {localize('Keep your practice moving', '持续推进练习')}
              </h3>
            </div>
            <div className='grid gap-2'>
              {quickActions.map((action) => (
                <TrainingQuickActionItem key={action.title} action={action} />
              ))}
            </div>
          </div>
        </CardStaggerItem>
      </CardStaggerContainer>
    )
  }

  return (
    <CardStaggerContainer>
      <CardStaggerItem className='bg-card overflow-hidden rounded-2xl border shadow-xs'>
        <div className='px-4 py-3 sm:px-5'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <span className='bg-background/70 flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-xs'>
                <Check className='text-success size-4' aria-hidden='true' />
              </span>
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <h3 className='truncate text-sm font-semibold'>
                    {setupComplete
                      ? localize('Training guide complete', '训练引导已完成')
                      : localize('Training guide', '训练引导')}
                  </h3>
                  <span className='text-muted-foreground bg-background/60 rounded-md border px-2 py-0.5 text-xs'>
                    {localize(
                      `Training progress: ${completedStepCount}/${steps.length}`,
                      `训练进度：${completedStepCount}/${steps.length}`
                    )}
                  </span>
                </div>
                <p className='text-muted-foreground line-clamp-1 text-xs'>
                  {setupComplete
                    ? localize(
                        'Your guide is collapsed so current training stays in focus.',
                        '训练引导已收起，当前训练信息保持在焦点位置。'
                      )
                    : localize(
                        'The guide is collapsed. Expand it whenever you need it.',
                        '训练引导已收起，需要时可随时展开。'
                      )}
                </p>
              </div>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              {quickActions.map((action) => (
                <CompactTrainingQuickAction
                  key={action.title}
                  action={action}
                />
              ))}
              <Button
                variant='outline'
                size='sm'
                className='bg-background/70 h-8 min-w-28'
                onClick={handleToggle}
              >
                <ChevronDown data-icon='inline-start' />
                {localize('Show training guide', '显示训练引导')}
              </Button>
            </div>
          </div>
        </div>
      </CardStaggerItem>
    </CardStaggerContainer>
  )
}

export function TrainingOverview() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const { announcements: showAnnouncements, faq: showFAQ } =
    useDashboardContentVisibility()
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const scenariosQuery = useQuery({
    queryKey: ['training', 'overview', 'scenarios', host.apiBase],
    queryFn: () => listTrainingScenarios(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const progressQuery = useQuery({
    queryKey: [
      'training',
      'overview',
      'scenario-progress',
      host.apiBase,
      SCENARIO_PROGRESS_LIMIT,
    ],
    queryFn: () =>
      listScenarioProgress(host.apiBase, {
        skip: 0,
        limit: SCENARIO_PROGRESS_LIMIT,
      }),
    enabled: host.authStatus === 'authenticated',
  })
  const summaryQuery = useQuery({
    queryKey: ['training', 'overview', 'progress-summary', host.apiBase],
    queryFn: () => getScenarioProgressSummary(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const sessionsQuery = useQuery({
    queryKey: [
      'training',
      'overview',
      'recent-sessions',
      host.apiBase,
      RECENT_SESSIONS_LIMIT,
    ],
    queryFn: () =>
      listReviewSessions(host.apiBase, {
        skip: 0,
        limit: RECENT_SESSIONS_LIMIT,
      }),
    enabled: host.authStatus === 'authenticated',
  })
  const recommendation = useMemo(
    () =>
      selectTrainingOverviewRecommendation(
        scenariosQuery.data ?? [],
        progressQuery.data?.items ?? []
      ),
    [progressQuery.data?.items, scenariosQuery.data]
  )

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

  if (
    host.authStatus === 'loading' ||
    scenariosQuery.isPending ||
    progressQuery.isPending ||
    summaryQuery.isPending ||
    sessionsQuery.isPending
  ) {
    return <OverviewSkeleton />
  }

  const summary = summaryQuery.data
  const recommendationUnavailable =
    scenariosQuery.isError || progressQuery.isError

  return (
    <div className='space-y-3'>
      {recommendationUnavailable && (
        <OverviewRequestError
          error={scenariosQuery.error || progressQuery.error}
          title={localize(
            'Failed to load training recommendation',
            '训练推荐加载失败'
          )}
          fallback={localize('Request failed', '请求失败')}
          retryLabel={localize('Retry', '重试')}
          errorMessage={trainingRequestErrorMessage}
          onRetry={() => {
            void scenariosQuery.refetch()
            void progressQuery.refetch()
          }}
        />
      )}
      {summaryQuery.isError && (
        <OverviewRequestError
          error={summaryQuery.error}
          title={localize(
            'Failed to load training progress',
            '训练进度加载失败'
          )}
          fallback={localize('Request failed', '请求失败')}
          retryLabel={localize('Retry', '重试')}
          errorMessage={reviewRequestErrorMessage}
          onRetry={() => void summaryQuery.refetch()}
        />
      )}
      {sessionsQuery.isError && (
        <OverviewRequestError
          error={sessionsQuery.error}
          title={localize('Failed to load recent training', '最近训练加载失败')}
          fallback={localize('Request failed', '请求失败')}
          retryLabel={localize('Retry', '重试')}
          errorMessage={reviewRequestErrorMessage}
          onRetry={() => void sessionsQuery.refetch()}
        />
      )}

      <TrainingSetupGuide
        hasPracticed={Boolean(summary?.trackedScenarios)}
        hasSessions={(sessionsQuery.data?.items.length ?? 0) > 0}
        hasCompletedReview={Boolean(summary?.completedScenarios)}
        localize={localize}
      />

      <div className='grid gap-3 md:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>
              {localize('Scenario completion', '场景完成度')}
            </CardTitle>
            <CardDescription>
              {localize(
                'Latest status for each practiced scenario.',
                '每个已练习场景的最新状态。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summary ? (
              <>
                <Progress value={summary.completionPercentage}>
                  <ProgressLabel>
                    {localize('Completed', '已完成')}
                  </ProgressLabel>
                  <ProgressValue />
                </Progress>
                <div className='text-muted-foreground mt-2 text-xs tabular-nums'>
                  {localize(
                    `${summary.completedScenarios} of ${summary.trackedScenarios} scenarios`,
                    `${summary.completedScenarios} / ${summary.trackedScenarios} 个场景`
                  )}
                </div>
              </>
            ) : (
              <div className='text-muted-foreground text-sm'>
                {localize('Progress is unavailable.', '进度暂不可用。')}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{localize('Average score', '平均得分')}</CardTitle>
            <CardDescription>
              {localize(
                'Based on completed evaluations.',
                '仅基于已出结果的评估。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-semibold tabular-nums'>
              {summary?.averageScore ?? '-'}
            </div>
            {summary && (
              <div className='text-muted-foreground mt-2 text-xs tabular-nums'>
                {localize(
                  `${summary.scoredScenarios} scored scenarios`,
                  `${summary.scoredScenarios} 个已评分场景`
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{localize('Training sessions', '训练次数')}</CardTitle>
            <CardDescription>
              {localize(
                'All training sessions you have started.',
                '累计发起的训练会话。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-semibold tabular-nums'>
              {sessionsQuery.data?.total ?? '-'}
            </div>
            <div className='text-muted-foreground mt-2 text-xs'>
              {localize(
                'Open a record to review its selected path.',
                '打开记录即可复盘已选择的对话路径。'
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant='outline'
              size='sm'
              render={<Link to='/training/sessions' />}
            >
              <ClipboardCheck />
              {localize('View review', '查看复盘')}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className='grid gap-3 xl:grid-cols-2'>
        <Card className='h-full'>
          <CardHeader>
            <CardAction>
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={localize('Open scenarios', '打开训练场景')}
                render={<Link to='/training/scenarios' />}
              >
                <ArrowRight />
              </Button>
            </CardAction>
            <CardTitle>
              {localize('Recommended scenario', '推荐训练场景')}
            </CardTitle>
            <CardDescription>
              {localize(
                'The next practice is selected from your real training progress.',
                '下一次练习基于真实训练进度选择。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!recommendationUnavailable && recommendation ? (
              <div className='space-y-3'>
                <div className='flex flex-wrap gap-1.5'>
                  <Badge variant='secondary'>
                    {categoryLabel(recommendation.scenario.category, localize)}
                  </Badge>
                  <Badge variant='outline'>
                    {difficultyLabel(
                      recommendation.scenario.difficulty,
                      localize
                    )}
                  </Badge>
                  {recommendation.scenario.required && (
                    <Badge variant='outline'>
                      {localize('Required', '必练')}
                    </Badge>
                  )}
                </div>
                <div>
                  <div className='font-medium'>
                    {recommendation.scenario.title}
                  </div>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {recommendation.scenario.description}
                  </p>
                </div>
                <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                  <Target className='size-4 shrink-0' />
                  <span>
                    {recommendationReasonLabel(recommendation.reason, localize)}
                  </span>
                </div>
              </div>
            ) : (
              !recommendationUnavailable && (
                <Empty className='border-none py-6'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <MessagesSquare />
                    </EmptyMedia>
                    <EmptyTitle>
                      {localize('No scenarios available', '暂无可用训练场景')}
                    </EmptyTitle>
                    <EmptyDescription>
                      {localize(
                        'Published training scenarios will appear here.',
                        '已发布的训练场景会显示在这里。'
                      )}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            )}
          </CardContent>
          {!recommendationUnavailable && (
            <CardFooter>
              <Button size='sm' render={<Link to='/training/scenarios' />}>
                <MessagesSquare />
                {recommendation
                  ? localize('Open scenario', '打开场景')
                  : localize('Browse scenarios', '浏览训练场景')}
              </Button>
            </CardFooter>
          )}
        </Card>

        {!sessionsQuery.isError && (
          <RecentSessions
            sessions={sessionsQuery.data?.items ?? []}
            locale={i18n.language}
            localize={localize}
          />
        )}
      </div>

      {(showAnnouncements || showFAQ) && (
        <div className='grid gap-3 xl:grid-cols-2'>
          {showAnnouncements && <AnnouncementsPanel />}
          {showFAQ && <FAQPanel />}
        </div>
      )}
    </div>
  )
}

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
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle, RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from 'recharts'

import { SectionPageLayout } from '@/components/layout'
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { CheckinSummaryCard } from '@/features/profile/components/checkin-summary-card'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { getTrainingScenarioConfig } from '../config/api'
import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  getTrainingCompetencyRadar,
  reviewRequestErrorMessage,
} from '../review/api'
import type { TrainingCompetencyRadar } from '../review/types'
import { CommunicationProfileCard } from './communication-profile-card'
import { getTrainingGrowthProfileState } from './contract'
import {
  generateTrainingProfileCard,
  type TrainingProfileCard,
} from './profile-card'
import { TrainingCareerPathCard } from './training-career-path-card'
import { getTrainingPointsSummary } from './training-points'
import { TrainingPointsCard } from './training-points-card'

const COMPETENCY_LABELS: Record<string, [string, string]> = {
  attentiveness: ['Attentiveness', '倾听关注'],
  expression: ['Clear expression', '表达清晰'],
  coordination: ['Coordination', '互动协调'],
  composure: ['Composure', '沉着应对'],
}

const COMPETENCY_DIMENSION_IDS = [
  'attentiveness',
  'expression',
  'coordination',
  'composure',
] as const

const competencyRadarChartConfig = {
  score: {
    label: 'Observed level',
    color: 'var(--chart-1)',
  },
  baseline: {
    label: 'Reference outline',
    color: 'var(--muted-foreground)',
  },
} satisfies ChartConfig

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

function TrainingProfileDialog({
  open,
  onOpenChange,
  localize,
  learnerName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  localize: (english: string, chinese: string) => string
  learnerName: string
}) {
  const profileMutation = useMutation<TrainingProfileCard>({
    mutationFn: generateTrainingProfileCard,
  })
  const card = profileMutation.data
  const hasProfile = Boolean(card && Object.keys(card.scores).length > 0)

  useEffect(() => {
    if (open && profileMutation.isIdle) profileMutation.mutate()
  }, [open, profileMutation.isIdle, profileMutation.mutate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {localize('Communication profile', '\u6c9f\u901a\u540d\u7247')}
          </DialogTitle>
          <DialogDescription>
            {localize(
              'Generated from evaluated training data for the current account.',
              '\u57fa\u4e8e\u5f53\u524d\u8d26\u53f7\u7684\u5df2\u8bc4\u4f30\u8bad\u7ec3\u6570\u636e\u751f\u6210\u3002'
            )}
          </DialogDescription>
        </DialogHeader>

        {profileMutation.isPending && (
          <div className='text-muted-foreground flex min-h-52 items-center justify-center gap-2 text-sm'>
            <LoaderCircle className='size-4 animate-spin' />
            {localize('Generating profile...', '\u6b63\u5728\u751f\u6210\u540d\u7247...')}
          </div>
        )}

        {profileMutation.isError && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>
              {localize(
                'Unable to generate profile',
                '\u65e0\u6cd5\u751f\u6210\u6c9f\u901a\u540d\u7247'
              )}
            </AlertTitle>
            <AlertDescription>
              {reviewRequestErrorMessage(
                profileMutation.error,
                localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
              )}
            </AlertDescription>
          </Alert>
        )}

        {card && !hasProfile && (
          <Alert>
            <CircleAlert />
            <AlertTitle>
              {localize(
                'More evaluated sessions required',
                '\u9700\u8981\u66f4\u591a\u5df2\u8bc4\u4f30\u8bad\u7ec3'
              )}
            </AlertTitle>
            <AlertDescription>
              {card.summary ||
                localize(
                  'Complete at least two evaluated sessions before generating a profile.',
                  '\u81f3\u5c11\u5b8c\u6210\u4e24\u6b21\u5df2\u8bc4\u4f30\u8bad\u7ec3\u540e\u518d\u751f\u6210\u540d\u7247\u3002'
                )}
            </AlertDescription>
          </Alert>
        )}

        {card && hasProfile && (
          <CommunicationProfileCard
            card={card}
            learnerName={learnerName}
            localize={localize}
          />
        )}

        <DialogFooter>
          <DialogClose render={<Button variant='outline' />}>
            {localize('Close', '\u5173\u95ed')}
          </DialogClose>
          <Button
            onClick={() => profileMutation.mutate()}
            disabled={profileMutation.isPending}
          >
            {profileMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <RefreshCw />
            )}
            {card
              ? localize('Regenerate', '\u91cd\u65b0\u751f\u6210')
              : localize('Generate profile', '\u751f\u6210\u6c9f\u901a\u540d\u7247')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TrainingCompetencyRadarCard({
  radar,
  isPending,
  isError,
  onRetry,
  onGenerateProfile,
  localize,
  userName,
}: {
  radar: TrainingCompetencyRadar | undefined
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onGenerateProfile: () => void
  localize: (english: string, chinese: string) => string
  userName: string
}) {
  const hasRadar = getTrainingGrowthProfileState(radar) === 'ready'
  const dimensionsById = new Map(
    (radar?.dimensions ?? []).map((dimension) => [
      dimension.dimensionId,
      dimension,
    ])
  )
  const chartData = COMPETENCY_DIMENSION_IDS.map((dimensionId) => {
    const labels = COMPETENCY_LABELS[dimensionId]
    return {
      dimension: localize(labels[0], labels[1]),
      score: dimensionsById.get(dimensionId)?.score ?? 0,
      baseline: hasRadar ? undefined : 18,
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <UserRound className='text-muted-foreground size-4' />
          {localize(
            'Communication competency radar',
            '\u6c9f\u901a\u80fd\u529b\u96f7\u8fbe'
          )}
        </CardTitle>
        <CardDescription>{userName}</CardDescription>
        <CardAction className='flex items-center gap-2'>
          <Badge variant={hasRadar ? 'secondary' : 'outline'}>
            {hasRadar && radar
              ? localize(
                  `${radar.sampleSize} evaluated sessions`,
                  `${radar.sampleSize} \u6b21\u5df2\u8bc4\u4f30\u8bad\u7ec3`
                )
              : localize('No evaluation data', '\u6682\u65e0\u8bc4\u4f30\u6570\u636e')}
          </Badge>
          <Button
            size='sm'
            variant='outline'
            onClick={onGenerateProfile}
          >
            <UserRound />
            {localize(
              'Generate profile card',
              '\u751f\u6210\u6c9f\u901a\u540d\u7247'
            )}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className='mx-auto size-70 rounded-full' />}
        {isError && (
          <div className='text-muted-foreground flex min-h-60 flex-col items-center justify-center gap-3 text-sm'>
            <span>
              {localize(
                'Unable to load competency observations.',
                '无法加载能力观察。'
              )}
            </span>
            <Button size='sm' variant='outline' onClick={onRetry}>
              <RefreshCw />
              {localize('Retry', '重试')}
            </Button>
          </div>
        )}
        {!isPending && !isError && (
          <div className='grid items-center gap-6 lg:grid-cols-2'>
            <ChartContainer
              className='mx-auto aspect-square h-72 w-full max-w-md'
              config={competencyRadarChartConfig}
            >
              <RadarChart data={chartData} outerRadius='72%'>
                <PolarGrid />
                <PolarAngleAxis dataKey='dimension' tick={{ fontSize: 12 }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                <Radar
                  dataKey='score'
                  fill='var(--color-score)'
                  fillOpacity={0.2}
                  name={localize('Observed level', '观察水平')}
                  stroke='var(--color-score)'
                  strokeWidth={2}
                />
                {!hasRadar && (
                  <Radar
                    dataKey='baseline'
                    fill='none'
                    name={localize('Reference outline', '参考轮廓')}
                    stroke='var(--muted-foreground)'
                    strokeDasharray='4 4'
                    strokeOpacity={0.45}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                )}
              </RadarChart>
            </ChartContainer>
            <div className='space-y-4'>
              {COMPETENCY_DIMENSION_IDS.map((dimensionId) => {
                const dimension = dimensionsById.get(dimensionId)
                const labels = COMPETENCY_LABELS[dimensionId]
                const label = localize(labels[0], labels[1])
                return (
                  <div key={dimensionId} className='space-y-1.5'>
                    <Progress value={dimension?.score ?? 0}>
                      <ProgressLabel>{label}</ProgressLabel>
                      <ProgressValue>
                        {() =>
                          dimension
                            ? `${dimension.score}/100`
                            : localize('Not observed', '未观察')
                        }
                      </ProgressValue>
                    </Progress>
                    {dimension && (
                      <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-xs tabular-nums'>
                        <span>
                          {localize(
                            `${dimension.sampleCount} valid observations across ${dimension.scenarioCount} scenarios`,
                            `${dimension.sampleCount} 个有效观察，覆盖 ${dimension.scenarioCount} 个场景`
                          )}
                        </span>
                        <Badge variant='outline'>
                          {dimension.state === 'stable'
                            ? localize('Stable estimate', '稳定估计')
                            : localize('Exploring', '探索中')}
                        </Badge>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TrainingGrowthContent() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const { status } = useStatus()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const pointsQuery = useQuery({
    queryKey: ['training', 'training-points', host.apiBase],
    queryFn: () => getTrainingPointsSummary(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const radarQuery = useQuery({
    queryKey: ['training', 'competency-radar', host.apiBase],
    queryFn: () => getTrainingCompetencyRadar(host.apiBase),
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
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [checkinApiAvailable, setCheckinApiAvailable] = useState(true)
  const checkinEnabled = status?.checkin_enabled === true
  const showCheckin = checkinEnabled && checkinApiAvailable
  const turnstileEnabled = !!(
    status?.turnstile_check && status?.turnstile_site_key
  )
  const turnstileSiteKey = status?.turnstile_site_key || ''
  const learnerName =
    host.user?.displayName ||
    host.user?.username ||
    localize('Current learner', '\u5f53\u524d\u5b66\u5458')
  const isLoading = host.authStatus === 'loading'

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

  if (isLoading) return <GrowthSkeleton />

  return (
    <div className='space-y-3'>
      <div
        className={cn(
          'grid gap-3',
          showCheckin &&
            'lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-stretch'
        )}
      >
        <TrainingPointsCard
          summary={pointsQuery.data}
          isPending={pointsQuery.isPending}
          errorMessage={
            pointsQuery.isError
              ? reviewRequestErrorMessage(
                  pointsQuery.error,
                  localize(
                    'Unable to load Training Points.',
                    '\u65e0\u6cd5\u52a0\u8f7d\u8bad\u7ec3\u79ef\u5206\u3002'
                  )
                )
              : null
          }
          onRetry={() => void pointsQuery.refetch()}
          localize={localize}
        />
        {checkinEnabled && (
          <CheckinSummaryCard
            checkinEnabled={checkinEnabled}
            turnstileEnabled={turnstileEnabled}
            turnstileSiteKey={turnstileSiteKey}
            onAvailabilityChange={setCheckinApiAvailable}
          />
        )}
      </div>
      <TrainingCareerPathCard
        summary={pointsQuery.data}
        isPending={pointsQuery.isPending}
        errorMessage={
          pointsQuery.isError
            ? reviewRequestErrorMessage(
                pointsQuery.error,
                localize(
                  'Unable to load the career growth path.',
                  '\u65e0\u6cd5\u52a0\u8f7d\u804c\u573a\u6210\u957f\u8def\u5f84\u3002'
                )
              )
            : null
        }
        onRetry={() => void pointsQuery.refetch()}
        localize={localize}
        scenarioTitles={scenarioTitles}
        radar={radarQuery.data}
      />
      <TrainingCompetencyRadarCard
        radar={radarQuery.data}
        isPending={radarQuery.isPending}
        isError={radarQuery.isError}
        onRetry={() => void radarQuery.refetch()}
        onGenerateProfile={() => setProfileDialogOpen(true)}
        localize={localize}
        userName={learnerName}
      />
      <TrainingProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        localize={localize}
        learnerName={learnerName}
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

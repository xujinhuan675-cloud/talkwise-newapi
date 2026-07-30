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
import { CircleAlert, RefreshCw, Target } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
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

import { TrainingHostProvider, useTrainingHost } from '../host'
import { listScenarioProgress, reviewRequestErrorMessage } from '../review/api'
import type { ScenarioProgress, ScenarioProgressStatus } from '../review/types'
import { buildTrainingGrowthSummary } from './contract'

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

function ScenarioProgressDataTable({
  progress,
  locale,
  localize,
}: {
  progress: ScenarioProgress[]
  locale: string
  localize: (english: string, chinese: string) => string
}) {
  const columns = useMemo<ColumnDef<ScenarioProgress>[]>(
    () => [
      {
        id: 'scenario',
        header: localize('Scenario', '\u573a\u666f'),
        cell: ({ row }) => row.original.scenarioId,
      },
      {
        id: 'status',
        header: localize('Status', '\u72b6\u6001'),
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.status.replace('_', ' ')}
            variant={statusVariant(row.original.status)}
            copyable={false}
          />
        ),
      },
      {
        id: 'score',
        header: localize('Score', '\u5f97\u5206'),
        cell: ({ row }) => {
          const item = row.original
          return item.scoreStatus === 'ready' && item.score !== null
            ? `${item.score}/100`
            : '-'
        },
      },
      {
        id: 'last-practiced',
        header: localize('Last practiced', '\u6700\u8fd1\u7ec3\u4e60'),
        cell: ({ row }) => formatDate(row.original.lastPracticedAt, locale),
      },
    ],
    [locale, localize]
  )
  const { table } = useDataTable({
    data: progress,
    columns,
    getRowId: (item) => item.scenarioId,
    enableRowSelection: false,
  })

  useEffect(() => {
    table.resetPageIndex()
  }, [progress, table])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      fixedHeight={false}
      tableClassName='min-w-180'
      getColumnClassName={(columnId) => {
        if (columnId === 'scenario') return 'font-medium'
        if (columnId === 'score') return 'text-right tabular-nums'
        if (columnId === 'last-practiced') {
          return 'text-muted-foreground whitespace-nowrap text-xs'
        }
        return undefined
      }}
    />
  )
}

function TrainingGrowthContent() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const progressQuery = useQuery({
    queryKey: ['training', 'scenario-progress', host.apiBase],
    queryFn: () => listScenarioProgress(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const progress = progressQuery.data ?? []
  const summary = buildTrainingGrowthSummary(progress)
  const isLoading = host.authStatus === 'loading' || progressQuery.isPending

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

  if (progressQuery.isError) {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize(
            'Failed to load scenario progress',
            '\u573a\u666f\u8fdb\u5ea6\u52a0\u8f7d\u5931\u8d25'
          )}
        </AlertTitle>
        <AlertDescription>
          {reviewRequestErrorMessage(
            progressQuery.error,
            localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
          )}
        </AlertDescription>
        <div className='col-start-2 mt-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void progressQuery.refetch()}
          >
            <RefreshCw />
            {localize('Retry', '\u91cd\u8bd5')}
          </Button>
        </div>
      </Alert>
    )
  }

  if (isLoading) return <GrowthSkeleton />

  if (progress.length === 0) {
    return (
      <div className='rounded-lg border p-8'>
        <Empty className='border-none p-0'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Target />
            </EmptyMedia>
            <EmptyTitle>
              {localize(
                'No scenario progress yet',
                '\u6682\u65e0\u573a\u666f\u8fdb\u5ea6'
              )}
            </EmptyTitle>
            <EmptyDescription>
              {localize(
                'Complete a scenario to see its latest status and score.',
                '\u5b8c\u6210\u4e00\u6b21\u573a\u666f\u8bad\u7ec3\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u6700\u65b0\u72b6\u6001\u4e0e\u8bc4\u5206\u3002'
              )}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to='/training/scenarios' />}>
              {localize('Browse scenarios', '\u67e5\u770b\u573a\u666f')}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-3'>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>
              {localize(
                'Scenario completion',
                '\u573a\u666f\u5b8c\u6210\u5ea6'
              )}
            </CardTitle>
            <CardDescription>
              {localize(
                'Latest status per scenario',
                '\u6bcf\u4e2a\u573a\u666f\u7684\u6700\u65b0\u72b6\u6001'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={summary.completionPercentage}>
              <ProgressLabel>
                {localize('Completed', '\u5df2\u5b8c\u6210')}
              </ProgressLabel>
              <ProgressValue />
            </Progress>
            <div className='text-muted-foreground mt-2 text-xs tabular-nums'>
              {localize(
                `${summary.completedScenarios} of ${summary.trackedScenarios} scenarios`,
                `${summary.completedScenarios} / ${summary.trackedScenarios} \u4e2a\u573a\u666f`
              )}
            </div>
          </CardContent>
        </Card>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>
              {localize('Average score', '\u5e73\u5747\u5f97\u5206')}
            </CardTitle>
            <CardDescription>
              {localize(
                'Only completed evaluations',
                '\u4ec5\u57fa\u4e8e\u5df2\u51fa\u7ed3\u679c\u7684\u8bc4\u4f30'
              )}
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
                `${summary.scoredScenarios} \u4e2a\u5df2\u8bc4\u5206\u573a\u666f`
              )}
            </div>
          </CardContent>
        </Card>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>
              {localize('Review records', '\u590d\u76d8\u8bb0\u5f55')}
            </CardTitle>
            <CardDescription>
              {localize(
                'Inspect individual training sessions',
                '\u67e5\u770b\u5355\u6b21\u8bad\u7ec3\u8bb0\u5f55'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant='outline'
              size='sm'
              render={<Link to='/training/sessions' />}
            >
              {localize('Open reviews', '\u6253\u5f00\u590d\u76d8')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <ScenarioProgressDataTable
        progress={progress}
        locale={i18n.language}
        localize={localize}
      />
    </div>
  )
}

export function TrainingGrowthPage() {
  const { i18n, t } = useTranslation()
  const title = t('Growth', {
    defaultValue: i18n.language.startsWith('zh') ? '\u6210\u957f' : 'Growth',
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

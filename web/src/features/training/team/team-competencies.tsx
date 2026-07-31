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
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { CircleAlert, RefreshCw, UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  listTeamCompetencyRankings,
  teamMemberDisplayId,
  teamAnalyticsRequestErrorMessage,
} from './api'
import type { TeamCompetencyRanking } from './types'

const COMPETENCY_DIMENSIONS: ReadonlyArray<readonly [string, string, string]> =
  [
    ['persuasion', 'Persuasion', '\u8bf4\u670d\u529b'],
    [
      'emotional_management',
      'Emotional management',
      '\u60c5\u7eea\u7ba1\u7406',
    ],
    ['active_listening', 'Active listening', '\u4e3b\u52a8\u503e\u542c'],
    [
      'structured_expression',
      'Structured expression',
      '\u7ed3\u6784\u8868\u8fbe',
    ],
    ['conflict_resolution', 'Conflict resolution', '\u51b2\u7a81\u5904\u7406'],
    [
      'stakeholder_alignment',
      'Stakeholder alignment',
      '\u5bf9\u9f50\u5229\u76ca\u76f8\u5173\u8005',
    ],
  ]

const competencyChartConfig = {
  score: {
    label: 'Score',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

function scoreFor(
  ranking: TeamCompetencyRanking,
  dimensionId: string
): number | null {
  return (
    ranking.dimensions.find((item) => item.dimensionId === dimensionId)
      ?.score ?? null
  )
}

function memberLabel(ranking: TeamCompetencyRanking): string {
  return ranking.memberName || teamMemberDisplayId(ranking.memberId)
}

function TeamCompetencyProfile({
  ranking,
  localize,
}: {
  ranking: TeamCompetencyRanking | undefined
  localize: (english: string, chinese: string) => string
}) {
  const data = COMPETENCY_DIMENSIONS.flatMap(([id, english, chinese]) => {
    const score = ranking ? scoreFor(ranking, id) : null
    return score === null
      ? []
      : [{ dimension: localize(english, chinese), score }]
  })
  const hasChart = Boolean(ranking) && data.length >= 3

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {localize(
            'Leading competency profile',
            '\u9886\u5148\u8005\u80fd\u529b\u753b\u50cf'
          )}
        </CardTitle>
        <CardDescription>
          {ranking
            ? ranking.memberName ||
              `${localize('Member ID', '\u6210\u5458 ID')}: ${teamMemberDisplayId(ranking.memberId)}`
            : localize(
                'No scored team sessions yet',
                '\u6682\u65e0\u5df2\u8bc4\u5206\u7684\u56e2\u961f\u8bad\u7ec3'
              )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasChart ? (
          <ChartContainer
            className='mx-auto aspect-square h-72 w-full max-w-md'
            config={competencyChartConfig}
          >
            <RadarChart data={data} outerRadius='72%'>
              <PolarGrid />
              <PolarAngleAxis dataKey='dimension' tick={{ fontSize: 12 }} />
              <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
              <Radar
                dataKey='score'
                fill='var(--color-score)'
                fillOpacity={0.2}
                name={localize('Score', '\u5f97\u5206')}
                stroke='var(--color-score)'
                strokeWidth={2}
              />
            </RadarChart>
          </ChartContainer>
        ) : (
          <div className='text-muted-foreground flex min-h-64 items-center justify-center text-center text-sm'>
            {localize(
              'At least three scored dimensions are needed to show a profile.',
              '\u81f3\u5c11\u9700\u8981\u4e09\u4e2a\u5df2\u8bc4\u5206\u7ef4\u5ea6\u624d\u80fd\u5c55\u793a\u753b\u50cf\u3002'
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TeamCompetenciesContent() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    setPagination((previous) =>
      typeof updater === 'function' ? updater(previous) : updater
    )
  }
  const rankingsQuery = useQuery({
    queryKey: [
      'training',
      'team-competencies',
      host.apiBase,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      listTeamCompetencyRankings(host.apiBase, {
        skip: pagination.pageIndex * pagination.pageSize,
        limit: pagination.pageSize,
      }),
    enabled: host.authStatus === 'authenticated',
    placeholderData: (previousData) => previousData,
  })
  const rankings = rankingsQuery.data?.items ?? []
  const total = rankingsQuery.data?.total ?? 0
  const columns = useMemo<ColumnDef<TeamCompetencyRanking>[]>(
    () => [
      {
        id: 'rank',
        size: 96,
        header: localize('Rank', '\u6392\u540d'),
        cell: ({ row }) => `#${row.original.rank}`,
      },
      {
        id: 'member',
        header: localize('Member ID', '\u6210\u5458 ID'),
        cell: ({ row }) => teamMemberDisplayId(row.original.memberId),
      },
      {
        id: 'average',
        header: localize('Average', '\u5e73\u5747\u5206'),
        cell: ({ row }) =>
          row.original.averageScore === null
            ? '-'
            : `${row.original.averageScore}/100`,
      },
      {
        id: 'samples',
        header: localize('Scored sessions', '\u5df2\u8bc4\u5206\u8bad\u7ec3'),
        cell: ({ row }) => row.original.sampleCount,
      },
      ...COMPETENCY_DIMENSIONS.map(([id, english, chinese]) => ({
        id,
        header: localize(english, chinese),
        cell: ({ row }: { row: { original: TeamCompetencyRanking } }) => {
          const score = scoreFor(row.original, id)
          return score === null ? '-' : `${score}/100`
        },
      })),
    ],
    [localize]
  )
  const { table } = useDataTable({
    data: rankings,
    columns,
    getRowId: (item) => item.memberId,
    enableRowSelection: false,
    pagination,
    onPaginationChange,
    manualPagination: true,
    totalCount: total,
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {localize('Competency leaderboard', '\u80fd\u529b\u6392\u884c')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          {rankingsQuery.isError && (
            <Alert variant='destructive'>
              <CircleAlert />
              <AlertTitle>
                {localize(
                  'Unable to load team analytics',
                  '\u65e0\u6cd5\u52a0\u8f7d\u56e2\u961f\u6570\u636e'
                )}
              </AlertTitle>
              <AlertDescription className='flex flex-wrap items-center gap-3'>
                <span>
                  {teamAnalyticsRequestErrorMessage(
                    rankingsQuery.error,
                    localize(
                      'Please try again.',
                      '\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
                    )
                  )}
                </span>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => rankingsQuery.refetch()}
                >
                  <RefreshCw />
                  {localize('Retry', '\u91cd\u8bd5')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <TeamCompetencyProfile ranking={rankings[0]} localize={localize} />
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={rankingsQuery.isPending}
            isFetching={rankingsQuery.isFetching}
            emptyIcon={<UsersRound />}
            emptyTitle={localize(
              'No team competency data',
              '\u6682\u65e0\u56e2\u961f\u80fd\u529b\u6570\u636e'
            )}
            emptyDescription={localize(
              'Completed and scored team sessions will appear here.',
              '\u5b8c\u6210\u4e14\u5df2\u8bc4\u5206\u7684\u56e2\u961f\u8bad\u7ec3\u5c06\u663e\u793a\u5728\u6b64\u5904\u3002'
            )}
            skeletonKeyPrefix='training-team-competencies-skeleton'
            toolbarProps={null}
            fixedHeight={false}
            enableCardView
            defaultViewMode='table'
            viewModeStorageKey='talkwise.training-team-competencies.view-mode'
            renderCard={(row) => (
              <Card className='gap-3 p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='truncate font-medium'>
                      {memberLabel(row.original)}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs'>
                      {row.original.memberName
                        ? localize('Member', '\u6210\u5458')
                        : localize('Member ID', '\u6210\u5458 ID')}
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='text-primary text-sm font-medium whitespace-nowrap tabular-nums'>
                      #{row.original.rank}
                    </div>
                    <div className='text-muted-foreground mt-1 text-xs tabular-nums'>
                      {row.original.averageScore === null
                        ? '-'
                        : `${row.original.averageScore}/100`}
                    </div>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-x-3 gap-y-2 text-sm'>
                  {COMPETENCY_DIMENSIONS.map(([id, english, chinese]) => (
                    <div
                      key={id}
                      className='flex items-center justify-between gap-2'
                    >
                      <span className='text-muted-foreground truncate text-xs'>
                        {localize(english, chinese)}
                      </span>
                      <span className='tabular-nums'>
                        {scoreFor(row.original, id) ?? '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            cardGridClassName='grid grid-cols-1 gap-3 lg:grid-cols-2'
            tableClassName='min-w-300'
            getColumnClassName={(columnId) => {
              if (columnId === 'rank') {
                return 'w-24 whitespace-nowrap text-left tabular-nums'
              }
              if (columnId === 'member') {
                return 'font-medium whitespace-nowrap text-right tabular-nums'
              }
              return 'whitespace-nowrap text-right tabular-nums'
            }}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function TeamCompetenciesPage() {
  return (
    <TrainingHostProvider>
      <TeamCompetenciesContent />
    </TrainingHostProvider>
  )
}

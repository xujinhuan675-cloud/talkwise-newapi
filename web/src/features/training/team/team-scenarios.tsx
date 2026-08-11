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
import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
} from '@tanstack/react-table'
import { CircleAlert, RefreshCw, Trophy, UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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

import { getTrainingScenarioConfig } from '../config/api'
import { formatTrainingDateTime } from '../date'
import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  isTrainingTeamAssignmentRequired,
  isTrainingTeamQueryLoading,
  listTeamScenarioRankings,
  retryTrainingTeamQuery,
  teamMemberDisplayId,
  teamAnalyticsRequestErrorMessage,
} from './api'
import type { TeamScenarioRanking } from './types'

function memberLabel(ranking: TeamScenarioRanking): string {
  return ranking.memberName || teamMemberDisplayId(ranking.memberId)
}

function TeamScenarioSummary({
  rankings,
  localize,
}: {
  rankings: TeamScenarioRanking[]
  localize: (english: string, chinese: string) => string
}) {
  const memberCount = new Set(rankings.map((item) => item.memberId)).size
  const scenarioCount = new Set(rankings.map((item) => item.scenarioId)).size
  const scored = rankings.flatMap((item) =>
    item.averageScore === null ? [] : [item.averageScore]
  )
  const averageScore = scored.length
    ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length)
    : null
  const items = [
    {
      title: localize('Members ranked', '\u5df2\u6392\u540d\u6210\u5458'),
      value: memberCount,
      description: localize(
        'Members with completed scenario sessions',
        '\u5df2\u5b8c\u6210\u573a\u666f\u8bad\u7ec3\u7684\u6210\u5458'
      ),
    },
    {
      title: localize('Scenarios ranked', '\u5df2\u6392\u540d\u573a\u666f'),
      value: scenarioCount,
      description: localize(
        'Scenario and member combinations ranked globally',
        '\u5f53\u524d\u89c6\u56fe\u4e2d\u7684\u573a\u666f\u4e0e\u6210\u5458\u7ec4\u5408'
      ),
    },
    {
      title: localize('Average score', '\u5e73\u5747\u8bc4\u5206'),
      value: averageScore === null ? '-' : `${averageScore}/100`,
      description: localize(
        'Across scored scenario rankings on this page',
        '\u57fa\u4e8e\u5f53\u524d\u9875\u5df2\u8bc4\u5206\u573a\u666f\u6392\u540d'
      ),
    },
  ]

  return (
    <div className='grid gap-3 sm:grid-cols-3'>
      {items.map((item) => (
        <Card key={item.title} size='sm'>
          <CardHeader>
            <CardDescription>{item.title}</CardDescription>
            <CardTitle className='text-2xl tabular-nums'>
              {item.value}
            </CardTitle>
          </CardHeader>
          <CardContent className='text-muted-foreground text-xs'>
            {item.description}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TeamScenariosContent() {
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
      'team-scenarios',
      host.apiBase,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      listTeamScenarioRankings(host.apiBase, {
        skip: pagination.pageIndex * pagination.pageSize,
        limit: pagination.pageSize,
      }),
    enabled: host.authStatus === 'authenticated',
    placeholderData: (previousData) => previousData,
    retry: retryTrainingTeamQuery,
  })
  const scenarioConfigQuery = useQuery({
    queryKey: ['training', 'scenario-config', host.apiBase],
    queryFn: () => getTrainingScenarioConfig(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const scenarioTitles = useMemo(
    () =>
      new Map(
        (scenarioConfigQuery.data?.scenarios ?? []).map((scenario) => [
          scenario.id,
          scenario.title,
        ])
      ),
    [scenarioConfigQuery.data?.scenarios]
  )
  const rankings = rankingsQuery.data?.items ?? []
  const total = rankingsQuery.data?.total ?? 0
  const assignmentRequired = isTrainingTeamAssignmentRequired(
    rankingsQuery.error
  )
  const columns = useMemo<ColumnDef<TeamScenarioRanking>[]>(
    () => [
      {
        id: 'rank',
        size: 96,
        header: localize('Rank', '\u6392\u540d'),
        cell: ({ row }) => `#${row.original.rank}`,
      },
      {
        id: 'scenario',
        header: localize('Scenario', '\u573a\u666f'),
        cell: ({ row }) =>
          scenarioTitles.get(row.original.scenarioId) ??
          row.original.scenarioId,
      },
      {
        id: 'member',
        header: localize('Member ID', '\u6210\u5458 ID'),
        cell: ({ row }) => teamMemberDisplayId(row.original.memberId),
      },
      {
        id: 'completed',
        header: localize('Completed', '\u5b8c\u6210\u6b21\u6570'),
        cell: ({ row }) => row.original.completedSessions,
      },
      {
        id: 'score',
        header: localize('Average score', '\u5e73\u5747\u8bc4\u5206'),
        cell: ({ row }) =>
          row.original.averageScore === null
            ? '-'
            : `${row.original.averageScore}/100`,
      },
      {
        id: 'last-practiced',
        header: localize('Last trained', '\u6700\u8fd1\u8bad\u7ec3'),
        cell: ({ row }) => formatTrainingDateTime(row.original.lastPracticedAt),
      },
    ],
    [localize, scenarioTitles]
  )
  const { table } = useDataTable({
    data: rankings,
    columns,
    getRowId: (item) => `${item.scenarioId}:${item.memberId}`,
    enableRowSelection: false,
    pagination,
    onPaginationChange,
    manualPagination: true,
    totalCount: total,
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {localize('Scenario leaderboard', '\u573a\u666f\u6392\u884c')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          {rankingsQuery.isError && (
            <Alert variant={assignmentRequired ? 'default' : 'destructive'}>
              {assignmentRequired ? <UsersRound /> : <CircleAlert />}
              <AlertTitle>
                {assignmentRequired
                  ? localize(
                      'Training team assignment required',
                      '\u9700\u8981\u5206\u914d\u8bad\u7ec3\u56e2\u961f'
                    )
                  : localize(
                      'Unable to load team analytics',
                      '\u65e0\u6cd5\u52a0\u8f7d\u56e2\u961f\u6570\u636e'
                    )}
              </AlertTitle>
              <AlertDescription className='flex flex-wrap items-center gap-3'>
                <span>
                  {assignmentRequired
                    ? localize(
                        'Add this account to a training team before viewing team rankings.',
                        '\u8bf7\u5148\u5c06\u5f53\u524d\u8d26\u53f7\u52a0\u5165\u8bad\u7ec3\u56e2\u961f\uff0c\u518d\u67e5\u770b\u56e2\u961f\u6392\u884c\u3002'
                      )
                    : teamAnalyticsRequestErrorMessage(
                        rankingsQuery.error,
                        localize(
                          'Please try again.',
                          '\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
                        )
                      )}
                </span>
                {assignmentRequired ? (
                  <Button
                    size='sm'
                    variant='outline'
                    render={<Link to='/training/team/members' />}
                  >
                    <UsersRound />
                    {localize(
                      'Manage team members',
                      '\u7ba1\u7406\u56e2\u961f\u6210\u5458'
                    )}
                  </Button>
                ) : (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => rankingsQuery.refetch()}
                  >
                    <RefreshCw />
                    {localize('Retry', '\u91cd\u8bd5')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <TeamScenarioSummary rankings={rankings} localize={localize} />
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={isTrainingTeamQueryLoading(
              host.authStatus === 'authenticated',
              rankingsQuery.isPending,
              rankingsQuery.isError
            )}
            isFetching={rankingsQuery.isFetching}
            emptyIcon={<Trophy />}
            emptyTitle={localize(
              'No scenario rankings',
              '\u6682\u65e0\u573a\u666f\u6392\u540d'
            )}
            emptyDescription={localize(
              'Completed team scenario sessions will appear here.',
              '\u5b8c\u6210\u7684\u56e2\u961f\u573a\u666f\u8bad\u7ec3\u5c06\u663e\u793a\u5728\u6b64\u5904\u3002'
            )}
            skeletonKeyPrefix='training-team-scenarios-skeleton'
            toolbarProps={null}
            fixedHeight={false}
            enableCardView
            defaultViewMode='table'
            viewModeStorageKey='talkwise.training-team-scenarios.view-mode'
            renderCard={(row) => (
              <Card className='gap-3 p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <div className='truncate font-medium'>
                      {scenarioTitles.get(row.original.scenarioId) ??
                        row.original.scenarioId}
                    </div>
                    <div className='text-muted-foreground mt-1 truncate text-xs'>
                      {memberLabel(row.original)}
                    </div>
                  </div>
                  <div className='text-primary text-sm font-medium whitespace-nowrap'>
                    #{row.original.rank}
                  </div>
                </div>
                <div className='text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-2 text-xs'>
                  <span>
                    {localize('Completed', '\u5b8c\u6210')}:{' '}
                    {row.original.completedSessions}
                  </span>
                  <span className='text-right'>
                    {localize('Average score', '\u5e73\u5747\u8bc4\u5206')}:{' '}
                    {row.original.averageScore ?? '-'}
                  </span>
                  <span className='col-span-2'>
                    {localize('Last trained', '\u6700\u8fd1\u8bad\u7ec3')}:{' '}
                    {formatTrainingDateTime(row.original.lastPracticedAt)}
                  </span>
                </div>
              </Card>
            )}
            cardGridClassName='grid grid-cols-1 gap-3 lg:grid-cols-2'
            tableClassName='min-w-220'
            getColumnClassName={(columnId) => {
              if (columnId === 'rank') {
                return 'w-24 whitespace-nowrap text-left tabular-nums'
              }
              if (columnId === 'scenario') {
                return 'font-medium'
              }
              if (columnId === 'member') {
                return 'font-medium whitespace-nowrap text-right tabular-nums'
              }
              if (columnId === 'last-practiced') {
                return 'text-muted-foreground whitespace-nowrap text-right text-xs'
              }
              return 'whitespace-nowrap text-right tabular-nums'
            }}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function TeamScenariosPage() {
  return (
    <TrainingHostProvider>
      <TeamScenariosContent />
    </TrainingHostProvider>
  )
}

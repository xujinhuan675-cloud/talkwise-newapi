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
import { CircleAlert, RefreshCw, UsersRound } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  isTrainingTeamAssignmentRequired,
  isTrainingTeamQueryLoading,
  listTeamCompetencyRankings,
  retryTrainingTeamQuery,
  teamMemberDisplayId,
  teamAnalyticsRequestErrorMessage,
} from './api'
import type { TeamCompetencyRanking } from './types'

const COMPETENCY_DIMENSIONS: ReadonlyArray<readonly [string, string, string]> =
  [
    ['attentiveness', 'Attentiveness', '\u503e\u542c\u5173\u6ce8'],
    ['expression', 'Expression', '\u8868\u8fbe\u6e05\u6670'],
    ['coordination', 'Coordination', '\u4e92\u52a8\u534f\u8c03'],
    ['composure', 'Composure', '\u6c89\u7740\u5e94\u5bf9'],
  ]

function dimensionFor(ranking: TeamCompetencyRanking, dimensionId: string) {
  return ranking.dimensions.find((item) => item.dimensionId === dimensionId)
}

function memberLabel(ranking: TeamCompetencyRanking): string {
  return ranking.memberName || teamMemberDisplayId(ranking.memberId)
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
    retry: retryTrainingTeamQuery,
  })
  const rankings = rankingsQuery.data?.items ?? []
  const total = rankingsQuery.data?.total ?? 0
  const assignmentRequired = isTrainingTeamAssignmentRequired(
    rankingsQuery.error
  )
  const columns = useMemo<ColumnDef<TeamCompetencyRanking>[]>(
    () => [
      {
        id: 'member',
        header: localize('Member ID', '\u6210\u5458 ID'),
        cell: ({ row }) => teamMemberDisplayId(row.original.memberId),
      },
      {
        id: 'samples',
        header: localize('Valid observations', '\u6709\u6548\u89c2\u5bdf'),
        cell: ({ row }) => row.original.sampleCount,
      },
      ...COMPETENCY_DIMENSIONS.map(([id, english, chinese]) => ({
        id,
        header: localize(english, chinese),
        cell: ({ row }: { row: { original: TeamCompetencyRanking } }) => {
          const dimension = dimensionFor(row.original, id)
          if (!dimension || dimension.score === null) return '-'
          return (
            <div>
              <div>{dimension.score}/100</div>
              <div className='text-muted-foreground text-xs font-normal'>
                {localize(
                  `${dimension.sampleCount} observations / ${dimension.scenarioCount} scenarios / ${dimension.state === 'stable' ? 'stable estimate' : 'exploring'}`,
                  `${dimension.sampleCount} \u4e2a\u89c2\u5bdf / ${dimension.scenarioCount} \u4e2a\u573a\u666f / ${dimension.state === 'stable' ? '\u7a33\u5b9a\u4f30\u8ba1' : '\u63a2\u7d22\u4e2d'}`
                )}
              </div>
            </div>
          )
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
        {localize(
          'Team competency observations',
          '\u56e2\u961f\u6c9f\u901a\u80fd\u529b\u89c2\u5bdf'
        )}
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
                        'Add this account to a training team before viewing team observations.',
                        '\u8bf7\u5148\u5c06\u5f53\u524d\u8d26\u53f7\u52a0\u5165\u8bad\u7ec3\u56e2\u961f\uff0c\u518d\u67e5\u770b\u56e2\u961f\u89c2\u5bdf\u3002'
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
          <Card size='sm'>
            <CardHeader>
              <CardTitle>
                {localize('How to read this view', '\u5982\u4f55\u89e3\u8bfb')}
              </CardTitle>
              <CardDescription>
                {localize(
                  'Values summarize evidence-backed observations for each member. They are not calibrated for ranking people against one another.',
                  '\u6570\u503c\u4ec5\u6c47\u603b\u6bcf\u4f4d\u6210\u5458\u6709\u8bc1\u636e\u7684\u884c\u4e3a\u89c2\u5bdf\uff0c\u672a\u7ecf\u8de8\u4eba\u6821\u51c6\uff0c\u4e0d\u7528\u4e8e\u4eba\u5458\u6392\u540d\u3002'
                )}
              </CardDescription>
            </CardHeader>
          </Card>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={isTrainingTeamQueryLoading(
              host.authStatus === 'authenticated',
              rankingsQuery.isPending,
              rankingsQuery.isError
            )}
            isFetching={rankingsQuery.isFetching}
            emptyIcon={<UsersRound />}
            emptyTitle={localize(
              'No team competency data',
              '\u6682\u65e0\u56e2\u961f\u80fd\u529b\u6570\u636e'
            )}
            emptyDescription={localize(
              'Completed team sessions with valid observations will appear here.',
              '\u6709\u6548\u89c2\u5bdf\u7684\u5df2\u5b8c\u6210\u56e2\u961f\u8bad\u7ec3\u5c06\u663e\u793a\u5728\u6b64\u5904\u3002'
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
                  <div className='text-muted-foreground text-right text-xs tabular-nums'>
                    {localize(
                      `${row.original.sampleCount} observations`,
                      `${row.original.sampleCount} \u4e2a\u89c2\u5bdf`
                    )}
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-x-3 gap-y-2 text-sm'>
                  {COMPETENCY_DIMENSIONS.map(([id, english, chinese]) => {
                    const dimension = dimensionFor(row.original, id)
                    return (
                      <div
                        key={id}
                        className='flex items-center justify-between gap-2'
                      >
                        <span className='text-muted-foreground truncate text-xs'>
                          {localize(english, chinese)}
                        </span>
                        <span className='text-right tabular-nums'>
                          {dimension?.score ?? '-'}
                          {dimension && (
                            <span className='text-muted-foreground block text-xs'>
                              {dimension.state === 'stable'
                                ? localize(
                                    'Stable estimate',
                                    '\u7a33\u5b9a\u4f30\u8ba1'
                                  )
                                : localize('Exploring', '\u63a2\u7d22\u4e2d')}
                            </span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
            cardGridClassName='grid grid-cols-1 gap-3 lg:grid-cols-2'
            tableClassName='min-w-300'
            getColumnClassName={(columnId) => {
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

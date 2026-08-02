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
import { Award, RefreshCw } from 'lucide-react'

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
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

import type { TrainingPointsSummary } from './training-points'

type Localize = (english: string, chinese: string) => string

interface TrainingPointsCardProps {
  readonly summary: TrainingPointsSummary | undefined
  readonly isPending: boolean
  readonly errorMessage: string | null
  readonly onRetry: () => void
  readonly localize: Localize
}

export function TrainingPointsCard(props: TrainingPointsCardProps) {
  const { summary, isPending, errorMessage, onRetry, localize } = props
  const levelTitle = summary
    ? localize(
        summary.levelTitle,
        {
          Foundation: '\u57fa\u7840',
          Practitioner: '\u5b9e\u8df5\u8005',
          Specialist: '\u4e13\u4e1a\u8005',
          Strategist: '\u7b56\u7565\u5e08',
          Mentor: '\u5bfc\u5e08',
        }[summary.levelTitle] ?? summary.levelTitle
      )
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Award className='text-muted-foreground size-4' />
          {localize('Training Points', '\u8bad\u7ec3\u79ef\u5206')}
        </CardTitle>
        <CardDescription>
          {localize(
            'Persistent progress from completed training sessions',
            '\u5b8c\u6210\u8bad\u7ec3\u540e\u6301\u7eed\u7d2f\u79ef\u7684\u6210\u957f\u8bb0\u5f55'
          )}
        </CardDescription>
        {summary && (
          <CardAction>
            <Badge variant='secondary'>
              {localize('Level', '\u7b49\u7ea7')} {summary.level} · {levelTitle}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isPending && (
          <div className='grid gap-4 sm:grid-cols-[minmax(8rem,0.35fr)_1fr]'>
            <Skeleton className='h-16 w-full' />
            <div className='space-y-3'>
              <Skeleton className='h-4 w-full' />
              <Skeleton className='h-3 w-2/3' />
            </div>
          </div>
        )}
        {!isPending && errorMessage && (
          <div className='flex min-h-20 flex-wrap items-center justify-between gap-3'>
            <span className='text-muted-foreground text-sm'>
              {errorMessage}
            </span>
            <Button size='sm' variant='outline' onClick={onRetry}>
              <RefreshCw />
              {localize('Retry', '\u91cd\u8bd5')}
            </Button>
          </div>
        )}
        {!isPending && !errorMessage && summary && (
          <div className='grid gap-5 sm:grid-cols-[minmax(8rem,0.35fr)_1fr] sm:items-end'>
            <div>
              <div className='text-3xl font-semibold tabular-nums'>
                {summary.totalPoints.toLocaleString()}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {summary.unit} ·{' '}
                {localize(
                  `${summary.completedSessions} completed sessions`,
                  `${summary.completedSessions} \u6b21\u5df2\u5b8c\u6210\u8bad\u7ec3`
                )}
              </div>
            </div>
            <div className='space-y-2'>
              <Progress value={summary.levelProgressPercentage}>
                <ProgressLabel>
                  {localize('Next level', '\u4e0b\u4e00\u7b49\u7ea7')}
                </ProgressLabel>
                <ProgressValue />
              </Progress>
              <div className='text-muted-foreground flex justify-between gap-3 text-xs tabular-nums'>
                <span>{summary.currentLevelPoints.toLocaleString()} TP</span>
                <span>{summary.nextLevelPoints.toLocaleString()} TP</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

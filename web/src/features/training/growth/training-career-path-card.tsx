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
import { Link } from '@tanstack/react-router'
import {
  Check,
  CircleDot,
  LockKeyhole,
  MessagesSquare,
  RefreshCw,
  Route,
} from 'lucide-react'

import { StatusBadge } from '@/components/status-badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import type { TrainingCompetencyRadar } from '../review/types'
import type {
  TrainingCareerPathStage,
  TrainingCareerPathStageStatus,
  TrainingPointsSummary,
} from './training-points'

type Localize = (english: string, chinese: string) => string

interface StageCopy {
  readonly title: readonly [string, string]
  readonly description: readonly [string, string]
}

const STAGE_COPY: Record<string, StageCopy> = {
  foundation: {
    title: [
      'Workplace communication foundations',
      '\u804c\u573a\u6c9f\u901a\u57fa\u7840',
    ],
    description: [
      'Listen for intent and answer everyday work conversations with structure.',
      '\u5148\u542c\u6e05\u76ee\u6807\uff0c\u518d\u7528\u6709\u7ed3\u6784\u7684\u8868\u8fbe\u56de\u5e94\u65e5\u5e38\u5de5\u4f5c\u6c9f\u901a\u3002',
    ],
  },
  collaboration: {
    title: ['Collaborative communication', '\u534f\u4f5c\u6c9f\u901a'],
    description: [
      'Align expectations, exchange feedback, and move shared work forward.',
      '\u5bf9\u9f50\u9884\u671f\u3001\u4ea4\u6362\u53cd\u9988\uff0c\u5e76\u63a8\u52a8\u5171\u540c\u4efb\u52a1\u5411\u524d\u3002',
    ],
  },
  practitioner: {
    title: ['Collaborative communication', '\u534f\u4f5c\u6c9f\u901a'],
    description: [
      'Align expectations, exchange feedback, and move shared work forward.',
      '\u5bf9\u9f50\u9884\u671f\u3001\u4ea4\u6362\u53cd\u9988\uff0c\u5e76\u63a8\u52a8\u5171\u540c\u4efb\u52a1\u5411\u524d\u3002',
    ],
  },
  'upward-management': {
    title: ['Upward management', '\u5411\u4e0a\u7ba1\u7406'],
    description: [
      'Report clearly, surface risks early, and ask for the support you need.',
      '\u6e05\u6670\u6c47\u62a5\u3001\u63d0\u524d\u66b4\u9732\u98ce\u9669\uff0c\u5e76\u4e3a\u63a8\u8fdb\u4e89\u53d6\u5fc5\u8981\u652f\u6301\u3002',
    ],
  },
  'interest-communication': {
    title: ['Interest communication', '\u5229\u76ca\u6c9f\u901a'],
    description: [
      'Trade value, constraints, and commitments without giving away the core outcome.',
      '\u5728\u4ef7\u503c\u3001\u9650\u5236\u4e0e\u627f\u8bfa\u4e4b\u95f4\u4ea4\u6362\u6761\u4ef6\uff0c\u5b88\u4f4f\u5173\u952e\u7ed3\u679c\u3002',
    ],
  },
  specialist: {
    title: ['Upward management', '\u5411\u4e0a\u7ba1\u7406'],
    description: [
      'Report clearly, surface risks early, and ask for the support you need.',
      '\u6e05\u6670\u6c47\u62a5\u3001\u63d0\u524d\u66b4\u9732\u98ce\u9669\uff0c\u5e76\u4e3a\u63a8\u8fdb\u4e89\u53d6\u5fc5\u8981\u652f\u6301\u3002',
    ],
  },
  strategist: {
    title: ['Interest communication', '\u5229\u76ca\u6c9f\u901a'],
    description: [
      'Trade value, constraints, and commitments without giving away the core outcome.',
      '\u5728\u4ef7\u503c\u3001\u9650\u5236\u4e0e\u627f\u8bfa\u4e4b\u95f4\u4ea4\u6362\u6761\u4ef6\uff0c\u5b88\u4f4f\u5173\u952e\u7ed3\u679c\u3002',
    ],
  },
  'influence-mentor': {
    title: ['Influence and coaching', '\u5173\u952e\u5f71\u54cd\u4e0e\u5e26\u6559'],
    description: [
      'Guide others and lead high-stakes conversations with repeatable methods.',
      '\u7528\u53ef\u590d\u7528\u65b9\u6cd5\u5e26\u6559\u4ed6\u4eba\uff0c\u5e76\u4e3b\u5bfc\u9ad8\u5229\u5bb3\u6c9f\u901a\u3002',
    ],
  },
  mentor: {
    title: ['Influence and coaching', '\u5173\u952e\u5f71\u54cd\u4e0e\u5e26\u6559'],
    description: [
      'Guide others and lead high-stakes conversations with repeatable methods.',
      '\u7528\u53ef\u590d\u7528\u65b9\u6cd5\u5e26\u6559\u4ed6\u4eba\uff0c\u5e76\u4e3b\u5bfc\u9ad8\u5229\u5bb3\u6c9f\u901a\u3002',
    ],
  },
}

const FOCUS_COPY: Record<string, readonly [string, string]> = {
  attentiveness: ['Attentiveness', '\u503e\u542c\u5173\u6ce8'],
  expression: ['Clear expression', '\u6e05\u6670\u8868\u8fbe'],
  coordination: ['Coordination', '\u534f\u4f5c\u63a8\u8fdb'],
  composure: ['Composure', '\u7a33\u5b9a\u5e94\u5bf9'],
}

function stageCopy(stage: TrainingCareerPathStage, localize: Localize) {
  const copy = STAGE_COPY[stage.id]
  return {
    title: copy ? localize(...copy.title) : stage.title,
    description: copy
      ? localize(...copy.description)
      : localize(
          'Build the communication capabilities required for this stage.',
          '\u5efa\u7acb\u8fd9\u4e00\u9636\u6bb5\u6240\u9700\u7684\u6c9f\u901a\u80fd\u529b\u3002'
        ),
  }
}

function statusLabel(
  status: TrainingCareerPathStageStatus,
  localize: Localize
) {
  if (status === 'completed') return localize('Completed', '\u5df2\u5b8c\u6210')
  if (status === 'current')
    return localize('Current stage', '\u5f53\u524d\u9636\u6bb5')
  return localize('Locked', '\u5df2\u9501\u5b9a')
}

function CareerPathStageItem(props: {
  readonly stage: TrainingCareerPathStage
  readonly isLast: boolean
  readonly localize: Localize
}) {
  const { stage, isLast, localize } = props
  const copy = stageCopy(stage, localize)
  const StatusIcon =
    stage.status === 'completed'
      ? Check
      : stage.status === 'current'
        ? CircleDot
        : LockKeyhole
  const statusVariant =
    stage.status === 'completed'
      ? ('success' as const)
      : stage.status === 'current'
        ? ('info' as const)
        : ('neutral' as const)

  return (
    <li className='relative grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0 md:block md:px-2 md:pb-0'>
      {!isLast && (
        <span
          className={cn(
            'absolute top-8 bottom-0 left-[0.9375rem] w-px md:top-4 md:right-[-50%] md:bottom-auto md:left-1/2 md:h-px md:w-auto',
            stage.status === 'completed' ? 'bg-success/50' : 'bg-border'
          )}
          aria-hidden='true'
        />
      )}
      <span
        className={cn(
          'bg-background relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border shadow-xs md:mx-auto',
          stage.status === 'completed' &&
            'border-success/40 bg-success/10 text-success',
          stage.status === 'current' &&
            'border-primary bg-primary/10 text-primary ring-primary/10 ring-4',
          stage.status === 'locked' && 'bg-muted text-muted-foreground'
        )}
        aria-hidden='true'
      >
        <StatusIcon className='size-4' />
      </span>

      <div className='min-w-0 pt-0.5 md:mt-3 md:pt-0 md:text-center'>
        <div className='flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 md:justify-center'>
          <span className='text-muted-foreground font-mono text-xs tabular-nums'>
            {stage.stageNumber}.
          </span>
          <span className='font-medium'>{copy.title}</span>
        </div>
        <p className='text-muted-foreground mt-1 text-xs leading-5 md:mx-auto md:max-w-48'>
          {copy.description}
        </p>
        <div className='mt-2 flex flex-wrap gap-1 md:justify-center'>
          {stage.focusIds.map((focusId) => {
            const labels = FOCUS_COPY[focusId]
            return (
              <Badge key={focusId} variant='outline'>
                {labels ? localize(...labels) : focusId}
              </Badge>
            )
          })}
        </div>
        <div className='mt-2 flex flex-wrap items-center gap-2 md:justify-center'>
          {stage.status !== 'locked' && (
            <StatusBadge
              label={statusLabel(stage.status, localize)}
              variant={statusVariant}
              copyable={false}
            />
          )}
          <span className='text-muted-foreground text-xs tabular-nums'>
            {stage.completedScenarioCount}/{stage.requiredScenarioCount}{' '}
            {localize('required scenarios', '\u5fc5\u7ec3\u573a\u666f')}
          </span>
        </div>
      </div>
    </li>
  )
}

interface TrainingCareerPathCardProps {
  readonly summary: TrainingPointsSummary | undefined
  readonly isPending: boolean
  readonly errorMessage: string | null
  readonly onRetry: () => void
  readonly localize: Localize
  readonly scenarioTitles: ReadonlyMap<string, string>
  readonly radar: TrainingCompetencyRadar | undefined
}

export function TrainingCareerPathCard(props: TrainingCareerPathCardProps) {
  const {
    summary,
    isPending,
    errorMessage,
    onRetry,
    localize,
    scenarioTitles,
    radar,
  } = props
  const stages = summary?.careerPath ?? []
  const currentStage = stages.find((stage) => stage.status === 'current')
  const allStagesCompleted =
    stages.length > 0 && stages.every((stage) => stage.status === 'completed')
  const currentCopy = currentStage ? stageCopy(currentStage, localize) : null
  const recommendations = currentStage
    ? currentStage.recommendedScenarioIds.flatMap((scenarioId) => {
        const title = scenarioTitles.get(scenarioId)
        return title ? [title] : []
      })
    : []
  const radarById = new Map(
    (radar?.dimensions ?? []).map((dimension) => [dimension.dimensionId, dimension])
  )
  const weakestFocusId = currentStage
    ? currentStage.focusIds
        .map((focusId) => radarById.get(focusId))
        .filter((dimension): dimension is NonNullable<typeof dimension> => Boolean(dimension))
        .sort((first, second) => first.score - second.score)[0]?.dimensionId
    : undefined
  const weakestFocus = weakestFocusId ? FOCUS_COPY[weakestFocusId] : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Route className='text-muted-foreground size-4' />
          {localize(
            'Career growth path',
            '\u804c\u573a\u6210\u957f\u8def\u5f84'
          )}
        </CardTitle>
        <CardDescription>
          {localize(
            'Complete the required scenarios for the current stage to keep progressing. The radar diagnoses focus areas; Training Points track practice effort.',
            '\u5b8c\u6210\u5f53\u524d\u9636\u6bb5\u7684\u5fc5\u7ec3\u573a\u666f\uff0c\u7ee7\u7eed\u63a8\u8fdb\u4e0b\u4e00\u9636\u6bb5\u3002\u80fd\u529b\u96f7\u8fbe\u7528\u4e8e\u8bc6\u522b\u91cd\u70b9\uff0c\u8bad\u7ec3\u79ef\u5206\u53ea\u8bb0\u5f55\u6295\u5165\u3002'
          )}
        </CardDescription>
        {(currentCopy || allStagesCompleted) && (
          <CardAction>
            <Badge variant='secondary'>
              {currentCopy?.title ??
                localize('All stages completed', '\u5168\u90e8\u9636\u6bb5\u5df2\u5b8c\u6210')}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent>
        {isPending && (
          <div className='grid gap-4 md:grid-cols-5'>
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={`career-path-skeleton-${index + 1}`}
                className='flex gap-3 md:flex-col md:items-center'
              >
                <Skeleton className='size-8 shrink-0 rounded-lg' />
                <div className='w-full space-y-2 md:text-center'>
                  <Skeleton className='h-4 w-32 md:mx-auto' />
                  <Skeleton className='h-8 w-full' />
                  <Skeleton className='h-5 w-20 md:mx-auto' />
                </div>
              </div>
            ))}
          </div>
        )}
        {!isPending && errorMessage && (
          <div className='flex min-h-24 flex-wrap items-center justify-between gap-3'>
            <span className='text-muted-foreground text-sm'>
              {errorMessage}
            </span>
            <Button size='sm' variant='outline' onClick={onRetry}>
              <RefreshCw />
              {localize('Retry', '\u91cd\u8bd5')}
            </Button>
          </div>
        )}
        {!isPending && !errorMessage && stages.length > 0 && (
          <ol
            className='grid min-w-0 md:grid-cols-5'
            aria-label={localize(
              'Career growth path stages',
              '\u804c\u573a\u6210\u957f\u8def\u5f84\u9636\u6bb5'
            )}
          >
            {stages.map((stage, index) => (
              <CareerPathStageItem
                key={stage.id}
                stage={stage}
                isLast={index === stages.length - 1}
                localize={localize}
              />
            ))}
          </ol>
        )}
        {!isPending && !errorMessage && stages.length === 0 && (
          <div className='text-muted-foreground flex min-h-24 items-center justify-center text-center text-sm'>
            {localize(
              'Career path data is not available from the training service yet.',
              '\u8bad\u7ec3\u670d\u52a1\u5c1a\u672a\u63d0\u4f9b\u804c\u573a\u6210\u957f\u8def\u5f84\u6570\u636e\u3002'
            )}
          </div>
        )}
      </CardContent>

      {!isPending && !errorMessage && currentStage && currentCopy && (
        <CardFooter className='flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>
              {localize(
                'Next practice',
                '\u4e0b\u4e00\u6b65\u8bad\u7ec3'
              )}
            </div>
            <div className='text-muted-foreground mt-0.5 text-xs leading-5'>
              {recommendations.length > 0
                ? recommendations.join(' / ')
                : currentCopy.description}
              <span className='ml-2 tabular-nums'>
                {localize(
                  `${currentStage.completedScenarioCount}/${currentStage.requiredScenarioCount} required scenarios complete`,
                  `\u5df2\u5b8c\u6210 ${currentStage.completedScenarioCount}/${currentStage.requiredScenarioCount} \u4e2a\u5fc5\u7ec3\u573a\u666f`
                )}
              </span>
              {weakestFocus && (
                <span className='ml-2'>
                  {localize(
                    `Radar focus: ${weakestFocus[0]}`,
                    `\u96f7\u8fbe\u63d0\u793a\uff1a\u4f18\u5148\u8865\u5f3a${weakestFocus[1]}`
                  )}
                </span>
              )}
            </div>
          </div>
          <Button
            size='sm'
            className='shrink-0'
            render={<Link to='/training/scenarios' />}
          >
            <MessagesSquare />
            {localize(
              'Practice this stage',
              '\u7ec3\u4e60\u5f53\u524d\u9636\u6bb5'
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

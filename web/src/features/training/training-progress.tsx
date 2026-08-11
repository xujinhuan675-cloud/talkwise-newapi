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
import { Flag } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'

import type { TrainingProgressSnapshot } from './training-plan'

interface TrainingProgressIndicatorProps {
  readonly localize: (english: string, chinese: string) => string
  readonly progress: TrainingProgressSnapshot
}

function progressStateLabel(
  progress: TrainingProgressSnapshot,
  localize: TrainingProgressIndicatorProps['localize']
): string {
  if (progress.state === 'hard_limit_reached') {
    return localize('Training complete', '本次训练已完成')
  }
  if (progress.state === 'completed') {
    return localize('Completed', '已完成')
  }
  if (progress.state === 'ready_to_finish') {
    return localize('Review suggested', '建议进入复盘')
  }
  if (progress.source === 'local') {
    return localize('Target length', '目标长度')
  }
  return localize('In progress', '训练进行中')
}

export function TrainingProgressIndicator({
  localize,
  progress,
}: TrainingProgressIndicatorProps) {
  const target = Math.max(progress.targetTurns, 1)
  const percent = Math.min(
    100,
    Math.round((progress.learnerTurnCount / target) * 100)
  )
  const objectivesAvailable =
    progress.coveredCount !== null && progress.totalCount !== null
  const readyToFinish = progress.state === 'ready_to_finish'
  const hardLimitReached = progress.state === 'hard_limit_reached'

  return (
    <div className='border-b px-3 py-2'>
      <div className='flex w-full flex-col gap-1.5'>
        <Progress value={percent}>
          <ProgressLabel>
            {localize('Training progress', '训练进度')}
          </ProgressLabel>
          <ProgressValue>
            {() => `${progress.learnerTurnCount}/${progress.targetTurns}`}
          </ProgressValue>
        </Progress>
        <div className='flex flex-wrap items-center gap-1.5 text-xs'>
          <Badge variant={readyToFinish ? 'default' : 'secondary'}>
            {progressStateLabel(progress, localize)}
          </Badge>
          {objectivesAvailable && (
            <Badge variant='outline'>
              {localize(
                `${progress.coveredCount}/${progress.totalCount} objectives covered`,
                `已覆盖 ${progress.coveredCount}/${progress.totalCount} 个训练重点`
              )}
            </Badge>
          )}
        </div>
        {progress.source === 'local' && (
          <p className='text-muted-foreground text-xs'>
            {localize(
              'Length is estimated from submitted learner answers. Evidence conclusions come from the server.',
              '当前仅按已提交的学员回答估算长度，证据结论以服务器结果为准。'
            )}
          </p>
        )}
        {readyToFinish && (
          <Alert className='mt-1 py-2'>
            <Flag />
            <AlertTitle className='text-xs'>
              {localize('Review is now suggested', '现在建议进入复盘')}
            </AlertTitle>
            <AlertDescription className='text-xs'>
              {localize(
                'You can finish and review this session now, or continue the conversation.',
                '你可以现在结束并复盘，也可以继续对话。'
              )}
            </AlertDescription>
          </Alert>
        )}
        {hardLimitReached && (
          <Alert className='mt-1 py-2'>
            <Flag />
            <AlertTitle className='text-xs'>
              {localize('Choose how to finish', '请选择结束方式')}
            </AlertTitle>
            <AlertDescription className='text-xs'>
              {localize(
                'This training is complete. End directly or finish with a review.',
                '本次训练已完成，你可以直接结束，也可以结束并复盘。'
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

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
import { LoaderCircle, MessageSquareText } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import {
  trainingFeedbackEventDisplay,
  type TrainingFeedbackEventLike,
} from '../training-feedback'
import {
  requestTrainingConversationGuidance,
  type TrainingConversationGuidanceResult,
  type TrainingConversationMessage,
  type TrainingConversationSessionContext,
} from './api'

export interface TrainingTurnCorrection {
  readonly event: TrainingFeedbackEventLike
  readonly key: string
}

export type TrainingDrillCorrectionState =
  | { readonly status: 'idle' }
  | {
      readonly draftId: string
      readonly draftText: string
      readonly status: 'analyzing'
    }
  | {
      readonly correction: TrainingTurnCorrection | null
      readonly draftId: string
      readonly draftText: string
      readonly status: 'ready'
    }
  | {
      readonly draftId: string
      readonly draftText: string
      readonly status: 'error'
    }

const IDLE_DRILL_CORRECTION: TrainingDrillCorrectionState = { status: 'idle' }
let drillDraftSequence = 0

function severityRank(value: string): number {
  const severity = value.trim().toLowerCase()
  if (severity === 'critical' || severity === 'error') return 3
  if (severity === 'warning' || severity === 'warn') return 2
  return 1
}

export function trainingTurnCorrectionFromGuidance(
  result: TrainingConversationGuidanceResult | null
): TrainingTurnCorrection | null {
  if (!result?.events.length) return null
  const event = [...result.events].sort((left, right) => {
    const severityDifference =
      severityRank(right.severity) - severityRank(left.severity)
    if (severityDifference) return severityDifference
    return (
      Number(Boolean(right.suggestedText)) - Number(Boolean(left.suggestedText))
    )
  })[0]
  if (!event) return null
  return {
    event,
    key: [
      result.selectedTailMessageId ?? 'room-turn',
      event.eventType,
      event.title,
      event.message,
    ].join(':'),
  }
}

export function trainingDrillDraftMessages(
  messages: readonly TrainingConversationMessage[],
  draftText: string,
  draftId: string
): TrainingConversationMessage[] {
  const content = draftText.trim()
  if (!content) return [...messages]
  return [
    ...messages.filter((message) => Boolean(message.content.trim())),
    {
      publicId: draftId,
      role: 'user',
      content,
      contentParts: [],
      metadata: {
        persisted: false,
        source: 'training_drill_draft',
      },
      emotionLabel: null,
      emotionScore: null,
      parentMessageId: messages.at(-1)?.publicId ?? null,
      branchId: messages.at(-1)?.branchId ?? null,
      createdAt: null,
    },
  ]
}

export function useTrainingDrillCorrection({
  enabled,
  trainingApiBase,
  trainingSession,
}: {
  readonly enabled: boolean
  readonly trainingApiBase: string
  readonly trainingSession: TrainingConversationSessionContext
}) {
  const [state, setState] = useState<TrainingDrillCorrectionState>(
    IDLE_DRILL_CORRECTION
  )
  const requestAbortRef = useRef<AbortController | null>(null)

  const clear = useCallback(() => {
    requestAbortRef.current?.abort()
    requestAbortRef.current = null
    setState(IDLE_DRILL_CORRECTION)
  }, [])

  const analyze = useCallback(
    async (
      draftText: string,
      messages: readonly TrainingConversationMessage[]
    ) => {
      const content = draftText.trim()
      if (!enabled || !content) return
      requestAbortRef.current?.abort()
      const controller = new AbortController()
      requestAbortRef.current = controller
      drillDraftSequence += 1
      const draftId = `drill-draft-${trainingSession.sessionId}-${drillDraftSequence}`
      setState({ draftId, draftText: content, status: 'analyzing' })
      try {
        const result = await requestTrainingConversationGuidance(
          trainingApiBase,
          trainingSession,
          trainingDrillDraftMessages(messages, content, draftId),
          null,
          controller.signal
        )
        if (requestAbortRef.current !== controller) return
        setState({
          correction: trainingTurnCorrectionFromGuidance(result),
          draftId,
          draftText: content,
          status: 'ready',
        })
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return
        }
        if (requestAbortRef.current === controller) {
          setState({ draftId, draftText: content, status: 'error' })
        }
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null
        }
      }
    },
    [enabled, trainingApiBase, trainingSession]
  )

  useEffect(() => {
    clear()
  }, [clear, enabled, trainingSession.sessionId])

  useEffect(() => () => requestAbortRef.current?.abort(), [])

  return { analyze, clear, state } as const
}

export function TrainingDrillCorrectionGate({
  disabled = false,
  state,
  language,
  localize,
  onAccept,
  onRetry,
}: {
  readonly disabled?: boolean
  readonly state: TrainingDrillCorrectionState
  readonly language: string
  readonly localize: (english: string, chinese: string) => string
  readonly onAccept: () => void
  readonly onRetry: () => void
}) {
  if (state.status === 'idle') return null

  const correction = state.status === 'ready' ? state.correction : null
  const display = correction
    ? trainingFeedbackEventDisplay(correction.event, language)
    : null
  const destructive =
    correction?.event.severity === 'critical' ||
    correction?.event.severity === 'error'

  return (
    <section
      aria-label={localize('Sentence practice', '逐句练习')}
      aria-live='polite'
      className='border-border/70 border-b px-3 py-2'
    >
      <div className='flex min-w-0 items-start gap-2'>
        <MessageSquareText className='mt-0.5 size-4 shrink-0' />
        <div className='min-w-0 flex-1 space-y-1.5 text-sm'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <span className='font-medium'>
              {localize('Sentence practice', '逐句练习')}
            </span>
            {state.status === 'analyzing' && (
              <Badge variant='secondary'>
                <LoaderCircle className='animate-spin' />
                {localize('Checking this answer', '正在检查本轮表达')}
              </Badge>
            )}
            {display && (
              <Badge variant={destructive ? 'destructive' : 'secondary'}>
                {display.severity}
              </Badge>
            )}
            {state.status === 'error' && (
              <Badge variant='destructive'>
                {localize('Check unavailable', '检查暂不可用')}
              </Badge>
            )}
          </div>

          <p className='text-muted-foreground line-clamp-2'>
            <span className='text-foreground font-medium'>
              {localize('Your answer:', '你的回答：')}
            </span>{' '}
            {state.draftText}
          </p>

          {display && (
            <div className='space-y-1'>
              <p>
                <span className='font-medium'>{display.title}</span>
                <span className='text-muted-foreground'>
                  {' '}
                  · {display.message}
                </span>
              </p>
              {display.suggestedText && (
                <p className='bg-muted rounded-sm px-2 py-1.5'>
                  <span className='font-medium'>
                    {localize('Try again with:', '重说时可以改成：')}
                  </span>{' '}
                  {display.suggestedText}
                </p>
              )}
            </div>
          )}

          {state.status === 'ready' && !display && (
            <p className='text-muted-foreground'>
              {localize(
                'No rewrite is needed. You can continue with this answer.',
                '这次表达不需要改写，可以按原话继续。'
              )}
            </p>
          )}

          {state.status === 'error' && (
            <p className='text-muted-foreground'>
              {localize(
                'This answer was not sent. Continue as-is or try it again.',
                '这次回答尚未发送，你可以按原话继续或重新回答。'
              )}
            </p>
          )}

          <div className='flex flex-wrap gap-2 pt-0.5'>
            <Button
              disabled={disabled}
              size='sm'
              type='button'
              onClick={onAccept}
            >
              {localize('Continue as said', '按原话继续')}
            </Button>
            <Button
              size='sm'
              type='button'
              variant='outline'
              disabled={disabled}
              onClick={onRetry}
            >
              {localize('Answer again', '重新回答')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

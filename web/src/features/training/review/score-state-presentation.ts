import type {
  ReviewEvaluationState,
  ReviewReportState,
  ScenarioScoreStatus,
} from './types'

type Localize = (english: string, chinese: string) => string

export type ReviewScorePresentationState =
  | 'failed'
  | 'scored'
  | 'scoring'
  | 'unavailable'
  | 'unscored'

export function reviewScorePresentation(
  input: {
    evaluationState: ReviewEvaluationState | null
    progressLinked: boolean
    reportState: ReviewReportState
    score: number | null
    scoreStatus: ScenarioScoreStatus
  },
  localize: Localize
): { label: string; state: ReviewScorePresentationState } {
  if (
    input.evaluationState?.status === 'failed' ||
    input.reportState.status === 'failed'
  ) {
    return {
      label: localize('Training score failed', '评分失败'),
      state: 'failed',
    }
  }
  if (input.evaluationState?.status === 'unavailable') {
    return {
      label: localize('Training score unavailable', '评分不可用'),
      state: 'unavailable',
    }
  }
  if (input.score !== null) {
    return {
      label: `${input.score}/100`,
      state: 'scored',
    }
  }
  if (input.progressLinked && input.scoreStatus === 'unavailable') {
    return {
      label: localize('Insufficient scoring evidence', '证据不足'),
      state: 'unavailable',
    }
  }
  if (
    input.reportState.status === 'pending' ||
    (input.progressLinked &&
      input.reportState.status === 'ready' &&
      input.scoreStatus === 'pending')
  ) {
    return {
      label: localize('Training score pending', '评分中'),
      state: 'scoring',
    }
  }
  return {
    label: localize('Training score not available', '未评分'),
    state: 'unscored',
  }
}

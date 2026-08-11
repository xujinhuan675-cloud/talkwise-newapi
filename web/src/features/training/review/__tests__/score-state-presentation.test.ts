import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { reviewScorePresentation } from '../score-state-presentation'
import type { ReviewEvaluationState, ReviewReportState } from '../types'

const localize = (_english: string, chinese: string) => chinese

const reportState: ReviewReportState = {
  status: 'not_requested',
  generation: null,
  message: null,
  completedWithoutReport: false,
}

const evaluationState: ReviewEvaluationState | null = null

function scoreInput(
  overrides: Partial<Parameters<typeof reviewScorePresentation>[0]>
) {
  return {
    evaluationState,
    progressLinked: false,
    reportState,
    score: null,
    scoreStatus: 'pending' as const,
    ...overrides,
  }
}

describe('reviewScorePresentation', () => {
  test('shows completed sessions without a report as unscored', () => {
    assert.deepEqual(
      reviewScorePresentation(
        scoreInput({
          reportState: {
            ...reportState,
            status: 'unavailable',
            completedWithoutReport: true,
          },
          progressLinked: true,
        }),
        localize
      ),
      { label: '未评分', state: 'unscored' }
    )
  })

  test('uses scoring while the report evaluation is pending', () => {
    assert.deepEqual(
      reviewScorePresentation(
        scoreInput({
          reportState: { ...reportState, status: 'pending' },
        }),
        localize
      ),
      { label: '评分中', state: 'scoring' }
    )
  })

  test('keeps report failures distinct from an unscored session', () => {
    assert.deepEqual(
      reviewScorePresentation(
        scoreInput({
          reportState: { ...reportState, status: 'failed' },
        }),
        localize
      ),
      { label: '评分失败', state: 'failed' }
    )
  })

  test('shows a real score when the progress record contains one', () => {
    assert.deepEqual(
      reviewScorePresentation(
        scoreInput({ score: 86, progressLinked: true }),
        localize
      ),
      { label: '86/100', state: 'scored' }
    )
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { reviewReportStatusPresentation } from '../report-state-presentation'
import type { ReviewReportState } from '../types'

const localize = (_english: string, chinese: string) => chinese

function reportState(overrides: Partial<ReviewReportState>): ReviewReportState {
  return {
    status: 'not_requested',
    generation: null,
    message: null,
    completedWithoutReport: false,
    ...overrides,
  }
}

describe('reviewReportStatusPresentation', () => {
  test('shows an intentional completion without a report as neutral', () => {
    assert.deepEqual(
      reviewReportStatusPresentation(
        reportState({
          status: 'unavailable',
          completedWithoutReport: true,
        }),
        localize
      ),
      { label: '未生成', variant: 'neutral' }
    )
  })

  test('keeps a real generation failure destructive', () => {
    assert.deepEqual(
      reviewReportStatusPresentation(
        reportState({
          status: 'failed',
          completedWithoutReport: true,
        }),
        localize
      ),
      { label: '生成失败', variant: 'danger' }
    )
  })

  test('uses a warning for a missing report reference', () => {
    assert.deepEqual(
      reviewReportStatusPresentation(
        reportState({ status: 'unavailable' }),
        localize
      ),
      { label: '暂不可用', variant: 'warning' }
    )
  })
})

import type { ReviewReportState } from './types'

type Localize = (english: string, chinese: string) => string

export type ReviewReportStatusVariant =
  | 'danger'
  | 'neutral'
  | 'success'
  | 'warning'

export function reviewReportStatusPresentation(
  state: ReviewReportState,
  localize: Localize
): { label: string; variant: ReviewReportStatusVariant } {
  if (state.status === 'ready') {
    return {
      label: localize('Ready', '已生成'),
      variant: 'success',
    }
  }
  if (state.status === 'pending') {
    return {
      label: localize('Generating', '生成中'),
      variant: 'warning',
    }
  }
  if (state.status === 'failed') {
    return {
      label: localize('Failed', '生成失败'),
      variant: 'danger',
    }
  }
  if (state.status === 'unavailable' && !state.completedWithoutReport) {
    return {
      label: localize('Temporarily unavailable', '暂不可用'),
      variant: 'warning',
    }
  }
  return {
    label: localize('Not generated', '未生成'),
    variant: 'neutral',
  }
}

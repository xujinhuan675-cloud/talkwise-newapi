import type { TrainingSessionStatus } from './types'

export type TrainingSessionEntryDestination =
  | {
      readonly kind: 'resume'
      readonly search: { readonly session: string }
      readonly to: '/training/conversations'
    }
  | {
      readonly kind: 'review'
      readonly params: { readonly sessionId: string }
      readonly to: '/training/sessions/$sessionId'
    }

export function trainingSessionEntryDestination(
  status: TrainingSessionStatus,
  sessionId: string
): TrainingSessionEntryDestination {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) {
    throw new Error('Training session id is required')
  }

  if (status === 'active') {
    return {
      kind: 'resume',
      search: { session: normalizedSessionId },
      to: '/training/conversations',
    }
  }

  return {
    kind: 'review',
    params: { sessionId: normalizedSessionId },
    to: '/training/sessions/$sessionId',
  }
}

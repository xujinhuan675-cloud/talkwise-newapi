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
import type { TrainingConversationMessage } from './api'

export interface TrainingGuidanceAutoRefreshState {
  readonly initialized: boolean
  readonly observedKey: string | null
  readonly sessionId: string | null
}

export interface TrainingGuidanceAutoRefreshDecision {
  readonly key: string | null
  readonly shouldRefresh: boolean
  readonly state: TrainingGuidanceAutoRefreshState
}

export const EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE: TrainingGuidanceAutoRefreshState =
  {
    initialized: false,
    observedKey: null,
    sessionId: null,
  }

export function trainingGuidanceAutoRefreshKey({
  isGenerating,
  isLoading,
  messages,
  selectedTailId,
  sessionId,
}: {
  readonly isGenerating: boolean
  readonly isLoading: boolean
  readonly messages: readonly TrainingConversationMessage[]
  readonly selectedTailId: string | null
  readonly sessionId: string
}): string | null {
  const normalizedSessionId = sessionId.trim()
  const normalizedTailId = selectedTailId?.trim() || null
  if (isGenerating || isLoading || !normalizedSessionId || !normalizedTailId) {
    return null
  }

  const latestAssistant = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' && message.content.trim().length > 0
    )
  if (!latestAssistant) return null

  return JSON.stringify([
    normalizedSessionId,
    normalizedTailId,
    latestAssistant.publicId,
  ])
}

export function decideTrainingGuidanceAutoRefresh(
  current: TrainingGuidanceAutoRefreshState,
  input: {
    readonly enabled: boolean
    readonly isGenerating: boolean
    readonly isLoading: boolean
    readonly messages: readonly TrainingConversationMessage[]
    readonly selectedTailId: string | null
    readonly sessionId: string
  }
): TrainingGuidanceAutoRefreshDecision {
  if (input.isLoading) {
    return { key: null, shouldRefresh: false, state: current }
  }

  const sessionId = input.sessionId.trim() || null
  const key = trainingGuidanceAutoRefreshKey(input)
  const sessionChanged = current.sessionId !== sessionId

  if (sessionChanged || !current.initialized) {
    return {
      key,
      shouldRefresh: false,
      state: { initialized: true, observedKey: key, sessionId },
    }
  }

  if (!key || key === current.observedKey) {
    return { key, shouldRefresh: false, state: current }
  }

  return {
    key,
    shouldRefresh: input.enabled,
    state: { initialized: true, observedKey: key, sessionId },
  }
}

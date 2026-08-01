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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { TrainingConversationMessage } from './api'
import {
  decideTrainingGuidanceAutoRefresh,
  EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
} from './guidance-refresh'

function message(
  publicId: string,
  role: TrainingConversationMessage['role']
): TrainingConversationMessage {
  return {
    publicId,
    role,
    content: `${role} content`,
    parentMessageId: null,
    branchId: null,
    createdAt: null,
  }
}

describe('training guidance auto refresh', () => {
  test('observes the initial selected path without issuing a request', () => {
    const decision = decideTrainingGuidanceAutoRefresh(
      EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
      {
        enabled: true,
        isGenerating: false,
        isLoading: false,
        messages: [message('assistant-1', 'assistant')],
        selectedTailId: 'assistant-1',
        sessionId: 'session-1',
      }
    )

    assert.equal(decision.shouldRefresh, false)
    assert.equal(decision.state.initialized, true)
    assert.ok(decision.state.observedKey)
  })

  test('does not treat asynchronous initial loading as a path change', () => {
    const loading = decideTrainingGuidanceAutoRefresh(
      EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
      {
        enabled: true,
        isGenerating: false,
        isLoading: true,
        messages: [],
        selectedTailId: null,
        sessionId: 'session-1',
      }
    )
    const loaded = decideTrainingGuidanceAutoRefresh(loading.state, {
      enabled: true,
      isGenerating: false,
      isLoading: false,
      messages: [message('assistant-1', 'assistant')],
      selectedTailId: 'assistant-1',
      sessionId: 'session-1',
    })

    assert.equal(loading.state.initialized, false)
    assert.equal(loaded.shouldRefresh, false)
    assert.ok(loaded.state.observedKey)
  })

  test('refreshes once after a stable assistant completion', () => {
    const initial = decideTrainingGuidanceAutoRefresh(
      EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
      {
        enabled: true,
        isGenerating: false,
        isLoading: false,
        messages: [message('assistant-1', 'assistant')],
        selectedTailId: 'assistant-1',
        sessionId: 'session-1',
      }
    )
    const generating = decideTrainingGuidanceAutoRefresh(initial.state, {
      enabled: true,
      isGenerating: true,
      isLoading: false,
      messages: [
        message('assistant-1', 'assistant'),
        message('assistant-2', 'assistant'),
      ],
      selectedTailId: 'assistant-2',
      sessionId: 'session-1',
    })
    const completed = decideTrainingGuidanceAutoRefresh(generating.state, {
      enabled: true,
      isGenerating: false,
      isLoading: false,
      messages: [
        message('assistant-1', 'assistant'),
        message('assistant-2', 'assistant'),
      ],
      selectedTailId: 'assistant-2',
      sessionId: 'session-1',
    })
    const repeated = decideTrainingGuidanceAutoRefresh(completed.state, {
      enabled: true,
      isGenerating: false,
      isLoading: false,
      messages: [
        message('assistant-1', 'assistant'),
        message('assistant-2', 'assistant'),
      ],
      selectedTailId: 'assistant-2',
      sessionId: 'session-1',
    })

    assert.equal(generating.shouldRefresh, false)
    assert.equal(completed.shouldRefresh, true)
    assert.equal(repeated.shouldRefresh, false)
  })

  test('refreshes a changed selected path once even with the same assistant', () => {
    const initial = decideTrainingGuidanceAutoRefresh(
      EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
      {
        enabled: true,
        isGenerating: false,
        isLoading: false,
        messages: [message('assistant-1', 'assistant')],
        selectedTailId: 'assistant-1',
        sessionId: 'session-1',
      }
    )
    const changed = decideTrainingGuidanceAutoRefresh(initial.state, {
      enabled: true,
      isGenerating: false,
      isLoading: false,
      messages: [message('assistant-1', 'assistant')],
      selectedTailId: 'user-leaf',
      sessionId: 'session-1',
    })

    assert.equal(changed.shouldRefresh, true)
  })

  test('disabled auto refresh advances the baseline without a later burst', () => {
    const initial = decideTrainingGuidanceAutoRefresh(
      EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
      {
        enabled: true,
        isGenerating: false,
        isLoading: false,
        messages: [message('assistant-1', 'assistant')],
        selectedTailId: 'assistant-1',
        sessionId: 'session-1',
      }
    )
    const disabled = decideTrainingGuidanceAutoRefresh(initial.state, {
      enabled: false,
      isGenerating: false,
      isLoading: false,
      messages: [message('assistant-2', 'assistant')],
      selectedTailId: 'assistant-2',
      sessionId: 'session-1',
    })
    const reenabled = decideTrainingGuidanceAutoRefresh(disabled.state, {
      enabled: true,
      isGenerating: false,
      isLoading: false,
      messages: [message('assistant-2', 'assistant')],
      selectedTailId: 'assistant-2',
      sessionId: 'session-1',
    })

    assert.equal(disabled.shouldRefresh, false)
    assert.equal(reenabled.shouldRefresh, false)
  })
})

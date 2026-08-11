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

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { TrainingConversationGuidanceResult } from './api'
import {
  TrainingDrillCorrectionGate,
  trainingDrillDraftMessages,
  trainingTurnCorrectionFromGuidance,
} from './training-turn-correction'

function guidanceResult(): TrainingConversationGuidanceResult {
  return {
    sessionId: 'session-1',
    source: 'live_guidance',
    contextRuntime: 'message_tree',
    contextSelection: 'selected_path',
    selectedTailMessageId: 'assistant-2',
    windowSize: 5,
    totalTurnCount: 4,
    capabilities: {
      refresh: true,
      stream: false,
      persistence: true,
      history: true,
      serverSelectedPath: true,
    },
    events: [
      {
        eventType: 'next_reply',
        severity: 'info',
        title: 'Next reply',
        message: 'Give a concise answer.',
        suggestedText: 'Lead with the answer.',
        createdAt: null,
      },
      {
        eventType: 'risk',
        severity: 'warning',
        title: 'Risk',
        message: 'Acknowledge the objection.',
        suggestedText: null,
        createdAt: null,
      },
    ],
    history: [],
    persistence: {
      status: 'ready',
      retryable: false,
      persisted: true,
      code: null,
      snapshotId: 'snapshot-1',
      selectedTailMessageId: 'assistant-2',
      savedCount: 2,
      historyCount: 1,
      historyLimit: 20,
      deduplicated: false,
    },
  }
}

describe('turn correction selection', () => {
  test('selects one highest-priority event for the held draft gate', () => {
    const correction = trainingTurnCorrectionFromGuidance(guidanceResult())

    assert.equal(correction?.event.eventType, 'risk')
    assert.match(correction?.key ?? '', /assistant-2:risk/)
  })

  test('does not invent a correction when the coach returned no event', () => {
    const result = guidanceResult()
    result.events.splice(0)

    assert.equal(trainingTurnCorrectionFromGuidance(result), null)
    assert.equal(trainingTurnCorrectionFromGuidance(null), null)
  })

  test('adds an unpersisted learner draft without changing prior messages', () => {
    const priorMessage = {
      publicId: 'assistant-1',
      role: 'assistant' as const,
      content: 'What matters most?',
      parentMessageId: null,
      branchId: 'main',
      createdAt: null,
    }
    const originalMessages = [priorMessage]
    const messages = trainingDrillDraftMessages(
      originalMessages,
      '  Maybe tomorrow.  ',
      'draft-1'
    )

    assert.deepEqual(originalMessages, [priorMessage])
    assert.equal(messages[0], priorMessage)
    assert.equal(messages.length, 2)
    assert.equal(messages[1]?.publicId, 'draft-1')
    assert.equal(messages[1]?.role, 'user')
    assert.equal(messages[1]?.content, 'Maybe tomorrow.')
    assert.deepEqual(messages[1]?.metadata, {
      persisted: false,
      source: 'training_drill_draft',
    })
    assert.equal(messages[1]?.parentMessageId, 'assistant-1')
    assert.equal(messages[1]?.branchId, 'main')
    assert.equal(messages[1]?.createdAt, null)
  })

  test('does not create a draft message for an empty learner answer', () => {
    const priorMessage = {
      publicId: 'assistant-1',
      role: 'assistant' as const,
      content: 'What matters most?',
      parentMessageId: null,
      branchId: 'main',
      createdAt: null,
    }

    const messages = trainingDrillDraftMessages(
      [priorMessage],
      '   ',
      'draft-1'
    )

    assert.deepEqual(messages, [priorMessage])
  })

  test('renders no persistent correction strip before a draft exists', () => {
    const markup = renderToStaticMarkup(
      createElement(TrainingDrillCorrectionGate, {
        state: { status: 'idle' },
        language: 'en-US',
        localize: (english: string) => english,
        onAccept: () => undefined,
        onRetry: () => undefined,
      })
    )

    assert.equal(markup, '')
  })

  test('renders the held answer and both choices in the compact gate', () => {
    const markup = renderToStaticMarkup(
      createElement(TrainingDrillCorrectionGate, {
        state: {
          status: 'ready',
          draftId: 'draft-1',
          draftText: 'Maybe tomorrow.',
          correction: null,
        },
        language: 'en-US',
        localize: (english: string) => english,
        onAccept: () => undefined,
        onRetry: () => undefined,
      })
    )

    assert.match(markup, /Maybe tomorrow\./)
    assert.match(markup, /Continue as said/)
    assert.match(markup, /Answer again/)
    assert.match(markup, /<section[^>]*class="[^"]*w-full/)
    assert.doesNotMatch(markup, /Waiting for an answer/)
    assert.doesNotMatch(markup, /bg-muted\/20/)
  })
})

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
  projectTrainingConversationTree,
  selectTrainingConversationBranch,
} from './branch-model'

function message(
  publicId: string,
  parentMessageId: string | null,
  createdAt: string,
  branchId = 'main'
): TrainingConversationMessage {
  return {
    publicId,
    role: publicId.includes('assistant') ? 'assistant' : 'user',
    content: publicId,
    parentMessageId,
    branchId,
    createdAt,
  }
}

describe('training conversation branch model', () => {
  test('projects the deterministic latest root-to-tail path', () => {
    const messages = [
      message('assistant-1', 'user-1', '2026-07-31T08:02:00Z'),
      message('root', null, '2026-07-31T08:00:00Z'),
      message('user-1', 'root', '2026-07-31T08:01:00Z'),
    ]

    const projection = projectTrainingConversationTree(messages)

    assert.deepEqual(
      projection.path.map((item) => item.publicId),
      ['root', 'user-1', 'assistant-1']
    )
    assert.equal(projection.selectedTailId, 'assistant-1')
    assert.deepEqual(
      projection.branchSteps.map((step) => step.selectedMessageId),
      ['root', 'user-1', 'assistant-1']
    )
  })

  test('exposes sibling options and follows the selected branch to its tail', () => {
    const messages = [
      message('root', null, '2026-07-31T08:00:00Z'),
      message('user-1', 'root', '2026-07-31T08:01:00Z'),
      message('assistant-a', 'user-1', '2026-07-31T08:02:00Z'),
      message('user-a-tail', 'assistant-a', '2026-07-31T08:03:00Z'),
      message('assistant-b', 'user-1', '2026-07-31T08:04:00Z', 'branch-b'),
      message('user-b-tail', 'assistant-b', '2026-07-31T08:05:00Z', 'branch-b'),
    ]

    const initial = projectTrainingConversationTree(messages, 'user-a-tail')
    const branchStep = initial.branchSteps.find(
      (step) => step.parentMessageId === 'user-1'
    )
    assert.deepEqual(
      branchStep?.options.map((option) => ({
        id: option.message.publicId,
        selected: option.selected,
      })),
      [
        { id: 'assistant-a', selected: true },
        { id: 'assistant-b', selected: false },
      ]
    )

    const selected = selectTrainingConversationBranch(
      messages,
      initial.selectedTailId,
      'assistant-b'
    )
    assert.deepEqual(
      selected.path.map((item) => item.publicId),
      ['root', 'user-1', 'assistant-b', 'user-b-tail']
    )
  })

  test('uses an explicit valid tail and preserves the path on unsafe selection', () => {
    const messages = [
      message('root', null, '2026-07-31T08:00:00Z'),
      message('older', 'root', '2026-07-31T08:01:00Z'),
      message('older-tail', 'older', '2026-07-31T08:02:00Z'),
      message('newer', 'root', '2026-07-31T08:03:00Z'),
    ]

    const projection = projectTrainingConversationTree(messages, 'older-tail')
    assert.deepEqual(
      projection.path.map((item) => item.publicId),
      ['root', 'older', 'older-tail']
    )

    const unchanged = selectTrainingConversationBranch(
      messages,
      projection.selectedTailId,
      'missing-message'
    )
    assert.deepEqual(unchanged, projection)
  })

  test('excludes orphans and cycles without changing the valid projection', () => {
    const messages = [
      message('cycle-b', 'cycle-a', '2026-07-31T09:01:00Z'),
      message('valid-tail', 'valid-root', '2026-07-31T08:01:00Z'),
      message('orphan', 'missing-parent', '2026-07-31T10:00:00Z'),
      message('cycle-a', 'cycle-b', '2026-07-31T09:00:00Z'),
      message('valid-root', null, '2026-07-31T08:00:00Z'),
    ]

    const projection = projectTrainingConversationTree(messages)
    const reordered = projectTrainingConversationTree([...messages].reverse())

    assert.deepEqual(
      projection.path.map((item) => item.publicId),
      ['valid-root', 'valid-tail']
    )
    assert.deepEqual(projection.excludedMessageIds, [
      'cycle-a',
      'cycle-b',
      'orphan',
    ])
    assert.deepEqual(reordered, projection)
  })
})

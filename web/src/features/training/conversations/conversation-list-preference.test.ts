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

import {
  loadTrainingConversationListExpanded,
  saveTrainingConversationListExpanded,
  TRAINING_CONVERSATION_LIST_PREFERENCE_KEY,
} from './conversation-list-preference'

describe('training conversation list preference', () => {
  test('defaults to expanded and restores either saved state', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    assert.equal(loadTrainingConversationListExpanded(storage), true)
    saveTrainingConversationListExpanded(storage, false)
    assert.equal(
      values.get(TRAINING_CONVERSATION_LIST_PREFERENCE_KEY),
      'collapsed'
    )
    assert.equal(loadTrainingConversationListExpanded(storage), false)
    saveTrainingConversationListExpanded(storage, true)
    assert.equal(loadTrainingConversationListExpanded(storage), true)
  })

  test('storage failures leave the list expanded and toggling usable', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    assert.equal(loadTrainingConversationListExpanded(storage), true)
    assert.doesNotThrow(() =>
      saveTrainingConversationListExpanded(storage, false)
    )
  })
})

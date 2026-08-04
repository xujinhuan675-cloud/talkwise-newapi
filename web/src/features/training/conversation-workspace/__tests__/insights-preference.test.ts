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
  loadTrainingInsightsExpanded,
  saveTrainingInsightsExpanded,
  TRAINING_INSIGHTS_PREFERENCE_KEY,
} from '../insights-preference'

describe('training insights preference', () => {
  test('defaults to expanded and restores the saved collapsed state', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    assert.equal(loadTrainingInsightsExpanded(storage), true)
    saveTrainingInsightsExpanded(storage, false)
    assert.equal(values.get(TRAINING_INSIGHTS_PREFERENCE_KEY), 'collapsed')
    assert.equal(loadTrainingInsightsExpanded(storage), false)
    saveTrainingInsightsExpanded(storage, true)
    assert.equal(loadTrainingInsightsExpanded(storage), true)
  })

  test('storage failures keep the panel usable', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }

    assert.equal(loadTrainingInsightsExpanded(storage), true)
    assert.doesNotThrow(() => saveTrainingInsightsExpanded(storage, false))
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  waveformBarCountForWidth,
  waveformLevelsFromFrequencyData,
} from '../turn-based-voice-waveform'

describe('turn-based voice waveform', () => {
  test('maps real frequency energy into a stable number of bars', () => {
    const data = new Uint8Array(24)
    data[0] = 255
    data[23] = 128

    const levels = waveformLevelsFromFrequencyData(data, 4)

    assert.equal(levels.length, 4)
    assert.equal(levels[0], 1)
    assert.equal(levels[1], 0.08)
    assert.equal(levels[2], 0.08)
    assert.ok(levels[3] > levels[1])
  })

  test('keeps silence visible at a quiet baseline without changing bar count', () => {
    const levels = waveformLevelsFromFrequencyData(new Uint8Array(), 6)

    assert.deepEqual(levels, [0.08, 0.08, 0.08, 0.08, 0.08, 0.08])
  })

  test('adds frequency bars as the visible waveform container grows', () => {
    assert.equal(waveformBarCountForWidth(56), 12)
    assert.equal(waveformBarCountForWidth(240), 30)
    assert.equal(waveformBarCountForWidth(640), 64)
  })
})

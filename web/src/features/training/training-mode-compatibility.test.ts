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
  isTrainingInteractionModeCompatible,
  resolveTrainingInteractionMode,
  trainingFeedbackRequiredInteractionMode,
} from './training-mode-compatibility'

describe('training mode compatibility', () => {
  test('binds voice drills to turn-based interaction', () => {
    assert.equal(trainingFeedbackRequiredInteractionMode('drill'), 'turn_based')
    assert.equal(
      resolveTrainingInteractionMode({
        modality: 'voice',
        feedbackMode: 'drill',
        interactionMode: 'realtime',
      }),
      'turn_based'
    )
  })

  test('binds assisted voice coaching to realtime interaction', () => {
    assert.equal(
      trainingFeedbackRequiredInteractionMode('assisted'),
      'realtime'
    )
    assert.equal(
      resolveTrainingInteractionMode({
        modality: 'voice',
        feedbackMode: 'assisted',
        interactionMode: 'turn_based',
      }),
      'realtime'
    )
  })

  test('keeps both voice interactions available for simulation', () => {
    assert.equal(trainingFeedbackRequiredInteractionMode('simulation'), null)
    assert.equal(
      resolveTrainingInteractionMode({
        modality: 'voice',
        feedbackMode: 'simulation',
        interactionMode: 'realtime',
      }),
      'realtime'
    )
  })

  test('does not constrain non-voice training or persisted sessions', () => {
    assert.equal(
      resolveTrainingInteractionMode({
        modality: 'video',
        feedbackMode: 'drill',
        interactionMode: 'realtime',
      }),
      'realtime'
    )
    assert.equal(
      isTrainingInteractionModeCompatible({
        modality: 'voice',
        feedbackMode: 'assisted',
        interactionMode: 'turn_based',
      }),
      false
    )
  })
})

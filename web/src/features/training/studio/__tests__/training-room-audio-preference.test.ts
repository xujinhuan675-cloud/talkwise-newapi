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
import { test } from 'node:test'

import {
  findTrainingOpeningMessage,
  hasPlayedTrainingOpening,
  loadTrainingRoomAudioEnabled,
  markTrainingOpeningPlayed,
  saveTrainingRoomAudioEnabled,
} from '../training-room-audio-preference'
import type { TrainingRoomMessage } from '../training-room-client'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

function message(
  id: string,
  metadata: Record<string, unknown>
): TrainingRoomMessage {
  return {
    content: '你好，我想了解一下新客优惠。',
    emotionLabel: null,
    emotionScore: null,
    id,
    metadata,
    roomId: '42',
    senderId: 'persona-1',
    senderType: 'persona',
    timestamp: null,
    videoAnswer: null,
  }
}

test('persists the voice output preference across room entries', () => {
  const target = storage()
  assert.equal(loadTrainingRoomAudioEnabled(target, true), true)
  saveTrainingRoomAudioEnabled(target, false)
  assert.equal(loadTrainingRoomAudioEnabled(target, true), false)
  saveTrainingRoomAudioEnabled(target, true)
  assert.equal(loadTrainingRoomAudioEnabled(target, false), true)
})

test('finds the persisted scenario opening and records one playback', () => {
  const target = storage()
  const opening = message('opening-1', { eventKind: 'scenario_opening' })
  assert.equal(findTrainingOpeningMessage([opening])?.id, 'opening-1')
  assert.equal(hasPlayedTrainingOpening(target, 'session-1', opening.id), false)
  markTrainingOpeningPlayed(target, 'session-1', opening.id)
  assert.equal(hasPlayedTrainingOpening(target, 'session-1', opening.id), true)
})

test('does not treat ordinary persona replies as the opening', () => {
  assert.equal(findTrainingOpeningMessage([message('reply-1', {})]), null)
})

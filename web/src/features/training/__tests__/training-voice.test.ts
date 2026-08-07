/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  DEFAULT_TRAINING_VOICE_ID,
  TRAINING_VOICE_OPTIONS,
  trainingVoiceDisplayName,
} from '../training-voice'

describe('training voice presentation', () => {
  test('uses the Chinese label for a known voice', () => {
    assert.equal(
      trainingVoiceDisplayName(DEFAULT_TRAINING_VOICE_ID),
      'Vivi 2.0（活泼女声）'
    )
  })

  test('keeps an unknown persisted ID visible with a Chinese fallback', () => {
    assert.equal(
      trainingVoiceDisplayName('legacy-voice-id', TRAINING_VOICE_OPTIONS),
      '未验证音色（legacy-voice-id）'
    )
  })

  test('uses the empty-state label when no voice is configured', () => {
    assert.equal(trainingVoiceDisplayName(null), '未设置音色')
  })
})

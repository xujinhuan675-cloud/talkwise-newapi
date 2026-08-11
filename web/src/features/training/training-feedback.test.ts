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
  TRAINING_FEEDBACK_MODE_OPTIONS,
  trainingFeedbackEventDisplay,
  trainingFeedbackModeFromMetadata,
} from './training-feedback'

describe('training feedback display contract', () => {
  test('keeps the three in-session feedback channels distinct', () => {
    const descriptions = Object.fromEntries(
      TRAINING_FEEDBACK_MODE_OPTIONS.map((option) => [
        option.value,
        option.description.english,
      ])
    )

    assert.match(descriptions.simulation, /No in-session coaching/)
    assert.match(descriptions.assisted, /only in the Coach panel/)
    assert.match(descriptions.drill, /held before it reaches the counterpart/)
    assert.match(descriptions.drill, /continue as said or answer again/)
  })

  test('reads the persisted mode without inventing a coaching channel', () => {
    assert.equal(trainingFeedbackModeFromMetadata({ feedbackMode: 'drill' }), 'drill')
    assert.equal(
      trainingFeedbackModeFromMetadata({ trainingFeedbackMode: 'assisted' }),
      'assisted'
    )
    assert.equal(trainingFeedbackModeFromMetadata({ feedbackMode: 'unknown' }), 'simulation')
  })

  test('does not expose English event fields in a Chinese locale', () => {
    assert.deepEqual(
      trainingFeedbackEventDisplay(
        {
          eventType: 'risk',
          severity: 'warning',
          title: 'Objection surfaced',
          message: 'The counterpart signaled resistance.',
          suggestedText: 'Can I check the main concern?',
        },
        'zh-CN'
      ),
      {
        severity: '注意',
        title: '风险提示',
        message: '对方表示出保留或异议，请先确认对方的顾虑，再继续表达。',
        suggestedText: '这个顾虑可以理解。您最关注的是影响、成本还是时间？',
      }
    )
  })

  test('keeps an absent correction rewrite absent', () => {
    assert.equal(
      trainingFeedbackEventDisplay(
        {
          eventType: 'correction',
          severity: 'info',
          title: 'Correction',
          message: 'Review the latest answer.',
          suggestedText: null,
        },
        'zh-CN'
      ).suggestedText,
      null
    )
  })

  test('keeps server event copy unchanged outside Chinese locales', () => {
    assert.deepEqual(
      trainingFeedbackEventDisplay(
        {
          eventType: 'ask_back',
          severity: 'info',
          title: 'Ask a question',
          message: 'Clarify the priority.',
          suggestedText: null,
        },
        'en-US'
      ),
      {
        severity: 'info',
        title: 'Ask a question',
        message: 'Clarify the priority.',
        suggestedText: null,
      }
    )
  })
})

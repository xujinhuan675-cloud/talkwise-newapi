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
  TALKWISE_BATTLE_PREP_API,
  TALKWISE_DEFENSE_PREP_API,
  TALKWISE_SCOPED_PERSONAS_API,
  battlePrepStartPayload,
} from '../api'

describe('training preparation API contract', () => {
  test('uses the narrow NewAPI proxy namespaces', () => {
    assert.equal(TALKWISE_BATTLE_PREP_API, '/api/talkwise/battle-prep')
    assert.equal(TALKWISE_DEFENSE_PREP_API, '/api/talkwise/defense-prep')
    assert.equal(
      TALKWISE_SCOPED_PERSONAS_API,
      '/api/talkwise/conversations/personas'
    )
  })

  test('builds a battle start request without client-owned identity fields', () => {
    assert.deepEqual(
      battlePrepStartPayload({
        preparation: {
          personaName: 'Jordan Lee',
          personaRole: 'Procurement director',
          personaStyle: 'Direct and detail-oriented.',
          scenarioContext: 'Renewal negotiation.',
          trainingPoints: ['Clarify value'],
        },
        selectedTrainingPoints: ['Clarify value', 'Clarify value', ' '],
        difficulty: 'hard',
        replyLanguage: ' zh-CN ',
      }),
      {
        persona_name: 'Jordan Lee',
        persona_role: 'Procurement director',
        persona_style: 'Direct and detail-oriented.',
        scenario_context: 'Renewal negotiation.',
        selected_training_points: ['Clarify value'],
        difficulty: 'hard',
        reply_language: 'zh-CN',
      }
    )
  })
})

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
  buildLiveCoachSessionInput,
  buildStudioSessionRequest,
  buildStudioStartRequest,
  normalizeRealtimeReadiness,
} from '../api'

describe('training studio adapter', () => {
  test('builds a scoped session request without client-owned identity fields', () => {
    const request = buildStudioSessionRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'voice',
      feedbackMode: 'assisted',
    })

    assert.equal(request.mode, 'voice')
    assert.equal(request.task_config.metadata.source, 'newapi_training_studio')
    assert.equal(request.task_config.metadata.feedbackMode, 'assisted')
    assert.equal('user_id' in request, false)
    assert.equal('team_id' in request, false)
  })

  test('uses the message-tree runtime for text sessions without room-only payloads', () => {
    const request = buildStudioStartRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'text',
      feedbackMode: 'simulation',
    })

    assert.deepEqual(request, { runtime: 'conversation_message_tree' })
    assert.equal('runtime_persona' in request, false)
    assert.equal('opening_message' in request, false)
  })

  test('builds room-backed runtime persona data for voice and video sessions', () => {
    const request = buildStudioStartRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'voice',
      feedbackMode: 'simulation',
    })

    assert.equal(request.room_type, 'battle_prep')
    assert.equal(request.runtime_persona.role, 'Training counterpart')
    assert.equal(
      request.opening_message.metadata.source,
      'newapi_training_studio'
    )
  })

  test('preserves language intent in the live coach training context', () => {
    const input = buildLiveCoachSessionInput({
      goal: 'Practice a concise answer.',
      sourceLanguage: 'Chinese',
      targetLanguage: 'English',
    })

    assert.equal(input.mode, 'voice')
    assert.equal(input.feedbackMode, 'assisted')
    assert.match(
      input.goal,
      /Source language: Chinese; target language: English/
    )
    assert.deepEqual(input.liveCoach, {
      sourceLanguage: 'Chinese',
      targetLanguage: 'English',
    })
  })

  test('reduces backend realtime capability payloads to a safe readiness state', () => {
    assert.deepEqual(
      normalizeRealtimeReadiness({
        pipecat: { readyForCall: true, provider: 'pipecat' },
      }),
      {
        ready: true,
        provider: 'pipecat',
        message: 'The realtime provider reports that it is ready for a call.',
      }
    )
    assert.equal(
      normalizeRealtimeReadiness({
        providers: {
          pipecat: { readyForCall: false, error: 'Missing capability' },
        },
      }).message,
      'Missing capability'
    )
  })
})

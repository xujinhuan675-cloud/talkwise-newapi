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
  buildRealtimeHandoffSessionRequest,
  buildRealtimeHandoffStartRequest,
  buildStudioSessionRequest,
  buildStudioStartRequest,
  normalizeRealtimeReadiness,
  type TrainingSessionDTO,
} from '../api'

const textSessionSource: TrainingSessionDTO = {
  session_id: 'text-session-1',
  scenario_template_id: 'renewal-objection',
  mode: 'text',
  status: 'active',
  task_config: {
    role: 'Account manager',
    level: 'hard',
    tech_stack: ['Renewal objection', 'category:negotiation'],
    question_type_ratios: { discovery: 50, delivery: 50 },
    question_count: 8,
    framework: 'prep',
    difficulty: 'hard',
    category: 'negotiation',
    rubric_version: 'communication-v1',
    rubric_weights: { discovery: 0.5, delivery: 0.5 },
    metadata: {
      source: 'scenario_training',
      ownerUserId: 'must-not-cross-the-client-boundary',
      selectedPath: { tailMessageId: 'text-tail' },
      reportId: 'report-1',
      conversationId: 'conversation-source',
      roomId: 'room-source',
      messageTreeSelection: { tailMessageId: 'text-tail' },
      overallScore: 99,
      scoreStatus: 'complete',
      isComplete: true,
      trainingPlan: { version: 1, pressure: 'hard' },
      scenario_training: {
        title: 'Renewal objection',
        description: 'Discuss the upcoming renewal.',
        customer_profile: 'A skeptical procurement lead.',
        opening_line: 'Your renewal price is too high.',
        training_points: ['Clarify the objection', 'Defend value'],
        persona: {
          name: 'Lin Wei',
          role: 'Procurement lead',
          style: 'Direct and evidence-driven',
        },
        trainingMode: 'text',
        interactionMode: 'turn_based',
      },
    },
  },
}

describe('training studio adapter', () => {
  test('builds a scoped session request without client-owned identity fields', () => {
    const request = buildStudioSessionRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'voice',
      feedbackMode: 'assisted',
      pressure: 'hard',
      lengthProfile: 'complete',
    })

    assert.equal(request.mode, 'voice')
    assert.equal(request.task_config.metadata.source, 'newapi_training_studio')
    assert.equal(request.task_config.metadata.feedbackMode, 'assisted')
    assert.equal(request.task_config.question_count, 12)
    assert.equal(request.task_config.difficulty, 'hard')
    assert.deepEqual(request.task_config.metadata.trainingPlan, {
      version: 1,
      kind: 'conversation',
      focus: { scope: 'custom', selected: ['Handle a pricing objection.'] },
      pressure: 'hard',
      length: { profile: 'complete', turnBudget: 12 },
      completion: { strategy: 'adaptive', explicitFinish: true },
    })
    assert.equal('user_id' in request, false)
    assert.equal('team_id' in request, false)
  })

  test('uses the message-tree runtime and the shared opening payload for text sessions', () => {
    const request = buildStudioStartRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'text',
      feedbackMode: 'simulation',
    })

    assert.equal(request.runtime, 'conversation_message_tree')
    assert.equal('runtime_persona' in request, false)
    assert.equal(
      request.opening_message.content,
      "Let's begin. Handle a pricing objection."
    )
    assert.equal(
      request.opening_message.metadata.source,
      'newapi_training_studio'
    )
  })

  test('builds room-backed runtime persona data for voice and video sessions', () => {
    const request = buildStudioStartRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'voice',
      feedbackMode: 'simulation',
      pressure: 'hard',
    })

    assert.equal(request.room_type, 'battle_prep')
    assert.equal(request.runtime_persona.role, 'Training counterpart')
    assert.equal(request.runtime_persona.difficulty, 'hard')
    assert.equal(
      request.opening_message.metadata.source,
      'newapi_training_studio'
    )
  })

  test('binds realtime profile and latency semantics to the training session', () => {
    const request = buildStudioSessionRequest({
      role: 'Account manager',
      goal: 'Handle a pricing objection.',
      mode: 'realtime',
      feedbackMode: 'assisted',
      realtimeProfile: 'speech_to_speech',
    })

    assert.equal(request.mode, 'realtime')
    assert.equal(request.task_config.metadata.interactionMode, 'realtime')
    assert.equal(
      request.task_config.metadata.realtimeProfile,
      'speech_to_speech'
    )
    assert.equal(request.task_config.metadata.latencyProfile, 'true_realtime')
  })

  test('creates a clean realtime session handoff from persisted text training context', () => {
    const request = buildRealtimeHandoffSessionRequest(textSessionSource)
    const scenarioTraining = request.task_config.metadata
      .scenario_training as Record<string, unknown>

    assert.equal(request.mode, 'realtime')
    assert.equal(request.scenario_template_id, 'renewal-objection')
    assert.equal(request.task_config.role, 'Account manager')
    assert.deepEqual(request.task_config.metadata.trainingPlan, {
      version: 1,
      pressure: 'hard',
    })
    assert.equal(
      request.task_config.metadata.source,
      'conversation_realtime_handoff'
    )
    assert.equal(request.task_config.metadata.interactionMode, 'realtime')
    assert.equal(request.task_config.metadata.realtimeProfile, 'cascade')
    assert.equal(scenarioTraining.trainingMode, 'realtime')
    assert.equal(scenarioTraining.interactionMode, 'realtime')
    assert.equal('ownerUserId' in request.task_config.metadata, false)
    assert.equal('selectedPath' in request.task_config.metadata, false)
    assert.equal('reportId' in request.task_config.metadata, false)
    assert.equal('conversationId' in request.task_config.metadata, false)
    assert.equal('roomId' in request.task_config.metadata, false)
    assert.equal('messageTreeSelection' in request.task_config.metadata, false)
    assert.equal('overallScore' in request.task_config.metadata, false)
    assert.equal('scoreStatus' in request.task_config.metadata, false)
    assert.equal('isComplete' in request.task_config.metadata, false)
  })

  test('starts the Pipecat handoff with the persisted scenario persona and opening', () => {
    const request = buildRealtimeHandoffStartRequest(textSessionSource)

    assert.equal(request.room_type, 'battle_prep')
    assert.equal(request.runtime_persona.name, 'Lin Wei')
    assert.equal(request.runtime_persona.role, 'Procurement lead')
    assert.equal(request.runtime_persona.difficulty, 'hard')
    assert.deepEqual(request.runtime_persona.training_points, [
      'Clarify the objection',
      'Defend value',
    ])
    assert.equal(
      request.opening_message?.content,
      'Your renewal price is too high.'
    )
    assert.equal(request.opening_message?.metadata.trainingMode, 'realtime')
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
    assert.deepEqual(
      normalizeRealtimeReadiness({
        active: {
          provider: 'volcengine.doubao_realtime',
          readyForCall: true,
        },
        activeProvider: 'volcengine.doubao_realtime',
      }),
      {
        ready: true,
        provider: 'volcengine.doubao_realtime',
        message: 'The realtime provider reports that it is ready for a call.',
      }
    )
  })
})

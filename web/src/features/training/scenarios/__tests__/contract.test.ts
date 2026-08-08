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

import { TRAINING_FEEDBACK_MODE_OPTIONS } from '../../training-feedback'
import { DEFAULT_TRAINING_VOICE_ID } from '../../training-voice'
import {
  buildScenarioStartRequest,
  buildTrainingSessionRequest,
  filterTrainingScenarios,
  isTrainingModeSelectionAvailable,
  ScenarioTrainingStartError,
  toTrainingScenario,
  trainingSessionModeForSelection,
  trainingApiUrl,
} from '../api'

const template = {
  id: 'renewal-objection',
  title: 'Renewal objection',
  description: 'Handle a budget objection before contract renewal.',
  customer_profile: 'A procurement lead comparing two vendors.',
  difficulty: 'hard',
  category: 'negotiation',
  required: true,
  opening_line: 'Your renewal price is too high.',
  persona: {
    name: 'Lin Wei',
    role: 'Procurement lead',
    style: 'Direct and evidence-driven',
  },
  learner_role: 'Account manager',
  framework: 'prep',
  training_points: ['Clarify the objection', 'Defend value with evidence'],
  dimension_weights: [
    { dimension_id: 'discovery', weight: 40 },
    { dimension_id: 'value', weight: 60 },
  ],
}

describe('training scenario contract', () => {
  test('uses the same-origin NewAPI training proxy unless a base is injected', () => {
    assert.equal(
      trainingApiUrl('', '/scenario-templates'),
      '/api/talkwise/training/scenario-templates'
    )
    assert.equal(
      trainingApiUrl(
        'https://talkwise.example/api/v1/training-studio/',
        '/sessions'
      ),
      'https://talkwise.example/api/v1/training-studio/sessions'
    )
  })

  test('maps backend snake-case templates without losing training semantics', () => {
    const scenario = toTrainingScenario(template)

    assert.equal(scenario.customerProfile, template.customer_profile)
    assert.deepEqual(scenario.persona, {
      avatarUrl: null,
      ...template.persona,
    })
    assert.deepEqual(scenario.dimensionWeights, [
      { dimensionId: 'discovery', weight: 40 },
      { dimensionId: 'value', weight: 60 },
    ])
  })

  test('builds a scoped session request without client-supplied user or team ids', () => {
    const request = buildTrainingSessionRequest(
      toTrainingScenario(template),
      'voice',
      {
        focusScope: 'custom',
        selectedFocus: ['Clarify decision criteria'],
        pressure: 'hard',
        lengthProfile: 'quick',
      },
      DEFAULT_TRAINING_VOICE_ID,
      'simulation',
      undefined,
      'cascade-standard'
    )

    assert.equal(request.mode, 'voice')
    assert.equal(request.scenario_template_id, template.id)
    assert.equal('user_id' in request, false)
    assert.equal('team_id' in request, false)
    assert.deepEqual(request.task_config.rubric_weights, {
      discovery: 0.4,
      value: 0.6,
    })
    assert.equal(request.task_config.metadata.trainingMode, 'voice')
    assert.equal(request.task_config.metadata.voiceRouteId, 'cascade-standard')
    assert.equal(request.task_config.metadata.source, 'scenario_training')
    assert.equal(
      request.task_config.metadata.trainingVoiceId,
      DEFAULT_TRAINING_VOICE_ID
    )
    assert.equal(request.task_config.question_count, 6)
    assert.equal(request.task_config.difficulty, 'hard')
    assert.deepEqual(request.task_config.metadata.trainingPlan, {
      version: 1,
      kind: 'conversation',
      focus: { scope: 'custom', selected: ['Clarify decision criteria'] },
      pressure: 'hard',
      length: { profile: 'quick', turnBudget: 6 },
      completion: { strategy: 'adaptive', explicitFinish: true },
    })
    assert.deepEqual(
      (
        request.task_config.metadata.scenario_training as {
          training_points: string[]
        }
      ).training_points,
      ['Clarify decision criteria']
    )
  })

  test('keeps the restored feedback modes in one shared product contract', () => {
    assert.deepEqual(
      TRAINING_FEEDBACK_MODE_OPTIONS.map((option) => [
        option.value,
        option.label.chinese,
      ]),
      [
        ['simulation', '完整模拟'],
        ['assisted', '旁路提示'],
        ['drill', '逐句纠正'],
      ]
    )
  })

  test('persists the selected feedback policy through create and start requests', () => {
    const scenario = toTrainingScenario(template)
    const createRequest = buildTrainingSessionRequest(
      scenario,
      'voice',
      undefined,
      DEFAULT_TRAINING_VOICE_ID,
      'drill'
    )
    const startRequest = buildScenarioStartRequest(
      scenario,
      'voice',
      undefined,
      DEFAULT_TRAINING_VOICE_ID,
      'drill'
    )

    assert.equal(createRequest.task_config.metadata.feedbackMode, 'drill')
    assert.equal(
      createRequest.task_config.metadata.trainingFeedbackMode,
      'drill'
    )
    assert.deepEqual(createRequest.task_config.metadata.feedbackPolicy, {
      mode: 'drill',
      version: 1,
      channelAgnostic: true,
    })
    assert.equal(
      (
        createRequest.task_config.metadata.scenario_training as {
          feedbackMode: string
        }
      ).feedbackMode,
      'drill'
    )
    assert.equal(startRequest.opening_message?.metadata.feedbackMode, 'drill')
    if ('runtime' in startRequest || !startRequest.runtime_persona) {
      throw new Error('voice drill must include a runtime persona')
    }
    assert.match(
      startRequest.runtime_persona.style,
      /after each learner answer/
    )
  })

  test('builds a room-backed scenario start request for voice training', () => {
    const request = buildScenarioStartRequest(
      toTrainingScenario(template),
      'voice',
      {
        focusScope: 'custom',
        selectedFocus: ['Clarify decision criteria'],
        pressure: 'hard',
        lengthProfile: 'standard',
      },
      DEFAULT_TRAINING_VOICE_ID
    )

    if ('runtime' in request) {
      throw new Error('voice scenario training must use a room-backed runtime')
    }
    if (!request.runtime_persona) {
      throw new Error('inline voice scenario must include a runtime persona')
    }
    assert.equal(request.room_type, 'battle_prep')
    assert.equal(request.runtime_persona.name, template.persona.name)
    assert.equal(request.runtime_persona.role, template.persona.role)
    assert.equal(request.runtime_persona.difficulty, 'hard')
    assert.equal(request.runtime_persona.voice_id, DEFAULT_TRAINING_VOICE_ID)
    assert.deepEqual(request.runtime_persona.training_points, [
      'Clarify decision criteria',
    ])
    assert.equal(request.opening_message?.content, template.opening_line)
    assert.equal(
      request.opening_message?.metadata.source,
      'scenario_training_opening'
    )
    assert.equal(
      request.opening_message?.metadata.trainingVoiceId,
      DEFAULT_TRAINING_VOICE_ID
    )
  })

  test('binds a selected persona asset instead of creating a runtime persona', () => {
    const scenario = toTrainingScenario({
      ...template,
      persona: { ...template.persona, persona_id: 'persona-asset-1' },
    })
    const request = buildScenarioStartRequest(
      scenario,
      'voice',
      undefined,
      DEFAULT_TRAINING_VOICE_ID
    )

    if ('runtime' in request) {
      throw new Error(
        'persona asset scenario training must use a room-backed runtime'
      )
    }
    if (request.runtime_persona) {
      throw new Error(
        'persona asset scenario must not create a runtime persona'
      )
    }
    assert.equal(request.room_name, `Training: ${scenario.title}`)
    assert.equal(request.room_type, 'battle_prep')
    assert.deepEqual(request.persona_ids, ['persona-asset-1'])
    assert.equal('runtime_persona' in request, false)
  })

  test('persists the selected voice preset for realtime training', () => {
    const mode = trainingSessionModeForSelection({
      modality: 'voice',
      interactionMode: 'realtime',
    })
    const request = buildTrainingSessionRequest(
      toTrainingScenario(template),
      mode,
      undefined,
      undefined,
      'simulation',
      undefined,
      'voice-route-standard'
    )

    assert.equal(mode, 'realtime')
    assert.equal(request.mode, 'realtime')
    assert.equal(request.task_config.metadata.trainingMode, 'voice')
    assert.equal(request.task_config.metadata.interactionMode, 'realtime')
    assert.equal(
      request.task_config.metadata.voiceRouteId,
      'voice-route-standard'
    )
    assert.equal('realtimeProfile' in request.task_config.metadata, false)
    assert.equal(
      (
        request.task_config.metadata.scenario_training as {
          interactionMode: string
        }
      ).interactionMode,
      'realtime'
    )
    assert.equal(
      (
        request.task_config.metadata.scenario_training as {
          trainingMode: string
        }
      ).trainingMode,
      'voice'
    )
  })

  test('uses the complete voice preset instead of a standalone LLM for turn-based voice', () => {
    const request = buildTrainingSessionRequest(
      toTrainingScenario(template),
      'voice',
      undefined,
      undefined,
      'simulation',
      'standalone-text-model',
      'cascade-standard'
    )

    assert.equal(request.task_config.metadata.voiceRouteId, 'cascade-standard')
    assert.equal('llmModel' in request.task_config.metadata, false)
  })

  test('does not expose a realtime pipeline selector in the session request', () => {
    const request = buildTrainingSessionRequest(
      toTrainingScenario(template),
      'realtime',
      undefined,
      undefined,
      'simulation',
      undefined,
      'voice-route-native'
    )

    assert.equal(
      request.task_config.metadata.voiceRouteId,
      'voice-route-native'
    )
    assert.equal('realtimeProfile' in request.task_config.metadata, false)
  })

  test('maps supported modality and interaction selections without changing session modes', () => {
    assert.equal(
      trainingSessionModeForSelection({
        modality: 'text',
        interactionMode: 'turn_based',
      }),
      'text'
    )
    assert.equal(
      trainingSessionModeForSelection({
        modality: 'voice',
        interactionMode: 'turn_based',
      }),
      'voice'
    )
    assert.equal(
      trainingSessionModeForSelection({
        modality: 'video',
        interactionMode: 'turn_based',
      }),
      'video'
    )
  })

  test('keeps unavailable realtime video out of the session request contract', () => {
    const selection = {
      modality: 'video' as const,
      interactionMode: 'realtime' as const,
    }

    assert.equal(isTrainingModeSelectionAvailable(selection), false)
    assert.throws(
      () => trainingSessionModeForSelection(selection),
      /video does not support realtime training/
    )
  })

  test('uses the same persisted scenario opening for text training', () => {
    const request = buildScenarioStartRequest(
      toTrainingScenario(template),
      'text'
    )

    if (!('runtime' in request)) {
      throw new Error(
        'text scenario training must use the message-tree runtime'
      )
    }
    assert.equal(request.runtime, 'conversation_message_tree')
    assert.equal(request.opening_message?.content, template.opening_line)
    assert.equal(
      request.opening_message?.metadata.source,
      'scenario_training_opening'
    )
  })

  test('keeps the created session id when start needs a retry', () => {
    const error = new ScenarioTrainingStartError(
      'session-42',
      new Error('Opening persistence failed')
    )

    assert.equal(error.sessionId, 'session-42')
    assert.equal(error.message, 'Opening persistence failed')
  })

  test('filters across category, difficulty, persona, and training points', () => {
    const first = toTrainingScenario(template)
    const second = toTrainingScenario({
      ...template,
      id: 'support-escalation',
      title: 'Support escalation',
      difficulty: 'medium',
      category: 'customer_service',
      persona: { ...template.persona, name: 'Chen Yu' },
      training_points: ['De-escalate emotion'],
    })

    assert.deepEqual(
      filterTrainingScenarios([first, second], {
        category: 'customer_service',
        difficulty: 'medium',
        query: 'emotion',
      }).map((scenario) => scenario.id),
      ['support-escalation']
    )
    assert.deepEqual(
      filterTrainingScenarios([first, second], {
        category: 'all',
        difficulty: 'all',
        query: 'lin wei',
      }).map((scenario) => scenario.id),
      ['renewal-objection']
    )
  })
})

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
import axios from 'axios'

import { api } from '@/lib/http-client'

import {
  trainingFeedbackPolicy,
  trainingFeedbackRuntimeInstruction,
  type TrainingFeedbackMode,
} from '../training-feedback'
import {
  scenarioPressure,
  trainingPlanMetadata,
  trainingTurnBudget,
  type TrainingPlanInput,
  type TrainingPressure,
} from '../training-plan'
import type { TrainingVoiceId } from '../training-voice'
import type {
  CreateTrainingSessionRequest,
  TrainingScenario,
  TrainingScenarioCategory,
  TrainingScenarioDifficulty,
  TrainingScenarioFilters,
  TrainingInteractionMode,
  TrainingModeSelection,
  TrainingSession,
  TrainingSessionMode,
} from './types'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
  error?: {
    details?: unknown
  } | null
}

interface ScenarioTemplateDTO {
  id: string
  title: string
  description: string
  customer_profile: string
  difficulty: string
  category: string
  required: boolean
  opening_line: string
  persona: {
    avatar_url?: string | null
    persona_id?: string | null
    name: string
    role: string
    style: string
    voice_id?: string | null
    voice_speed?: number
    voice_loudness?: number
    voice_emotion?: string | null
    voice_emotion_scale?: number
    voice_style?: string | null
  }
  learner_role: string
  framework: string
  training_points: string[]
  dimension_weights?: Array<{
    dimension_id: string
    weight: number
  }>
}

interface TrainingSessionDTO {
  session_id: string
  mode: TrainingSessionMode
  scenario_template_id?: string | null
  status: TrainingSession['status']
  room_id?: string | number | null
  user_id?: string | null
  team_id?: string | null
}

type StartTrainingSessionRequest =
  | {
      runtime: 'conversation_message_tree'
      opening_message?: {
        content: string
        metadata: Record<string, unknown>
      }
    }
  | {
      room_name: string
      room_type: 'battle_prep'
      persona_ids?: string[]
      runtime_persona?: {
        name: string
        role: string
        style: string
        scenario_context: string
        training_points: string[]
        difficulty: 'easy' | 'hard' | 'normal'
        voice_id?: TrainingVoiceId
        voice_speed?: number
        voice_loudness?: number
        voice_emotion?: string | null
        voice_emotion_scale?: number
        voice_style?: string | null
      }
      opening_message?: {
        content: string
        metadata: Record<string, unknown>
      }
    }

export class ScenarioTrainingStartError extends Error {
  readonly sessionId: string

  constructor(sessionId: string, error: unknown) {
    super(
      trainingRequestErrorMessage(
        error,
        'The session was created, but it could not be started.'
      )
    )
    this.name = 'ScenarioTrainingStartError'
    this.sessionId = sessionId
  }
}

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'
const SCENARIO_TEMPLATES_PATH = '/scenario-templates'
const TRAINING_SESSIONS_PATH = '/sessions'

const DIFFICULTIES = new Set<TrainingScenarioDifficulty>([
  'easy',
  'expert',
  'hard',
  'medium',
])
const CATEGORIES = new Set<TrainingScenarioCategory>([
  'customer_service',
  'interview',
  'negotiation',
  'sales',
  'workplace',
])

function requireTalkWiseData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

function normalizeDifficulty(value: string): TrainingScenarioDifficulty {
  if (DIFFICULTIES.has(value as TrainingScenarioDifficulty)) {
    return value as TrainingScenarioDifficulty
  }
  throw new Error(`Unsupported training scenario difficulty: ${value}`)
}

function normalizeCategory(value: string): TrainingScenarioCategory {
  if (CATEGORIES.has(value as TrainingScenarioCategory)) {
    return value as TrainingScenarioCategory
  }
  throw new Error(`Unsupported training scenario category: ${value}`)
}

export function trainingApiUrl(apiBase: string, path: string): string {
  const normalizedBase =
    apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  return `${normalizedBase}${path}`
}

export function trainingRequestErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | {
          detail?: string | { message?: string }
          message?: string
        }
      | undefined
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.message
    return detail || payload?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export function toTrainingScenario(dto: ScenarioTemplateDTO): TrainingScenario {
  const persona = {
    avatarUrl: dto.persona.avatar_url ?? null,
    name: dto.persona.name,
    role: dto.persona.role,
    style: dto.persona.style,
    ...(dto.persona.persona_id ? { personaId: dto.persona.persona_id } : {}),
    ...(dto.persona.voice_id ||
    dto.persona.voice_speed !== undefined ||
    dto.persona.voice_loudness !== undefined ||
    dto.persona.voice_emotion !== undefined ||
    dto.persona.voice_emotion_scale !== undefined ||
    dto.persona.voice_style !== undefined
      ? {
          voiceId: dto.persona.voice_id ?? null,
          voiceSpeed: dto.persona.voice_speed ?? 1,
          voiceLoudness: dto.persona.voice_loudness ?? 1,
          voiceEmotion: dto.persona.voice_emotion ?? null,
          voiceEmotionScale: dto.persona.voice_emotion_scale ?? 1,
          voiceStyle: dto.persona.voice_style ?? null,
        }
      : {}),
  }
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    customerProfile: dto.customer_profile,
    difficulty: normalizeDifficulty(dto.difficulty),
    category: normalizeCategory(dto.category),
    required: dto.required,
    openingLine: dto.opening_line,
    persona,
    learnerRole: dto.learner_role,
    framework: dto.framework,
    trainingPoints: [...dto.training_points],
    dimensionWeights: (dto.dimension_weights ?? []).map((weight) => ({
      dimensionId: weight.dimension_id,
      weight: weight.weight,
    })),
  }
}

export function filterTrainingScenarios(
  scenarios: TrainingScenario[],
  filters: TrainingScenarioFilters
): TrainingScenario[] {
  const query = filters.query.trim().toLocaleLowerCase()

  return scenarios.filter((scenario) => {
    if (filters.category !== 'all' && scenario.category !== filters.category) {
      return false
    }
    if (
      filters.difficulty !== 'all' &&
      scenario.difficulty !== filters.difficulty
    ) {
      return false
    }
    if (!query) return true

    return [
      scenario.title,
      scenario.description,
      scenario.customerProfile,
      scenario.persona.name,
      scenario.persona.role,
      ...scenario.trainingPoints,
    ].some((value) => value.toLocaleLowerCase().includes(query))
  })
}

export function isTrainingModeSelectionAvailable(
  selection: TrainingModeSelection
): boolean {
  return (
    selection.interactionMode === 'turn_based' || selection.modality === 'voice'
  )
}

function trainingModalityForMode(
  mode: TrainingSessionMode
): 'text' | 'voice' | 'video' {
  return mode === 'realtime' ? 'voice' : mode
}

export function trainingSessionModeForSelection(
  selection: TrainingModeSelection
): TrainingSessionMode {
  if (!isTrainingModeSelectionAvailable(selection)) {
    throw new Error(
      `${selection.modality} does not support ${selection.interactionMode} training`
    )
  }
  return selection.modality
}

export function buildTrainingSessionRequest(
  scenario: TrainingScenario,
  mode: TrainingSessionMode,
  plan: TrainingPlanInput = {
    focusScope: 'all',
    selectedFocus: scenario.trainingPoints,
    pressure: scenarioPressure(scenario.difficulty),
    lengthProfile: 'standard',
  },
  voiceId?: TrainingVoiceId,
  feedbackMode: TrainingFeedbackMode = 'simulation',
  llmModel?: string,
  voiceRouteId?: string,
  interactionMode?: TrainingInteractionMode,
  replyLanguage?: string
): CreateTrainingSessionRequest {
  const resolvedVoiceId = voiceId ?? scenario.persona.voiceId ?? undefined
  const rubricWeights = Object.fromEntries(
    scenario.dimensionWeights.map((item) => [
      item.dimensionId,
      item.weight > 1 ? item.weight / 100 : item.weight,
    ])
  )
  const category =
    scenario.category === 'customer_service' ? 'workplace' : scenario.category
  const trainingMode = trainingModalityForMode(mode)
  const resolvedInteractionMode =
    interactionMode ?? (mode === 'realtime' ? 'realtime' : 'turn_based')

  return {
    mode: trainingMode,
    scenario_template_id: scenario.id,
    task_config: {
      role: scenario.learnerRole,
      level: scenario.difficulty,
      tech_stack: [
        scenario.title,
        scenario.customerProfile,
        `category:${scenario.category}`,
        `opening:${scenario.openingLine}`,
        `feedback:${feedbackMode}`,
      ],
      question_type_ratios: {
        behavioral: scenario.category === 'interview' ? 45 : 20,
        craft: scenario.category === 'negotiation' ? 35 : 45,
        pressure: scenario.difficulty === 'easy' ? 20 : 35,
      },
      question_count: trainingTurnBudget(plan.lengthProfile),
      framework: scenario.framework,
      difficulty: plan.pressure,
      category,
      ...(scenario.dimensionWeights.length > 0
        ? { rubric_weights: rubricWeights }
        : {}),
      metadata: {
        source: 'scenario_training',
        feedbackMode,
        trainingFeedbackMode: feedbackMode,
        feedbackPolicy: trainingFeedbackPolicy(feedbackMode),
        trainingMode,
        interactionMode: resolvedInteractionMode,
        ...(replyLanguage?.trim()
          ? { replyLanguage: replyLanguage.trim() }
          : {}),
        ...(resolvedVoiceId ? { trainingVoiceId: resolvedVoiceId } : {}),
        ...(mode === 'voice' || mode === 'realtime'
          ? voiceRouteId
            ? { voiceRouteId }
            : {}
          : llmModel
            ? { llmModel }
            : {}),
        ...(mode !== 'text'
          ? {
              trainingVoiceSpeed: scenario.persona.voiceSpeed,
              trainingVoiceLoudness: scenario.persona.voiceLoudness,
              trainingVoiceEmotion: scenario.persona.voiceEmotion,
              trainingVoiceEmotionScale: scenario.persona.voiceEmotionScale,
              trainingVoiceStyle: scenario.persona.voiceStyle,
            }
          : {}),
        trainingPlan: trainingPlanMetadata(plan),
        scenario_training: {
          id: scenario.id,
          title: scenario.title,
          description: scenario.description,
          customer_profile: scenario.customerProfile,
          opening_line: scenario.openingLine,
          persona: { ...scenario.persona },
          required: scenario.required,
          category: scenario.category,
          difficulty: scenario.difficulty,
          training_points: [...plan.selectedFocus],
          dimension_weights: scenario.dimensionWeights,
          feedbackMode,
          trainingMode,
          interactionMode: resolvedInteractionMode,
          ...(replyLanguage?.trim()
            ? { replyLanguage: replyLanguage.trim() }
            : {}),
          ...(resolvedVoiceId ? { voice_id: resolvedVoiceId } : {}),
        },
      },
    },
  }
}

function runtimePersonaDifficulty(
  pressure: TrainingPressure
): 'easy' | 'hard' | 'normal' {
  if (pressure === 'easy') return 'easy'
  if (pressure === 'hard') return 'hard'
  return 'normal'
}

function normalizeTrainingSession(
  session: TrainingSessionDTO
): TrainingSession {
  return {
    sessionId: session.session_id,
    mode: session.mode,
    scenarioTemplateId: session.scenario_template_id ?? null,
    status: session.status,
    roomId: session.room_id == null ? null : String(session.room_id),
    createdForUserId: session.user_id ?? null,
    createdForTeamId: session.team_id ?? null,
  }
}

export function buildScenarioStartRequest(
  scenario: TrainingScenario,
  mode: TrainingSessionMode,
  plan: TrainingPlanInput = {
    focusScope: 'all',
    selectedFocus: scenario.trainingPoints,
    pressure: scenarioPressure(scenario.difficulty),
    lengthProfile: 'standard',
  },
  voiceId?: TrainingVoiceId,
  feedbackMode: TrainingFeedbackMode = 'simulation',
  interactionMode?: TrainingInteractionMode,
  replyLanguage?: string
): StartTrainingSessionRequest {
  const resolvedVoiceId = voiceId ?? scenario.persona.voiceId ?? undefined
  const trainingMode = trainingModalityForMode(mode)
  const resolvedInteractionMode =
    interactionMode ?? (mode === 'realtime' ? 'realtime' : 'turn_based')
  const trainingPoints =
    plan.selectedFocus.length > 0
      ? [...plan.selectedFocus]
      : scenario.trainingPoints
  const context = [
    scenario.description,
    scenario.customerProfile,
    scenario.openingLine ? `Opening line: ${scenario.openingLine}` : '',
    `Feedback policy: ${trainingFeedbackRuntimeInstruction(feedbackMode)}`,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n')
  const openingMessage = scenario.openingLine.trim()
    ? {
        content: scenario.openingLine.trim(),
        metadata: {
          source: 'scenario_training_opening',
          scenarioTrainingId: scenario.id,
          trainingMode,
          interactionMode: resolvedInteractionMode,
          feedbackMode,
          trainingFeedbackMode: feedbackMode,
          feedbackPolicy: trainingFeedbackPolicy(feedbackMode),
          ...(replyLanguage?.trim()
            ? { replyLanguage: replyLanguage.trim() }
            : {}),
          ...(resolvedVoiceId ? { trainingVoiceId: resolvedVoiceId } : {}),
          ...(mode !== 'text'
            ? {
                trainingVoiceSpeed: scenario.persona.voiceSpeed,
                trainingVoiceLoudness: scenario.persona.voiceLoudness,
                trainingVoiceEmotion: scenario.persona.voiceEmotion,
                trainingVoiceEmotionScale: scenario.persona.voiceEmotionScale,
                trainingVoiceStyle: scenario.persona.voiceStyle,
              }
            : {}),
        },
      }
    : null

  if (trainingMode === 'text') {
    return {
      runtime: 'conversation_message_tree',
      ...(openingMessage ? { opening_message: openingMessage } : {}),
    }
  }

  if (scenario.persona.personaId?.trim()) {
    return {
      room_name: `Training: ${scenario.title}`,
      room_type: 'battle_prep',
      persona_ids: [scenario.persona.personaId.trim()],
      ...(openingMessage ? { opening_message: openingMessage } : {}),
    }
  }

  return {
    room_name: `Training: ${scenario.title}`,
    room_type: 'battle_prep',
    runtime_persona: {
      name: scenario.persona.name || 'Training counterpart',
      role: scenario.persona.role || 'Scenario counterpart',
      style: [
        scenario.persona.style ||
          'Stay in role, ask focused follow-up questions, and keep the exchange realistic.',
        trainingFeedbackRuntimeInstruction(feedbackMode),
      ].join('\n'),
      scenario_context: context || scenario.title,
      training_points: trainingPoints,
      difficulty: runtimePersonaDifficulty(plan.pressure),
      ...(resolvedVoiceId ? { voice_id: resolvedVoiceId } : {}),
      voice_speed: scenario.persona.voiceSpeed,
      voice_loudness: scenario.persona.voiceLoudness,
      voice_emotion: scenario.persona.voiceEmotion,
      voice_emotion_scale: scenario.persona.voiceEmotionScale,
      voice_style: scenario.persona.voiceStyle,
    },
    ...(openingMessage ? { opening_message: openingMessage } : {}),
  }
}

export async function listTrainingScenarios(
  apiBase: string
): Promise<TrainingScenario[]> {
  const response = await api.get<TalkWiseResponse<ScenarioTemplateDTO[]>>(
    trainingApiUrl(apiBase, SCENARIO_TEMPLATES_PATH),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return requireTalkWiseData(response.data).map(toTrainingScenario)
}

export async function createTrainingSession(
  apiBase: string,
  request: CreateTrainingSessionRequest
): Promise<TrainingSession> {
  const response = await api.post<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(apiBase, TRAINING_SESSIONS_PATH),
    request,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const session = requireTalkWiseData(response.data)

  return normalizeTrainingSession(session)
}

export async function startScenarioTrainingSession(
  apiBase: string,
  sessionId: string,
  scenario: TrainingScenario,
  mode: TrainingSessionMode,
  plan?: TrainingPlanInput,
  voiceId?: TrainingVoiceId,
  feedbackMode: TrainingFeedbackMode = 'simulation',
  interactionMode?: TrainingInteractionMode,
  replyLanguage?: string
): Promise<TrainingSession> {
  const response = await api.post<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(
      apiBase,
      `${TRAINING_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/start`
    ),
    buildScenarioStartRequest(
      scenario,
      mode,
      plan,
      voiceId,
      feedbackMode,
      interactionMode,
      replyLanguage
    ),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const session = requireTalkWiseData(response.data)

  return normalizeTrainingSession(session)
}

export async function startTextTrainingSession(
  apiBase: string,
  sessionId: string
): Promise<TrainingSession> {
  const response = await api.post<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(
      apiBase,
      `${TRAINING_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/start`
    ),
    { runtime: 'conversation_message_tree' },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const session = requireTalkWiseData(response.data)

  return normalizeTrainingSession(session)
}

export async function launchTextScenarioTrainingSession(
  apiBase: string,
  scenario: TrainingScenario,
  replyLanguage?: string
): Promise<TrainingSession> {
  return launchScenarioTrainingSession(
    apiBase,
    scenario,
    'text',
    undefined,
    undefined,
    'simulation',
    undefined,
    undefined,
    undefined,
    replyLanguage
  )
}

export async function launchScenarioTrainingSession(
  apiBase: string,
  scenario: TrainingScenario,
  mode: TrainingSessionMode,
  plan?: TrainingPlanInput,
  voiceId?: TrainingVoiceId,
  feedbackMode: TrainingFeedbackMode = 'simulation',
  llmModel?: string,
  voiceRouteId?: string,
  interactionMode?: TrainingInteractionMode,
  replyLanguage?: string
): Promise<TrainingSession> {
  const created = await createTrainingSession(
    apiBase,
    buildTrainingSessionRequest(
      scenario,
      mode,
      plan,
      voiceId,
      feedbackMode,
      llmModel,
      voiceRouteId,
      interactionMode,
      replyLanguage
    )
  )
  try {
    return await startScenarioTrainingSession(
      apiBase,
      created.sessionId,
      scenario,
      mode,
      plan,
      voiceId,
      feedbackMode,
      interactionMode,
      replyLanguage
    )
  } catch (error) {
    throw new ScenarioTrainingStartError(created.sessionId, error)
  }
}

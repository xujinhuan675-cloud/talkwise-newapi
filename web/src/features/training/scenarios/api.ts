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

import type {
  CreateTrainingSessionRequest,
  TrainingScenario,
  TrainingScenarioCategory,
  TrainingScenarioDifficulty,
  TrainingScenarioFilters,
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
    name: string
    role: string
    style: string
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
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    customerProfile: dto.customer_profile,
    difficulty: normalizeDifficulty(dto.difficulty),
    category: normalizeCategory(dto.category),
    required: dto.required,
    openingLine: dto.opening_line,
    persona: { ...dto.persona },
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

export function buildTrainingSessionRequest(
  scenario: TrainingScenario,
  mode: TrainingSessionMode
): CreateTrainingSessionRequest {
  const rubricWeights = Object.fromEntries(
    scenario.dimensionWeights.map((item) => [
      item.dimensionId,
      item.weight > 1 ? item.weight / 100 : item.weight,
    ])
  )
  const difficulty =
    scenario.difficulty === 'expert' ? 'hard' : scenario.difficulty
  const category =
    scenario.category === 'customer_service' ? 'workplace' : scenario.category

  return {
    mode,
    scenario_template_id: scenario.id,
    task_config: {
      role: scenario.learnerRole,
      level: scenario.difficulty,
      tech_stack: [
        scenario.title,
        scenario.customerProfile,
        `category:${scenario.category}`,
        `opening:${scenario.openingLine}`,
      ],
      question_type_ratios: {
        behavioral: scenario.category === 'interview' ? 45 : 20,
        craft: scenario.category === 'negotiation' ? 35 : 45,
        pressure: scenario.difficulty === 'easy' ? 20 : 35,
      },
      question_count: scenario.required ? 8 : 6,
      framework: scenario.framework,
      difficulty,
      category,
      ...(scenario.dimensionWeights.length > 0
        ? { rubric_weights: rubricWeights }
        : {}),
      metadata: {
        source: 'scenario_training',
        feedbackMode: 'simulation',
        trainingFeedbackMode: 'simulation',
        trainingMode: mode,
        interactionMode: 'turn_based',
        scenario_training: {
          id: scenario.id,
          title: scenario.title,
          required: scenario.required,
          category: scenario.category,
          difficulty: scenario.difficulty,
          training_points: [...scenario.trainingPoints],
          dimension_weights: scenario.dimensionWeights,
          feedbackMode: 'simulation',
          trainingMode: mode,
          interactionMode: 'turn_based',
        },
      },
    },
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

export async function launchTextScenarioTrainingSession(
  apiBase: string,
  scenario: TrainingScenario
): Promise<TrainingSession> {
  const created = await createTrainingSession(
    apiBase,
    buildTrainingSessionRequest(scenario, 'text')
  )
  return startTextTrainingSession(apiBase, created.sessionId)
}

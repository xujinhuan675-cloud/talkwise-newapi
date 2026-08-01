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
  TrainingScenarioCategory,
  TrainingScenarioConfigDraft,
  TrainingScenarioConfigState,
  TrainingScenarioDifficulty,
  TrainingScenarioDimension,
  TrainingScenarioDimensionWeight,
  TrainingRubricDefaults,
} from './types'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
  error?: {
    details?: unknown
  } | null
}

type RecordValue = Record<string, unknown>

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'
const SCENARIO_CONFIG_PATH = '/scenario-config'
const DEFAULT_RUBRIC_PATH = '/rubrics/default'
const CATEGORIES = new Set<TrainingScenarioCategory>([
  'customer_service',
  'interview',
  'negotiation',
  'sales',
  'workplace',
])
const DIFFICULTIES = new Set<TrainingScenarioDifficulty>([
  'easy',
  'expert',
  'hard',
  'medium',
])

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizedCategory(value: unknown): TrainingScenarioCategory {
  return CATEGORIES.has(value as TrainingScenarioCategory)
    ? (value as TrainingScenarioCategory)
    : 'sales'
}

function normalizedDifficulty(value: unknown): TrainingScenarioDifficulty {
  return DIFFICULTIES.has(value as TrainingScenarioDifficulty)
    ? (value as TrainingScenarioDifficulty)
    : 'medium'
}

function normalizeDimension(value: unknown): TrainingScenarioDimension | null {
  if (!isRecord(value)) return null
  const id = readString(value.id).trim()
  const name = readString(value.name).trim()
  if (!id || !name) return null

  return {
    id,
    name,
    description: readString(value.description).trim(),
    enabled: readBoolean(value.enabled, true),
    source: value.source === 'local' ? 'local' : 'default',
    updatedAt: readString(value.updatedAt ?? value.updated_at),
  }
}

function normalizeDimensionWeight(
  value: unknown
): TrainingScenarioDimensionWeight | null {
  if (!isRecord(value)) return null
  const dimensionId = readString(value.dimensionId ?? value.dimension_id).trim()
  if (!dimensionId) return null

  return {
    dimensionId,
    weight: Math.max(0, Math.min(100, readNumber(value.weight))),
  }
}

function normalizeScenario(value: unknown): TrainingScenarioConfigDraft | null {
  if (!isRecord(value)) return null
  const id = readString(value.id).trim()
  const title = readString(value.title).trim()
  if (!id || !title) return null
  const persona = isRecord(value.persona) ? value.persona : {}

  return {
    id,
    title,
    description: readString(value.description),
    customerProfile: readString(
      value.customerProfile ?? value.customer_profile
    ),
    difficulty: normalizedDifficulty(value.difficulty),
    category: normalizedCategory(value.category),
    required: readBoolean(value.required),
    enabled: readBoolean(value.enabled, true),
    openingLine: readString(value.openingLine ?? value.opening_line),
    persona: {
      name: readString(persona.name),
      role: readString(persona.role),
      style: readString(persona.style),
    },
    learnerRole: readString(value.learnerRole ?? value.learner_role),
    framework: readString(value.framework, 'prep'),
    trainingPoints: readArray(value.trainingPoints ?? value.training_points)
      .map((item) => readString(item).trim())
      .filter(Boolean),
    dimensionWeights: readArray(
      value.dimensionWeights ?? value.dimension_weights
    )
      .map(normalizeDimensionWeight)
      .filter((item): item is TrainingScenarioDimensionWeight => item !== null),
    sourceScenarioId:
      readString(value.sourceScenarioId ?? value.source_scenario_id).trim() ||
      undefined,
    updatedAt: readString(value.updatedAt ?? value.updated_at),
  }
}

function requireTalkWiseData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'Training configuration request failed')
  }
  return response.data
}

export function trainingConfigApiUrl(apiBase: string): string {
  const normalizedBase =
    apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  return `${normalizedBase}${SCENARIO_CONFIG_PATH}`
}

export function trainingRubricDefaultsApiUrl(
  apiBase: string,
  category: TrainingScenarioCategory
): string {
  const normalizedBase =
    apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  const backendCategory =
    category === 'customer_service' ? 'workplace' : category
  const query = new URLSearchParams({ category: backendCategory })
  return `${normalizedBase}${DEFAULT_RUBRIC_PATH}?${query.toString()}`
}

export function normalizeTrainingScenarioConfig(
  value: unknown
): TrainingScenarioConfigState {
  if (!isRecord(value)) {
    throw new Error('Training configuration response has an invalid shape')
  }

  const dimensions = readArray(value.dimensions)
    .map(normalizeDimension)
    .filter((item): item is TrainingScenarioDimension => item !== null)
  const scenarios = readArray(value.scenarios)
    .map(normalizeScenario)
    .filter((item): item is TrainingScenarioConfigDraft => item !== null)
  const selectedScenarioId = readString(
    value.selectedScenarioId ?? value.selected_scenario_id
  ).trim()
  const selectedDimensionId = readString(
    value.selectedDimensionId ?? value.selected_dimension_id
  ).trim()

  return {
    version: readNumber(value.version, 1),
    dimensions,
    scenarios,
    selectedScenarioId: scenarios.some((item) => item.id === selectedScenarioId)
      ? selectedScenarioId
      : (scenarios[0]?.id ?? null),
    selectedDimensionId: dimensions.some(
      (item) => item.id === selectedDimensionId
    )
      ? selectedDimensionId
      : (dimensions[0]?.id ?? null),
    updatedAt: readString(value.updatedAt ?? value.updated_at),
  }
}

export function normalizeTrainingRubricDefaults(
  value: unknown
): TrainingRubricDefaults {
  if (!isRecord(value) || !isRecord(value.weights)) {
    throw new Error('Training rubric defaults response has an invalid shape')
  }

  const dimensionWeights = Object.entries(value.weights)
    .map(([dimensionId, rawWeight]) => ({
      dimensionId: dimensionId.trim(),
      weight: Math.round(readNumber(rawWeight, -1) * 100 * 10_000) / 10_000,
    }))
    .filter(
      (item) =>
        Boolean(item.dimensionId) && item.weight >= 0 && item.weight <= 100
    )

  if (dimensionWeights.length === 0) {
    throw new Error('Training rubric defaults response has no usable weights')
  }

  return {
    version: readString(value.version).trim(),
    sourceCategory: readString(value.category).trim(),
    dimensionWeights,
  }
}

export function trainingConfigRequestErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { detail?: string | { message?: string }; message?: string }
      | undefined
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.message
    return detail || payload?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export async function getTrainingScenarioConfig(
  apiBase: string
): Promise<TrainingScenarioConfigState> {
  const response = await api.get<TalkWiseResponse<unknown>>(
    trainingConfigApiUrl(apiBase),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return normalizeTrainingScenarioConfig(requireTalkWiseData(response.data))
}

export async function saveTrainingScenarioConfig(
  apiBase: string,
  state: TrainingScenarioConfigState
): Promise<TrainingScenarioConfigState> {
  const response = await api.put<TalkWiseResponse<unknown>>(
    trainingConfigApiUrl(apiBase),
    state,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return normalizeTrainingScenarioConfig(requireTalkWiseData(response.data))
}

export async function getTrainingRubricDefaults(
  apiBase: string,
  category: TrainingScenarioCategory
): Promise<TrainingRubricDefaults> {
  const response = await api.get<TalkWiseResponse<unknown>>(
    trainingRubricDefaultsApiUrl(apiBase, category),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return normalizeTrainingRubricDefaults(requireTalkWiseData(response.data))
}

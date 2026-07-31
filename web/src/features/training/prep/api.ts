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

export const TALKWISE_BATTLE_PREP_API = '/api/talkwise/battle-prep'
export const TALKWISE_DEFENSE_PREP_API = '/api/talkwise/defense-prep'
export const TALKWISE_SCOPED_PERSONAS_API =
  '/api/talkwise/conversations/personas'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

type UnknownRecord = Record<string, unknown>

export type DefenseScenarioType =
  | 'performance_review'
  | 'proposal_review'
  | 'project_report'
  | 'general'
  | 'interview'
  | 'probation_review'

export interface TrainingPrepPersona {
  readonly id: string
  readonly name: string
  readonly role: string
}

export interface BattlePrepResult {
  readonly personaName: string
  readonly personaRole: string
  readonly personaStyle: string
  readonly scenarioContext: string
  readonly trainingPoints: string[]
}

export interface StartBattlePrepInput {
  readonly preparation: BattlePrepResult
  readonly selectedTrainingPoints: string[]
  readonly difficulty: 'easy' | 'normal' | 'hard'
  readonly replyLanguage: string
}

export interface DefenseQuestion {
  readonly question: string
  readonly dimension: string
  readonly difficulty: string
  readonly askedBy: string
}

export interface DefensePrepStartResult {
  readonly defenseSessionId: string
  readonly documentTitle: string | null
  readonly training_session_id?: string | number
  readonly conversation_id?: string | number
  readonly questionStrategy: readonly DefenseQuestion[]
}

export interface StartDefensePrepInput {
  readonly file: File
  readonly personaIds: readonly string[]
  readonly scenarioType: DefenseScenarioType
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

function requireData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

function requiredText(value: unknown, field: string): string {
  const text = asText(value)
  if (!text) throw new Error(`TalkWise response is missing ${field}`)
  return text
}

function optionalText(value: unknown): string | null {
  return asText(value)
}

function listOfText(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const text = asText(item)
    return text ? [text] : []
  })
}

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeBattlePrep(value: unknown): BattlePrepResult {
  const raw = asRecord(value)
  if (!raw) throw new Error('TalkWise returned an invalid battle preparation')

  const trainingPoints = listOfText(raw.training_points)
  if (trainingPoints.length === 0) {
    throw new Error('TalkWise returned no battle training points')
  }
  return {
    personaName: requiredText(raw.persona_name, 'persona_name'),
    personaRole: requiredText(raw.persona_role, 'persona_role'),
    personaStyle: requiredText(raw.persona_style, 'persona_style'),
    scenarioContext: requiredText(raw.scenario_context, 'scenario_context'),
    trainingPoints,
  }
}

function normalizePersona(value: unknown): TrainingPrepPersona | null {
  const raw = asRecord(value)
  if (!raw) return null
  const id = asText(raw.id)
  const name = asText(raw.name)
  const role = asText(raw.role)
  if (!id || !name || !role) return null
  return { id, name, role }
}

function normalizeDefenseQuestion(value: unknown): DefenseQuestion | null {
  const raw = asRecord(value)
  if (!raw) return null
  const question = asText(raw.question)
  if (!question) return null
  return {
    question,
    dimension: optionalText(raw.dimension) || '',
    difficulty: optionalText(raw.difficulty) || '',
    askedBy: optionalText(raw.asked_by) || '',
  }
}

function normalizeDefenseStart(
  created: unknown,
  started: unknown
): DefensePrepStartResult {
  const createdData = asRecord(created)
  const startedData = asRecord(started)
  if (!createdData || !startedData) {
    throw new Error('TalkWise returned an invalid defense preparation')
  }
  const questionStrategy = asRecord(startedData.question_strategy)
  const questions = Array.isArray(questionStrategy?.questions)
    ? questionStrategy.questions.flatMap((item) => {
        const question = normalizeDefenseQuestion(item)
        return question ? [question] : []
      })
    : []

  return {
    defenseSessionId: requiredText(createdData.id, 'defense session id'),
    documentTitle: optionalText(createdData.document_title),
    training_session_id: asText(startedData.training_session_id) || undefined,
    conversation_id: asText(startedData.conversation_id) || undefined,
    questionStrategy: questions,
  }
}

export function trainingPrepRequestErrorMessage(
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

export async function listScopedTrainingPrepPersonas(): Promise<
  TrainingPrepPersona[]
> {
  const response = await api.get<TalkWiseResponse<unknown[]>>(
    TALKWISE_SCOPED_PERSONAS_API,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return requireData(response.data).flatMap((item) => {
    const persona = normalizePersona(item)
    return persona ? [persona] : []
  })
}

export async function generateBattlePrep(
  description: string
): Promise<BattlePrepResult> {
  const brief = description.trim()
  if (brief.length < 10) {
    throw new Error('Provide at least 10 characters of meeting context')
  }
  const response = await api.post<TalkWiseResponse<unknown>>(
    `${TALKWISE_BATTLE_PREP_API}/generate`,
    { description: brief },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return normalizeBattlePrep(requireData(response.data))
}

export async function startBattlePrep(
  input: StartBattlePrepInput
): Promise<unknown> {
  if (uniqueText(input.selectedTrainingPoints).length === 0) {
    throw new Error('Select at least one training point')
  }
  const response = await api.post<TalkWiseResponse<unknown>>(
    `${TALKWISE_BATTLE_PREP_API}/start`,
    battlePrepStartPayload(input),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return requireData(response.data)
}

export async function createAndStartDefensePrep(
  input: StartDefensePrepInput
): Promise<DefensePrepStartResult> {
  const personaIds = uniqueText(input.personaIds)
  if (!input.file || input.file.size === 0) {
    throw new Error('Choose a non-empty practice document')
  }
  if (personaIds.length === 0) {
    throw new Error('Select at least one reviewer')
  }
  if (personaIds.length > 5) {
    throw new Error('Select at most five reviewers')
  }

  const form = new FormData()
  form.set('file', input.file)
  form.set('persona_ids', personaIds.join(','))
  form.set('scenario_type', input.scenarioType)
  const createdResponse = await api.post<TalkWiseResponse<unknown>>(
    `${TALKWISE_DEFENSE_PREP_API}/sessions`,
    form,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const created = requireData(createdResponse.data)
  const createdRecord = asRecord(created)
  const defenseSessionId = requiredText(createdRecord?.id, 'defense session id')
  const startedResponse = await api.post<TalkWiseResponse<unknown>>(
    `${TALKWISE_DEFENSE_PREP_API}/sessions/${encodeURIComponent(defenseSessionId)}/start`,
    undefined,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return normalizeDefenseStart(created, requireData(startedResponse.data))
}

export function battlePrepStartPayload(input: StartBattlePrepInput) {
  return {
    persona_name: input.preparation.personaName,
    persona_role: input.preparation.personaRole,
    persona_style: input.preparation.personaStyle,
    scenario_context: input.preparation.scenarioContext,
    selected_training_points: uniqueText(input.selectedTrainingPoints),
    difficulty: input.difficulty,
    reply_language: input.replyLanguage.trim() || 'en-US',
  }
}

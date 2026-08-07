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

import { getFreshAuthHeaders } from '@/lib/api'
import { api } from '@/lib/http-client'

import {
  TRAINING_VOICE_OPTIONS,
  type TrainingVoiceProfile,
} from '../training-voice'
import type {
  BuildPersonaInput,
  CreatePersonaInput,
  DetectedSpeaker,
  PersonaBuildEvent,
  PersonaBuildEventType,
  PersonaDetail,
  PersonaSource,
  PersonaSummary,
  PersonaV2,
  PersonaV2Patch,
  PersonaVisibility,
  UpdatePersonaInput,
} from './types'

export const TALKWISE_PERSONAS_API = '/api/talkwise/personas'
export const TALKWISE_PERSONA_BUILDER_API = '/api/talkwise/persona-builder'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

type UnknownRecord = Record<string, unknown>

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

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function requireData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

function personaVisibility(value: unknown): PersonaVisibility {
  return value === 'team' || value === 'system' ? value : 'private'
}

function personaSource(value: unknown): PersonaSource {
  return value === 'system_template' ? 'system_template' : 'persona_asset'
}

function normalizePersonaSummary(value: unknown): PersonaSummary | null {
  const raw = asRecord(value)
  const id = asText(raw?.id)
  const name = asText(raw?.name)
  const role = asText(raw?.role)
  if (!raw || !id || !name || !role) return null
  const canManage = asBoolean(raw.can_manage)
  return {
    id,
    name,
    role,
    parseStatus: asText(raw.parse_status),
    supportsV2: asBoolean(raw.supports_v2),
    source: personaSource(raw.source),
    visibility: personaVisibility(raw.visibility),
    version: asNumber(raw.version, 1),
    canManage,
    readOnly: asBoolean(raw.read_only, !canManage),
    voiceId: asText(raw.voice_id),
    voiceSpeed: asNumber(raw.voice_speed, 1),
    voiceVolume: asNumber(raw.voice_volume, 1),
    voiceStyle: asText(raw.voice_style),
  }
}

function normalizePersonaDetail(value: unknown): PersonaDetail {
  const raw = asRecord(value)
  const summary = normalizePersonaSummary(raw)
  if (!raw || !summary) throw new Error('TalkWise returned an invalid persona')
  return {
    ...summary,
    organizationId:
      raw.organization_id === null || raw.organization_id === undefined
        ? null
        : asNumber(raw.organization_id),
    teamId:
      raw.team_id === null || raw.team_id === undefined
        ? null
        : asNumber(raw.team_id),
    profileSummary: asText(raw.profile_summary),
    content: typeof raw.content === 'string' ? raw.content : '',
  }
}

function normalizePersonaV2(value: unknown): PersonaV2 {
  const raw = asRecord(value)
  const id = asText(raw?.id)
  const name = asText(raw?.name)
  const role = asText(raw?.role)
  if (!raw || !id || !name || !role) {
    throw new Error('TalkWise returned an invalid structured persona')
  }
  return {
    ...(raw as unknown as PersonaV2),
    id,
    name,
    role,
    voice_id: asText(raw.voice_id),
    voice_speed: asNumber(raw.voice_speed, 1),
    voice_volume: asNumber(raw.voice_volume, 1),
    voice_style: asText(raw.voice_style),
    visibility: personaVisibility(raw.visibility),
    version: asNumber(raw.version, 1),
    can_manage: asBoolean(raw.can_manage),
    read_only: asBoolean(raw.read_only, !asBoolean(raw.can_manage)),
    hard_rules: Array.isArray(raw.hard_rules) ? raw.hard_rules : [],
    identity: asRecord(raw.identity) as PersonaV2['identity'],
    expression: asRecord(raw.expression) as PersonaV2['expression'],
    decision: asRecord(raw.decision) as PersonaV2['decision'],
    interpersonal: asRecord(raw.interpersonal) as PersonaV2['interpersonal'],
    user_context:
      typeof raw.user_context === 'string' ? raw.user_context : null,
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    rejected_features:
      (asRecord(raw.rejected_features) as Record<string, number[]> | null) ??
      {},
    source_materials: Array.isArray(raw.source_materials)
      ? raw.source_materials.filter(
          (item): item is string => typeof item === 'string'
        )
      : [],
    training_snapshot: asRecord(raw.training_snapshot) ?? {},
  }
}

export async function listTrainingVoiceCatalog(): Promise<
  TrainingVoiceProfile[]
> {
  const response = await api.get<TalkWiseResponse<unknown[]>>(
    `${TALKWISE_PERSONAS_API}/voice-catalog`,
    requestConfig
  )
  const items = requireData(response.data)
  return items.flatMap((item) => {
    const raw = asRecord(item)
    const id = asText(raw?.id)
    if (!raw || !id) return []
    const fallback = TRAINING_VOICE_OPTIONS.find((option) => option.id === id)
    return [
      {
        id,
        provider: asText(raw.provider) ?? 'volcengine',
        service: asText(raw.service) ?? 'tts_streaming',
        model: asText(raw.model) ?? 'doubao-bigtts',
        englishLabel: fallback?.englishLabel ?? asText(raw.english_label) ?? id,
        chineseLabel: fallback?.chineseLabel ?? asText(raw.chinese_label) ?? id,
        language: asText(raw.language) ?? 'zh-CN',
        tags: Array.isArray(raw.tags)
          ? raw.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        supportsEmotion: asBoolean(raw.supports_emotion),
        supportsSpeed: asBoolean(raw.supports_speed, true),
        supportsLoudness: asBoolean(raw.supports_loudness, true),
        supportsPitch: asBoolean(raw.supports_pitch),
        supportsRealtimeS2s: asBoolean(raw.supports_realtime_s2s),
      },
    ]
  })
}

function personaPath(personaId: string, suffix = ''): string {
  const id = personaId.trim()
  if (!id) throw new Error('Persona id is required')
  return `${TALKWISE_PERSONAS_API}/${encodeURIComponent(id)}${suffix}`
}

const requestConfig = {
  skipBusinessError: true,
  skipErrorHandler: true,
} as const

export function personaRequestErrorMessage(
  error: unknown,
  fallback = 'Persona request failed'
): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { detail?: string | { message?: string }; message?: string }
      | undefined
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.message
    if (error.response?.status === 403) {
      return detail || 'You do not have permission to manage this persona'
    }
    if (error.response?.status === 404) {
      return detail || 'Persona not found or no longer available'
    }
    return detail || payload?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export async function listPersonas(): Promise<PersonaSummary[]> {
  const response = await api.get<TalkWiseResponse<unknown[]>>(
    TALKWISE_PERSONAS_API,
    requestConfig
  )
  return requireData(response.data).flatMap((item) => {
    const persona = normalizePersonaSummary(item)
    return persona ? [persona] : []
  })
}

export async function getPersona(personaId: string): Promise<PersonaDetail> {
  const response = await api.get<TalkWiseResponse<unknown>>(
    personaPath(personaId),
    requestConfig
  )
  return normalizePersonaDetail(requireData(response.data))
}

export async function createPersona(
  input: CreatePersonaInput
): Promise<{ id: string; version: number }> {
  const response = await api.post<TalkWiseResponse<unknown>>(
    TALKWISE_PERSONAS_API,
    input,
    requestConfig
  )
  const raw = asRecord(requireData(response.data))
  const id = asText(raw?.id)
  if (!raw || !id) throw new Error('TalkWise did not return a persona id')
  return { id, version: asNumber(raw.version, 1) }
}

export async function updatePersona(
  personaId: string,
  input: UpdatePersonaInput
): Promise<void> {
  const response = await api.put<TalkWiseResponse<unknown>>(
    personaPath(personaId),
    input,
    requestConfig
  )
  requireData(response.data)
}

export async function archivePersona(personaId: string): Promise<void> {
  const response = await api.delete<TalkWiseResponse<unknown>>(
    personaPath(personaId),
    requestConfig
  )
  requireData(response.data)
}

export async function getPersonaV2(personaId: string): Promise<PersonaV2> {
  const response = await api.get<TalkWiseResponse<unknown>>(
    personaPath(personaId, '/v2'),
    requestConfig
  )
  return normalizePersonaV2(requireData(response.data))
}

export async function patchPersonaV2(
  personaId: string,
  patch: PersonaV2Patch
): Promise<PersonaV2> {
  const response = await api.patch<TalkWiseResponse<unknown>>(
    personaPath(personaId, '/v2'),
    patch,
    requestConfig
  )
  return normalizePersonaV2(requireData(response.data))
}

export async function startPersonaTraining(
  personaId: string
): Promise<unknown> {
  const response = await api.post<TalkWiseResponse<unknown>>(
    personaPath(personaId, '/start-battle'),
    undefined,
    requestConfig
  )
  return requireData(response.data)
}

export async function detectPersonaSpeakers(
  materials: readonly string[]
): Promise<DetectedSpeaker[]> {
  const response = await api.post<TalkWiseResponse<unknown[]>>(
    `${TALKWISE_PERSONA_BUILDER_API}/detect-speakers`,
    { materials: materials.map((item) => item.trim()).filter(Boolean) },
    requestConfig
  )
  return requireData(response.data).flatMap((item) => {
    const raw = asRecord(item)
    const name = asText(raw?.name)
    if (!raw || !name) return []
    return [
      {
        name,
        role: asText(raw.role) ?? '',
        speakingTurns: asNumber(raw.speaking_turns),
        dominanceLevel: asText(raw.dominance_level) ?? 'medium',
        sampleQuote: asText(raw.sample_quote) ?? '',
      },
    ]
  })
}

const BUILD_EVENT_TYPES = new Set<PersonaBuildEventType>([
  'workspace_ready',
  'agent_tool_use',
  'agent_message',
  'parse_done',
  'adversarialize_start',
  'adversarialize_done',
  'enhancement_start',
  'enhancement_merge',
  'persist_done',
  'heartbeat',
  'error',
])

function normalizeBuildEvent(value: unknown): PersonaBuildEvent | null {
  const raw = asRecord(value)
  const type = asText(raw?.type) as PersonaBuildEventType | null
  if (!raw || !type || !BUILD_EVENT_TYPES.has(type)) return null
  return {
    seq: asNumber(raw.seq),
    type,
    ts: asNumber(raw.ts),
    data: asRecord(raw.data) ?? {},
  }
}

export function parsePersonaBuildSse(input: string): {
  events: PersonaBuildEvent[]
  remainder: string
} {
  const normalized = input.replaceAll('\r\n', '\n')
  const frames = normalized.split('\n\n')
  const remainder = frames.pop() ?? ''
  const events = frames.flatMap((frame) => {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (!data) return []
    try {
      const event = normalizeBuildEvent(JSON.parse(data))
      return event ? [event] : []
    } catch {
      return []
    }
  })
  return { events, remainder }
}

export function personaBuildPayload(input: BuildPersonaInput) {
  return {
    materials: input.materials.map((item) => item.trim()).filter(Boolean),
    target_persona_id: input.targetPersonaId?.trim() || undefined,
    name: input.name?.trim() || undefined,
    role: input.role?.trim() || undefined,
  }
}

async function buildResponseError(response: Response): Promise<Error> {
  try {
    const payload = (await response.json()) as {
      detail?: string | { message?: string }
      message?: string
    }
    const detail =
      typeof payload.detail === 'string'
        ? payload.detail
        : payload.detail?.message
    return new Error(
      detail || payload.message || `Build failed: ${response.status}`
    )
  } catch {
    return new Error(`Build failed: ${response.status}`)
  }
}

export async function buildPersona(
  input: BuildPersonaInput,
  options: {
    readonly signal?: AbortSignal
    readonly onEvent: (event: PersonaBuildEvent) => void
  }
): Promise<string> {
  const payload = personaBuildPayload(input)
  if (payload.materials.length === 0) {
    throw new Error('Add at least one source material')
  }
  const authHeaders = await getFreshAuthHeaders()
  const response = await fetch(`${TALKWISE_PERSONA_BUILDER_API}/build`, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
    headers: {
      ...authHeaders,
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw await buildResponseError(response)
  if (!response.body) throw new Error('Persona build did not return a stream')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let personaId = ''

  const handleEvent = (event: PersonaBuildEvent) => {
    options.onEvent(event)
    if (event.type === 'error') {
      throw new Error(asText(event.data.message) || 'Persona build failed')
    }
    if (event.type === 'persist_done') {
      personaId = asText(event.data.persona_id) || personaId
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const parsed = parsePersonaBuildSse(buffer)
    buffer = parsed.remainder
    parsed.events.forEach(handleEvent)
    if (done) break
  }
  parsePersonaBuildSse(`${buffer}\n\n`).events.forEach(handleEvent)
  if (!personaId) {
    throw new Error('Persona build finished without a saved asset')
  }
  return personaId
}

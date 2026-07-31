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
import { api } from '@/lib/http-client'

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

interface TrainingSessionDTO {
  session_id: string
  task_config: {
    role: string
    difficulty: string
    category: string
    tech_stack: string[]
    metadata?: Record<string, unknown> | null
  }
  mode: 'realtime' | 'text' | 'video' | 'voice'
  scenario_template_id?: string | null
  status: 'active' | 'completed' | 'created' | 'failed'
  room_id?: string | number | null
  started_at?: string | null
  completed_at?: string | null
  message_count: number
}

export type TrainingConversationSession = {
  readonly id: string
  readonly conversationId: string
  readonly title: string
  readonly description: string
  readonly difficulty: string
  readonly status: TrainingSessionDTO['status']
  readonly messageCount: number
  readonly updatedAt: string | null
  readonly scenarioId: string | null
  readonly metadata: Record<string, unknown> | undefined
}

function requireData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

function apiBase(value: string): string {
  return value.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function conversationIdForSession(session: TrainingSessionDTO): string | null {
  const metadata = session.task_config.metadata
  const metadataConversationId = asText(metadata?.conversationId)
  if (metadataConversationId) return metadataConversationId

  const roomId = asText(
    session.room_id === null || session.room_id === undefined
      ? null
      : String(session.room_id)
  )
  if (!roomId) return null

  // Text sessions created by the TrainingCore adapter keep a legacy room reference
  // alongside the actual conversation tree. Only unwrap the known adapter prefix.
  const prefixedConversationId = roomId.match(
    /^talkwise-conversation:(.+)$/
  )?.[1]
  return asText(prefixedConversationId) || roomId
}

function scenarioTitle(session: TrainingSessionDTO): string {
  const metadata = session.task_config.metadata
  const scenario =
    metadata && typeof metadata.scenario_training === 'object'
      ? (metadata.scenario_training as Record<string, unknown>)
      : null
  return (
    asText(scenario?.title) ||
    session.task_config.tech_stack[0] ||
    session.task_config.role ||
    session.scenario_template_id ||
    session.session_id
  )
}

function toTrainingConversationSession(
  session: TrainingSessionDTO
): TrainingConversationSession | null {
  const metadata = session.task_config.metadata
  if (
    session.mode !== 'text' ||
    metadata?.runtime !== 'conversation_message_tree' ||
    session.room_id === null ||
    session.room_id === undefined
  ) {
    return null
  }
  const conversationId = conversationIdForSession(session)
  if (!conversationId) return null

  return {
    id: session.session_id,
    conversationId,
    title: scenarioTitle(session),
    description: session.task_config.role || session.task_config.category,
    difficulty: session.task_config.difficulty,
    status: session.status,
    messageCount: session.message_count,
    updatedAt: session.completed_at || session.started_at || null,
    scenarioId: session.scenario_template_id ?? null,
    metadata: metadata ?? undefined,
  }
}

export async function listTrainingConversationSessions(
  trainingApiBase: string
): Promise<TrainingConversationSession[]> {
  const response = await api.get<TalkWiseResponse<TrainingSessionDTO[]>>(
    `${apiBase(trainingApiBase)}/sessions?limit=100`,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return requireData(response.data)
    .map(toTrainingConversationSession)
    .filter((item): item is TrainingConversationSession => item !== null)
}

export async function deleteTrainingConversationSession(
  trainingApiBase: string,
  sessionId: string
): Promise<void> {
  const response = await api.delete<TalkWiseResponse<{ deleted: boolean }>>(
    `${apiBase(trainingApiBase)}/sessions/${encodeURIComponent(sessionId)}`,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  requireData(response.data)
}

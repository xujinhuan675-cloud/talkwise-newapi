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
export interface TrainingConversationWorkspaceSearch {
  readonly session?: string
  readonly conversation?: string
  readonly message?: string
}

/**
 * The backend result required before a preparation flow can enter the
 * message-tree workspace. Both resources must be server-created and scoped
 * to the current NewAPI user before the client receives this payload.
 */
export interface TrainingConversationStartResult {
  readonly trainingSessionId: string
  readonly conversationId: string
}

type RawTrainingConversationStartResult = {
  readonly training_session_id?: unknown
  readonly conversation_id?: unknown
}

function identifier(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const normalized = String(value).trim()
  return normalized || null
}

export function normalizeTrainingConversationWorkspaceSearch(
  value: unknown
): TrainingConversationWorkspaceSearch {
  const raw = value as TrainingConversationWorkspaceSearch | null
  const session = identifier(raw?.session)
  const conversation = identifier(raw?.conversation)
  const message = identifier(raw?.message)
  return {
    ...(session ? { session } : {}),
    ...(conversation ? { conversation } : {}),
    ...(message ? { message } : {}),
  }
}

/**
 * Accepts the wire shape returned by a Battle/Defense start endpoint. Do not
 * infer either identifier from a room id: the message-tree conversation is
 * the resource consumed by the native workspace.
 */
export function parseTrainingConversationStartResult(
  value: unknown
): TrainingConversationStartResult | null {
  const raw = value as RawTrainingConversationStartResult | null
  if (!raw || typeof raw !== 'object') return null

  const trainingSessionId = identifier(raw.training_session_id)
  const conversationId = identifier(raw.conversation_id)
  if (!trainingSessionId || !conversationId) return null

  return { trainingSessionId, conversationId }
}

export function trainingConversationWorkspaceSearch(
  result: TrainingConversationStartResult
): TrainingConversationWorkspaceSearch {
  return {
    session: result.trainingSessionId,
    conversation: result.conversationId,
  }
}

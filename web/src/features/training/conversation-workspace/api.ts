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
import { getFreshAuthHeaders } from '@/lib/api'

export const TRAINING_CONVERSATION_API_BASE = '/api/talkwise/conversation-tree'

export type TrainingConversationMessageRole = 'assistant' | 'system' | 'user'

export interface TrainingConversationSessionContext {
  readonly sessionId: string
  readonly scenarioId?: string | null
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface TrainingConversationMessage {
  readonly publicId: string
  readonly role: TrainingConversationMessageRole
  readonly content: string
  readonly parentMessageId: string | null
  readonly branchId: string | null
  readonly createdAt: string | null
}

export interface TrainingConversationActionResult {
  readonly message: TrainingConversationMessage | null
  readonly path: TrainingConversationMessage[]
}

export interface TrainingConversationSendRequest {
  readonly message: string
  readonly session: TrainingConversationSessionContext
  readonly parentMessageId?: string | null
  readonly branchId?: string | null
  readonly model?: string
  readonly temperature?: number
  readonly maxTokens?: number
}

export type TrainingConversationStreamEvent =
  | {
      readonly type: 'message_created'
      readonly publicId: string
      readonly parentMessageId: string | null
      readonly branchId: string | null
    }
  | { readonly type: 'message_delta'; readonly content: string }
  | {
      readonly type: 'message_complete'
      readonly publicId: string
      readonly parentMessageId: string | null
      readonly branchId: string | null
      readonly content: string
    }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'done' }

export interface TrainingConversationStreamOptions {
  readonly signal?: AbortSignal
  readonly onEvent: (event: TrainingConversationStreamEvent) => void
}

type TalkWiseResponse<T> = {
  code?: number
  message?: string
  data?: T | null
  detail?: string
  error?: { message?: string; detail?: string } | string
}

type RawConversationMessage = {
  public_id?: unknown
  publicId?: unknown
  role?: unknown
  content?: unknown
  text?: unknown
  message?: unknown
  parent_message_id?: unknown
  parentMessageId?: unknown
  branch_id?: unknown
  branchId?: unknown
  created_at?: unknown
  createdAt?: unknown
}

function conversationPath(conversationId: string, suffix = ''): string {
  const normalizedId = conversationId.trim()
  if (!normalizedId) {
    throw new Error('conversationId cannot be empty')
  }
  return `${TRAINING_CONVERSATION_API_BASE}/${encodeURIComponent(normalizedId)}${suffix}`
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function roleValue(value: unknown): TrainingConversationMessageRole {
  const normalized = textValue(value)?.toLowerCase()
  if (
    normalized === 'assistant' ||
    normalized === 'persona' ||
    normalized === 'counterpart' ||
    normalized === 'agent'
  ) {
    return 'assistant'
  }
  if (normalized === 'system' || normalized === 'coach') return 'system'
  return 'user'
}

export function normalizeTrainingConversationMessage(
  value: unknown
): TrainingConversationMessage | null {
  const raw = value as RawConversationMessage | null
  if (!raw || typeof raw !== 'object') return null

  const publicId = textValue(raw.publicId ?? raw.public_id)
  if (!publicId) return null

  return {
    publicId,
    role: roleValue(raw.role),
    content: textValue(raw.content ?? raw.text ?? raw.message) ?? '',
    parentMessageId: textValue(raw.parentMessageId ?? raw.parent_message_id),
    branchId: textValue(raw.branchId ?? raw.branch_id),
    createdAt: textValue(raw.createdAt ?? raw.created_at),
  }
}

export function normalizeTrainingConversationMessages(
  value: unknown
): TrainingConversationMessage[] {
  const root = recordValue(value)
  const payload = root?.data ?? value
  const data = recordValue(payload)
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(data?.items)
      ? data.items
      : []

  return items
    .map(normalizeTrainingConversationMessage)
    .filter(
      (message): message is TrainingConversationMessage => message !== null
    )
}

export function buildTrainingConversationSendPayload(
  request: TrainingConversationSendRequest
): Record<string, unknown> {
  const message = request.message.trim()
  if (!message) {
    throw new Error('message cannot be empty')
  }

  const sessionId = request.session.sessionId.trim()
  if (!sessionId) {
    throw new Error('training sessionId cannot be empty')
  }

  const metadata = {
    ...(request.session.metadata ?? {}),
    source: 'newapi_training_conversation_workspace',
    training_session_id: sessionId,
    ...(request.session.scenarioId?.trim()
      ? { scenario_id: request.session.scenarioId.trim() }
      : {}),
  }

  return {
    message,
    stream: true,
    ...(request.parentMessageId?.trim()
      ? { parent_message_id: request.parentMessageId.trim() }
      : {}),
    ...(request.branchId?.trim() ? { branch_id: request.branchId.trim() } : {}),
    ...(request.model?.trim() ? { model: request.model.trim() } : {}),
    ...(request.temperature === undefined
      ? {}
      : { temperature: request.temperature }),
    ...(request.maxTokens === undefined
      ? {}
      : { max_tokens: request.maxTokens }),
    metadata,
  }
}

function normalizeStreamEvent(
  type: string,
  value: unknown
): TrainingConversationStreamEvent | null {
  const data = recordValue(value) ?? {}

  if (type === 'message_created') {
    const publicId = textValue(data.public_id ?? data.publicId)
    return publicId
      ? {
          type,
          publicId,
          parentMessageId: textValue(
            data.parent_message_id ?? data.parentMessageId
          ),
          branchId: textValue(data.branch_id ?? data.branchId),
        }
      : null
  }

  if (type === 'message_delta') {
    return { type, content: textValue(data.content) ?? '' }
  }

  if (type === 'message_complete') {
    const publicId = textValue(data.public_id ?? data.publicId)
    return publicId
      ? {
          type,
          publicId,
          parentMessageId: textValue(
            data.parent_message_id ?? data.parentMessageId
          ),
          branchId: textValue(data.branch_id ?? data.branchId),
          content: textValue(data.content) ?? '',
        }
      : null
  }

  if (type === 'error') {
    return {
      type,
      message: textValue(data.message) ?? 'Response generation failed.',
    }
  }

  return type === 'done' ? { type } : null
}

export function parseTrainingConversationSse(source: string): {
  events: TrainingConversationStreamEvent[]
  remainder: string
} {
  const frames = source.split(/\r?\n\r?\n/)
  const remainder = frames.pop() ?? ''
  const events: TrainingConversationStreamEvent[] = []

  for (const frame of frames) {
    const lines = frame.split(/\r?\n/)
    const type = lines
      .find((line) => line.startsWith('event:'))
      ?.slice('event:'.length)
      .trim()
    const data = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n')

    if (!type || !data) continue
    try {
      const event = normalizeStreamEvent(type, JSON.parse(data))
      if (event) events.push(event)
    } catch {
      // Ignore malformed SSE frames and keep the active stream alive.
    }
  }

  return { events, remainder }
}

async function responseError(
  response: Response,
  fallback: string
): Promise<Error> {
  try {
    const payload = (await response.json()) as TalkWiseResponse<unknown>
    const upstreamError = recordValue(payload.error)
    const message =
      textValue(payload.detail) ??
      textValue(payload.error) ??
      textValue(upstreamError?.message) ??
      textValue(upstreamError?.detail) ??
      textValue(payload.message)
    return new Error(message || `${fallback}: ${response.status}`)
  } catch {
    return new Error(`${fallback}: ${response.status}`)
  }
}

async function trainingFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const authHeaders = await getFreshAuthHeaders()
  return fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...authHeaders,
      Accept: 'application/json',
      ...init.headers,
    },
  })
}

export async function loadTrainingConversationMessages(
  conversationId: string,
  signal?: AbortSignal
): Promise<TrainingConversationMessage[]> {
  const response = await trainingFetch(
    `${conversationPath(conversationId, '/messages')}?size=200`,
    { signal }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to load training conversation')
  }
  return normalizeTrainingConversationMessages(await response.json())
}

export async function editTrainingConversationMessage(
  conversationId: string,
  messagePublicId: string,
  content: string,
  session: TrainingConversationSessionContext
): Promise<TrainingConversationActionResult> {
  const messageId = messagePublicId.trim()
  const editedContent = content.trim()
  if (!messageId || !editedContent) {
    throw new Error('message id and edited content are required')
  }

  const response = await trainingFetch(
    conversationPath(
      conversationId,
      `/messages/${encodeURIComponent(messageId)}/actions`
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit',
        content: editedContent,
        metadata: {
          ...(session.metadata ?? {}),
          source: 'newapi_training_conversation_workspace',
          training_session_id: session.sessionId,
        },
      }),
    }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to save message edit')
  }

  const payload = (await response.json()) as TalkWiseResponse<unknown>
  const data = recordValue(payload.data)
  return {
    message: normalizeTrainingConversationMessage(data?.message),
    path: normalizeTrainingConversationMessages(data?.path),
  }
}

export async function sendTrainingConversationMessage(
  conversationId: string,
  request: TrainingConversationSendRequest,
  options: TrainingConversationStreamOptions
): Promise<void> {
  const response = await trainingFetch(
    conversationPath(conversationId, '/chat'),
    {
      method: 'POST',
      signal: options.signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTrainingConversationSendPayload(request)),
    }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to start training response')
  }
  if (!response.body) {
    throw new Error('Training response did not include a stream body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const parsed = parseTrainingConversationSse(buffer)
    buffer = parsed.remainder
    parsed.events.forEach(options.onEvent)
    if (done) break
  }

  const finalFrame = parseTrainingConversationSse(`${buffer}\n\n`)
  finalFrame.events.forEach(options.onEvent)
}

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

import { trainingMessagePresentation } from '../training-message-presentation'

export const TRAINING_CONVERSATION_API_BASE = '/api/talkwise/conversation-tree'
const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'

export type TrainingConversationMessageRole = 'assistant' | 'system' | 'user'

export interface TrainingConversationSessionContext {
  readonly sessionId: string
  readonly scenarioId?: string | null
  readonly title?: string
  readonly description?: string
  readonly difficulty?: string
  readonly status?: string
  readonly interactionMode?: 'turn_based' | 'realtime'
  readonly reportId?: string | null
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface TrainingConversationMessage {
  readonly publicId: string
  readonly role: TrainingConversationMessageRole
  readonly content: string
  readonly contentParts?: readonly Record<string, unknown>[]
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly emotionLabel?: string | null
  readonly emotionScore?: number | null
  readonly parentMessageId: string | null
  readonly branchId: string | null
  readonly createdAt: string | null
}

export interface TrainingConversationActionResult {
  readonly message: TrainingConversationMessage | null
  readonly path: TrainingConversationMessage[]
}

export interface TrainingConversationBranchResult extends TrainingConversationActionResult {
  readonly children: TrainingConversationMessage[]
  readonly siblings: TrainingConversationMessage[]
  readonly branchId: string | null
}

export type TrainingConversationForkOption =
  | 'directPath'
  | 'includeBranches'
  | 'targetLevel'

export interface TrainingConversationForkRequest {
  readonly session: TrainingConversationSessionContext
  readonly title?: string
  readonly option?: TrainingConversationForkOption
  readonly includeDeleted?: boolean
  readonly statuses?: readonly string[]
}

export interface TrainingConversationForkedConversation {
  readonly id: string
  readonly title: string
  readonly status: string | null
}

export interface TrainingConversationForkResult {
  readonly conversation: TrainingConversationForkedConversation
  readonly messages: TrainingConversationMessage[]
  readonly sourceToForkedId: Readonly<Record<string, string>>
}

export interface TrainingSessionConversationForkResult extends TrainingConversationForkResult {
  readonly trainingSession: {
    readonly id: string
    readonly status: string
    readonly conversationId: string
  }
}

export interface TrainingConversationGuidanceEvent {
  readonly eventType: string
  readonly severity: string
  readonly title: string
  readonly message: string
  readonly suggestedText: string | null
  readonly createdAt: string | null
}

export interface TrainingConversationGuidanceCapabilities {
  readonly refresh: boolean
  readonly stream: boolean
  readonly persistence: boolean
  readonly history: boolean
  readonly serverSelectedPath: boolean
}

export interface TrainingConversationGuidancePersistence {
  readonly status: string
  readonly retryable: boolean
  readonly persisted: boolean
  readonly code: string | null
  readonly snapshotId: string | null
  readonly selectedTailMessageId: string | null
  readonly savedCount: number | null
  readonly historyCount: number | null
  readonly historyLimit: number | null
  readonly deduplicated: boolean | null
}

export interface TrainingConversationGuidanceSnapshot {
  readonly snapshotId: string
  readonly selectedTailMessageId: string
  readonly persistedAt: string | null
  readonly eventCount: number
  readonly events: TrainingConversationGuidanceEvent[]
  readonly source: string | null
  readonly contextRuntime: string | null
  readonly contextSelection: string | null
  readonly windowSize: number | null
  readonly totalTurnCount: number | null
}

export interface TrainingConversationGuidanceResult {
  readonly sessionId: string
  readonly source: string | null
  readonly contextRuntime: string | null
  readonly contextSelection: string | null
  readonly selectedTailMessageId: string | null
  readonly windowSize: number | null
  readonly totalTurnCount: number | null
  readonly capabilities: TrainingConversationGuidanceCapabilities
  readonly events: TrainingConversationGuidanceEvent[]
  readonly history: TrainingConversationGuidanceSnapshot[]
  readonly persistence: TrainingConversationGuidancePersistence
}

export interface TrainingConversationGuidanceHistoryResult {
  readonly status: string
  readonly retryable: boolean
  readonly selectedTailMessageId: string
  readonly history: TrainingConversationGuidanceSnapshot[]
  readonly historyCount: number
  readonly historyLimit: number | null
  readonly persistence: TrainingConversationGuidancePersistence
  readonly capabilities: TrainingConversationGuidanceCapabilities | null
}

export interface TrainingConversationReportSummary {
  readonly id: string
  readonly summary: string
  readonly createdAt: string | null
  readonly suggestions: readonly {
    readonly counterpart: string | null
    readonly priority: string | null
    readonly suggestion: string
  }[]
}

export type TrainingConversationCompletionReportStatus =
  | 'failed'
  | 'pending'
  | 'ready'
  | 'skipped'

export interface TrainingConversationCompletionResult {
  readonly sessionId: string
  readonly conversationId: string
  readonly status: 'completed'
  readonly reportId: string | null
  readonly reportStatus: TrainingConversationCompletionReportStatus
  readonly reportError: string | null
  readonly metadata: Readonly<Record<string, unknown>>
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
      readonly metadata?: Readonly<Record<string, unknown>>
      readonly contentParts?: readonly Record<string, unknown>[]
    }
  | {
      readonly type: 'error'
      readonly message: string
      readonly retryable: boolean
      readonly statusCode: number | null
      readonly errorType: string | null
    }
  | { readonly type: 'done' }

export interface TrainingConversationStreamOptions {
  readonly signal?: AbortSignal
  readonly onEvent: (event: TrainingConversationStreamEvent) => void
}

type TalkWiseResponse<T> = {
  code?: number
  message?: string
  data?: T | null
  detail?: unknown
  error?: { message?: string; detail?: string } | string
}

type RawConversationMessage = {
  public_id?: unknown
  publicId?: unknown
  role?: unknown
  content?: unknown
  text?: unknown
  message?: unknown
  content_parts?: unknown
  contentParts?: unknown
  metadata?: unknown
  emotion_score?: unknown
  emotionScore?: unknown
  emotion_label?: unknown
  emotionLabel?: unknown
  parent_message_id?: unknown
  parentMessageId?: unknown
  branch_id?: unknown
  branchId?: unknown
  created_at?: unknown
  createdAt?: unknown
}

type RawConversation = {
  id?: unknown
  title?: unknown
  status?: unknown
}

type RawTrainingSession = {
  session_id?: unknown
  status?: unknown
  room_id?: unknown
  report_id?: unknown
  task_config?: unknown
}

export type TrainingConversationMessageOperation =
  | 'actions'
  | 'children'
  | 'path'

function conversationPath(conversationId: string, suffix = ''): string {
  const normalizedId = conversationId.trim()
  if (!normalizedId) {
    throw new Error('conversationId cannot be empty')
  }
  return `${TRAINING_CONVERSATION_API_BASE}/${encodeURIComponent(normalizedId)}${suffix}`
}

function normalizedApiBase(value: string): string {
  return value.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
}

export function buildTrainingConversationMessageEndpoint(
  conversationId: string,
  messagePublicId: string,
  operation: TrainingConversationMessageOperation
): string {
  const messageId = messagePublicId.trim()
  if (!messageId) {
    throw new Error('message public id cannot be empty')
  }
  return conversationPath(
    conversationId,
    `/messages/${encodeURIComponent(messageId)}/${operation}`
  )
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

function numberValue(value: unknown): number | null {
  const text = textValue(value)
  if (typeof value !== 'number' && text === null) return null
  const number = typeof value === 'number' ? value : Number(text)
  return Number.isFinite(number) ? number : null
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function optionalBooleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = recordValue(item)
        return record ? [record] : []
      })
    : []
}

function responseData(value: unknown): unknown {
  const root = recordValue(value)
  return root && 'data' in root ? root.data : value
}

function messageTreeConversationId(value: unknown): string | null {
  const roomId = textValue(value)
  if (!roomId) return null
  const prefixed = roomId.match(/^talkwise-conversation:(.+)$/)?.[1]
  return textValue(prefixed) ?? roomId
}

function scopedTrainingMetadata(
  session: TrainingConversationSessionContext
): Record<string, string> {
  const sessionId = session.sessionId.trim()
  if (!sessionId) {
    throw new Error('training sessionId cannot be empty')
  }

  const source = textValue(session.metadata?.source)
  return {
    source: source ?? 'newapi_training_conversation_workspace',
    training_session_id: sessionId,
    ...(session.scenarioId?.trim()
      ? { scenario_id: session.scenarioId.trim() }
      : {}),
  }
}

function normalizedStatuses(statuses: readonly string[] | undefined): string[] {
  if (!statuses) return []
  return [
    ...new Set(
      statuses
        .map((status) => status.trim())
        .filter((status) => status.length > 0)
    ),
  ]
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

  const metadata = recordValue(raw.metadata) ?? {}
  const rawContent = textValue(raw.content ?? raw.text ?? raw.message) ?? ''
  const presentation = trainingMessagePresentation(
    rawContent,
    metadata,
    numberValue(raw.emotionScore ?? raw.emotion_score),
    textValue(raw.emotionLabel ?? raw.emotion_label)
  )
  const rawContentParts = raw.contentParts ?? raw.content_parts
  const contentParts = recordList(rawContentParts)

  return {
    publicId,
    role: roleValue(raw.role),
    content: presentation.content,
    ...(contentParts.length > 0 ? { contentParts } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(presentation.emotion.label
      ? { emotionLabel: presentation.emotion.label }
      : {}),
    ...(presentation.emotion.score != null
      ? { emotionScore: presentation.emotion.score }
      : {}),
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
  let items: unknown[] = []
  if (Array.isArray(payload)) {
    items = payload
  } else if (Array.isArray(data?.items)) {
    items = data.items
  }

  return items
    .map(normalizeTrainingConversationMessage)
    .filter(
      (message): message is TrainingConversationMessage => message !== null
    )
}

export function normalizeTrainingConversationBranchResult(
  value: unknown
): TrainingConversationBranchResult {
  const data = recordValue(responseData(value)) ?? {}
  return {
    message: normalizeTrainingConversationMessage(data.message),
    path: normalizeTrainingConversationMessages(data.path),
    children: normalizeTrainingConversationMessages(data.children),
    siblings: normalizeTrainingConversationMessages(data.siblings),
    branchId: textValue(data.branchId ?? data.branch_id),
  }
}

function normalizeStringRecord(
  value: unknown
): Readonly<Record<string, string>> {
  const record = recordValue(value)
  if (!record) return {}

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, rawValue]) => {
      const normalizedKey = key.trim()
      const normalizedValue = textValue(rawValue)
      return normalizedKey && normalizedValue
        ? [[normalizedKey, normalizedValue]]
        : []
    })
  )
}

export function normalizeTrainingConversationForkResult(
  value: unknown
): TrainingConversationForkResult | null {
  const data = recordValue(responseData(value))
  const rawConversation = data?.conversation as RawConversation | undefined
  const conversationId = textValue(rawConversation?.id)
  if (!data || !rawConversation || !conversationId) return null

  return {
    conversation: {
      id: conversationId,
      title: textValue(rawConversation.title) ?? '',
      status: textValue(rawConversation.status),
    },
    messages: normalizeTrainingConversationMessages(data.messages),
    sourceToForkedId: normalizeStringRecord(
      data.sourceToForkedId ?? data.source_to_forked_id
    ),
  }
}

export function normalizeTrainingSessionConversationForkResult(
  value: unknown
): TrainingSessionConversationForkResult | null {
  const data = recordValue(responseData(value))
  const base = normalizeTrainingConversationForkResult(data)
  const rawSession = data?.training_session as RawTrainingSession | undefined
  const sessionId = textValue(rawSession?.session_id)
  const status = textValue(rawSession?.status)
  const roomId = textValue(rawSession?.room_id)
  if (!base || !rawSession || !sessionId || status !== 'active' || !roomId) {
    return null
  }

  const expectedRoomId = `talkwise-conversation:${base.conversation.id}`
  if (roomId !== expectedRoomId) return null

  return {
    ...base,
    trainingSession: {
      id: sessionId,
      status,
      conversationId: base.conversation.id,
    },
  }
}

function guidanceSpeaker(
  role: TrainingConversationMessageRole
): 'coach' | 'persona' | 'user' {
  if (role === 'assistant') return 'persona'
  if (role === 'system') return 'coach'
  return 'user'
}

export function buildTrainingConversationGuidancePayload(
  messages: readonly TrainingConversationMessage[],
  selectedTailMessageId?: string | null
): Record<string, unknown> {
  const recentTurns = messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-50)
    .map((message) => ({
      speaker: guidanceSpeaker(message.role),
      text: message.content.trim(),
      turn_id: message.publicId,
      metadata: {
        ...(message.parentMessageId
          ? { parent_message_id: message.parentMessageId }
          : {}),
        ...(message.branchId ? { branch_id: message.branchId } : {}),
      },
    }))

  return {
    recent_turns: recentTurns,
    message_limit: 50,
    ...(selectedTailMessageId?.trim()
      ? { selected_tail_message_id: selectedTailMessageId.trim() }
      : {}),
  }
}

function normalizeTrainingConversationGuidanceEvents(
  value: unknown
): TrainingConversationGuidanceEvent[] {
  const rawEvents = Array.isArray(value) ? value : []
  return rawEvents.flatMap((value) => {
    const event = recordValue(value)
    const eventType = textValue(event?.event_type ?? event?.eventType)
    const title = textValue(event?.title)
    const message = textValue(event?.message)
    if (!event || !eventType || !title || !message) return []
    return [
      {
        eventType,
        severity: textValue(event.severity) ?? 'info',
        title,
        message,
        suggestedText: textValue(event.suggested_text ?? event.suggestedText),
        createdAt: textValue(event.created_at ?? event.createdAt),
      } satisfies TrainingConversationGuidanceEvent,
    ]
  })
}

function normalizeTrainingConversationGuidanceCapabilities(
  value: unknown
): TrainingConversationGuidanceCapabilities {
  const capabilities = recordValue(value)
  return {
    refresh: booleanValue(capabilities?.refresh, true),
    stream: booleanValue(capabilities?.stream, false),
    persistence: booleanValue(capabilities?.persistence, false),
    history: booleanValue(capabilities?.history, false),
    serverSelectedPath: booleanValue(
      capabilities?.server_selected_path ?? capabilities?.serverSelectedPath,
      false
    ),
  }
}

function normalizeTrainingConversationGuidancePersistence(
  value: unknown
): TrainingConversationGuidancePersistence {
  const persistence = recordValue(value)
  return {
    status: textValue(persistence?.status) ?? 'not_requested',
    retryable: booleanValue(persistence?.retryable, false),
    persisted: booleanValue(persistence?.persisted, false),
    code: textValue(persistence?.code),
    snapshotId: textValue(persistence?.snapshot_id ?? persistence?.snapshotId),
    selectedTailMessageId: textValue(
      persistence?.selected_tail_message_id ??
        persistence?.selectedTailMessageId
    ),
    savedCount: numberValue(
      persistence?.saved_count ?? persistence?.savedCount
    ),
    historyCount: numberValue(
      persistence?.history_count ?? persistence?.historyCount
    ),
    historyLimit: numberValue(
      persistence?.history_limit ?? persistence?.historyLimit
    ),
    deduplicated: optionalBooleanValue(persistence?.deduplicated),
  }
}

function normalizeTrainingConversationGuidanceSnapshots(
  value: unknown
): TrainingConversationGuidanceSnapshot[] {
  const snapshots = Array.isArray(value) ? value : []
  return snapshots.flatMap((value) => {
    const snapshot = recordValue(value)
    const snapshotId = textValue(snapshot?.snapshot_id ?? snapshot?.snapshotId)
    const selectedTailMessageId = textValue(
      snapshot?.selected_tail_message_id ?? snapshot?.selectedTailMessageId
    )
    if (!snapshot || !snapshotId || !selectedTailMessageId) return []
    const events = normalizeTrainingConversationGuidanceEvents(snapshot.events)
    return [
      {
        snapshotId,
        selectedTailMessageId,
        persistedAt: textValue(snapshot.persisted_at ?? snapshot.persistedAt),
        eventCount:
          numberValue(snapshot.event_count ?? snapshot.eventCount) ??
          events.length,
        events,
        source: textValue(snapshot.source),
        contextRuntime: textValue(
          snapshot.context_runtime ?? snapshot.contextRuntime
        ),
        contextSelection: textValue(
          snapshot.context_selection ?? snapshot.contextSelection
        ),
        windowSize: numberValue(snapshot.window_size ?? snapshot.windowSize),
        totalTurnCount: numberValue(
          snapshot.total_turn_count ?? snapshot.totalTurnCount
        ),
      } satisfies TrainingConversationGuidanceSnapshot,
    ]
  })
}

export function normalizeTrainingConversationGuidanceResult(
  value: unknown
): TrainingConversationGuidanceResult | null {
  const data = recordValue(responseData(value))
  const sessionId = textValue(data?.session_id ?? data?.sessionId)
  if (!data || !sessionId) return null

  return {
    sessionId,
    source: textValue(data.source),
    contextRuntime: textValue(data.context_runtime ?? data.contextRuntime),
    contextSelection: textValue(
      data.context_selection ?? data.contextSelection
    ),
    selectedTailMessageId: textValue(
      data.selected_tail_message_id ?? data.selectedTailMessageId
    ),
    windowSize: numberValue(data.window_size ?? data.windowSize),
    totalTurnCount: numberValue(data.total_turn_count ?? data.totalTurnCount),
    capabilities: normalizeTrainingConversationGuidanceCapabilities(
      data.capabilities
    ),
    events: normalizeTrainingConversationGuidanceEvents(data.events),
    history: normalizeTrainingConversationGuidanceSnapshots(data.history),
    persistence: normalizeTrainingConversationGuidancePersistence(
      data.persistence ?? data.retry
    ),
  }
}

export function normalizeTrainingConversationGuidanceHistoryResult(
  value: unknown
): TrainingConversationGuidanceHistoryResult | null {
  const data = recordValue(responseData(value))
  const selectedTailMessageId = textValue(
    data?.selected_tail_message_id ?? data?.selectedTailMessageId
  )
  if (!data || !selectedTailMessageId) return null

  const history = normalizeTrainingConversationGuidanceSnapshots(data.history)
  return {
    status: textValue(data.status) ?? (history.length > 0 ? 'ready' : 'empty'),
    retryable: booleanValue(data.retryable, false),
    selectedTailMessageId,
    history,
    historyCount:
      numberValue(data.history_count ?? data.historyCount) ?? history.length,
    historyLimit: numberValue(data.history_limit ?? data.historyLimit),
    persistence: normalizeTrainingConversationGuidancePersistence(
      data.persistence ?? data.retry
    ),
    capabilities: recordValue(data.capabilities)
      ? normalizeTrainingConversationGuidanceCapabilities(data.capabilities)
      : null,
  }
}

export function normalizeTrainingConversationReportSummary(
  value: unknown
): TrainingConversationReportSummary | null {
  const data = recordValue(responseData(value))
  const id = textValue(data?.id)
  if (!data || !id) return null

  const content = recordValue(data.content)
  const rawSuggestions = Array.isArray(content?.communication_suggestions)
    ? content.communication_suggestions
    : []
  const suggestions = rawSuggestions.flatMap((value) => {
    const suggestion = recordValue(value)
    const text = textValue(suggestion?.suggestion)
    if (!suggestion || !text) return []
    return [
      {
        counterpart: textValue(
          suggestion.persona_name ?? suggestion.counterpart
        ),
        priority: textValue(suggestion.priority),
        suggestion: text,
      },
    ]
  })

  return {
    id,
    summary: textValue(data.summary) ?? '',
    createdAt: textValue(data.created_at ?? data.createdAt),
    suggestions,
  }
}

export function buildTrainingConversationCompletionPayload(
  selectedTailMessageId: string,
  generateReport = true
): {
  generate_report: boolean
  report_generation: 'sync'
  selected_tail_message_id: string
} {
  const selectedTail = selectedTailMessageId.trim()
  if (!selectedTail) {
    throw new Error('selected training message tail cannot be empty')
  }
  return {
    generate_report: generateReport,
    report_generation: 'sync',
    selected_tail_message_id: selectedTail,
  }
}

export function normalizeTrainingConversationCompletionResult(
  value: unknown,
  expectedSessionId: string,
  expectedConversationId: string
): TrainingConversationCompletionResult | null {
  const data = recordValue(responseData(value)) as RawTrainingSession | null
  const sessionId = textValue(data?.session_id)
  const conversationId = messageTreeConversationId(data?.room_id)
  const expectedSession = expectedSessionId.trim()
  const expectedConversation = expectedConversationId.trim()
  const status = textValue(data?.status)?.toLowerCase()
  if (
    !data ||
    !expectedSession ||
    !expectedConversation ||
    sessionId !== expectedSession ||
    conversationId !== expectedConversation ||
    status !== 'completed'
  ) {
    return null
  }

  const taskConfig = recordValue(data.task_config)
  const metadata = recordValue(taskConfig?.metadata) ?? {}
  const completion =
    recordValue(metadata.completionReport ?? metadata.completion_report) ?? {}
  const reportId =
    textValue(data.report_id) ??
    textValue(completion.reportId ?? completion.report_id)
  const reportedStatus = textValue(completion.status)?.toLowerCase()
  let reportStatus: TrainingConversationCompletionReportStatus | null = null
  if (reportId) {
    reportStatus = 'ready'
  } else if (
    reportedStatus === 'pending' ||
    reportedStatus === 'failed' ||
    reportedStatus === 'skipped'
  ) {
    reportStatus = reportedStatus
  }
  if (!reportStatus) return null

  return {
    sessionId,
    conversationId,
    status: 'completed',
    reportId,
    reportStatus,
    reportError: textValue(
      completion.message ?? completion.error ?? completion.error_message
    ),
    metadata,
  }
}

export function buildTrainingConversationSendPayload(
  request: TrainingConversationSendRequest
): Record<string, unknown> {
  const message = request.message.trim()
  if (!message) {
    throw new Error('message cannot be empty')
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
    metadata: scopedTrainingMetadata(request.session),
  }
}

export function buildTrainingConversationBranchPayload(): Record<
  string,
  unknown
> {
  return { action: 'branch' }
}

export function buildTrainingConversationForkPayload(
  request: TrainingConversationForkRequest
): Record<string, unknown> {
  const title = request.title?.trim()
  const statuses = normalizedStatuses(request.statuses)
  return {
    ...(title ? { title } : {}),
    option: request.option ?? 'directPath',
    ...(request.includeDeleted === undefined
      ? {}
      : { include_deleted: request.includeDeleted }),
    ...(statuses.length > 0 ? { statuses } : {}),
    metadata: scopedTrainingMetadata(request.session),
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
          metadata: recordValue(data.metadata) ?? {},
          contentParts: recordList(data.content_parts ?? data.contentParts),
        }
      : null
  }

  if (type === 'error') {
    return {
      type,
      message: textValue(data.message) ?? 'Response generation failed.',
      retryable: data.retryable === true,
      statusCode: numberValue(data.status_code ?? data.statusCode),
      errorType: textValue(data.error_type ?? data.errorType),
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

export class TrainingConversationApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'TrainingConversationApiError'
  }
}

async function responseError(
  response: Response,
  fallback: string
): Promise<TrainingConversationApiError> {
  try {
    return new TrainingConversationApiError(
      trainingConversationApiErrorMessage(
        await response.json(),
        response.status,
        fallback
      ),
      response.status
    )
  } catch {
    return new TrainingConversationApiError(
      `${fallback}: ${response.status}`,
      response.status
    )
  }
}

export function trainingConversationApiErrorMessage(
  value: unknown,
  status: number,
  fallback: string
): string {
  const payload = (recordValue(value) ?? {}) as TalkWiseResponse<unknown>
  const upstreamError = recordValue(payload.error)
  const upstreamDetail = recordValue(payload.detail)
  const completionDetail = recordValue(
    upstreamDetail?.completionReport ?? upstreamDetail?.completion_report
  )
  const message =
    textValue(payload.detail) ??
    textValue(upstreamDetail?.message) ??
    textValue(upstreamDetail?.detail) ??
    textValue(completionDetail?.message) ??
    textValue(payload.error) ??
    textValue(upstreamError?.message) ??
    textValue(upstreamError?.detail) ??
    textValue(payload.message)
  return message
    ? `${fallback}: ${status} - ${message}`
    : `${fallback}: ${status}`
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

export async function loadTrainingConversationMessagePath(
  conversationId: string,
  messagePublicId: string,
  signal?: AbortSignal
): Promise<TrainingConversationMessage[]> {
  const response = await trainingFetch(
    buildTrainingConversationMessageEndpoint(
      conversationId,
      messagePublicId,
      'path'
    ),
    { signal }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to load selected message path')
  }
  return normalizeTrainingConversationMessages(await response.json())
}

export async function loadTrainingConversationMessageChildren(
  conversationId: string,
  messagePublicId: string,
  signal?: AbortSignal
): Promise<TrainingConversationMessage[]> {
  const response = await trainingFetch(
    buildTrainingConversationMessageEndpoint(
      conversationId,
      messagePublicId,
      'children'
    ),
    { signal }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to load message branches')
  }
  return normalizeTrainingConversationMessages(await response.json())
}

export async function requestTrainingConversationGuidance(
  trainingApiBase: string,
  session: TrainingConversationSessionContext,
  messages: readonly TrainingConversationMessage[],
  selectedTailMessageId?: string | null,
  signal?: AbortSignal
): Promise<TrainingConversationGuidanceResult> {
  const sessionId = session.sessionId.trim()
  if (!sessionId) throw new Error('training sessionId cannot be empty')
  if (!messages.some((message) => message.content.trim().length > 0)) {
    throw new Error('Training guidance requires at least one message')
  }

  const response = await trainingFetch(
    `${normalizedApiBase(trainingApiBase)}/sessions/${encodeURIComponent(sessionId)}/guidance`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildTrainingConversationGuidancePayload(
          messages,
          selectedTailMessageId
        )
      ),
    }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to load training guidance')
  }

  const result = normalizeTrainingConversationGuidanceResult(
    await response.json()
  )
  if (!result || result.sessionId !== sessionId) {
    throw new Error(
      'Unable to load training guidance: response did not match the active training session'
    )
  }
  return result
}

export async function loadTrainingConversationGuidanceHistory(
  trainingApiBase: string,
  session: TrainingConversationSessionContext,
  selectedTailMessageId: string,
  signal?: AbortSignal
): Promise<TrainingConversationGuidanceHistoryResult> {
  const sessionId = session.sessionId.trim()
  const selectedTail = selectedTailMessageId.trim()
  if (!sessionId) throw new Error('training sessionId cannot be empty')
  if (!selectedTail) {
    throw new Error('selected tail message id cannot be empty')
  }

  const params = new URLSearchParams({
    selected_tail_message_id: selectedTail,
    message_limit: '200',
  })
  const response = await trainingFetch(
    `${normalizedApiBase(trainingApiBase)}/sessions/${encodeURIComponent(sessionId)}/guidance-history?${params.toString()}`,
    { signal }
  )
  if (!response.ok) {
    throw await responseError(
      response,
      'Unable to load training guidance history'
    )
  }

  const result = normalizeTrainingConversationGuidanceHistoryResult(
    await response.json()
  )
  if (!result || result.selectedTailMessageId !== selectedTail) {
    throw new Error(
      'Unable to load training guidance history: response did not match the selected path'
    )
  }
  return result
}

export async function loadTrainingConversationReportSummary(
  trainingApiBase: string,
  sessionId: string,
  signal?: AbortSignal
): Promise<TrainingConversationReportSummary> {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) {
    throw new Error('training sessionId cannot be empty')
  }

  const response = await trainingFetch(
    `${normalizedApiBase(trainingApiBase)}/sessions/${encodeURIComponent(normalizedSessionId)}/report`,
    { signal }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to load training report')
  }

  const report = normalizeTrainingConversationReportSummary(
    await response.json()
  )
  if (!report) {
    throw new Error(
      'Unable to load training report: response did not include a report'
    )
  }
  return report
}

export async function completeTrainingConversationSession(
  trainingApiBase: string,
  session: TrainingConversationSessionContext,
  conversationId: string,
  selectedTailMessageId: string,
  generateReport = true,
  signal?: AbortSignal
): Promise<TrainingConversationCompletionResult> {
  const sessionId = session.sessionId.trim()
  const expectedConversationId = conversationId.trim()
  if (!sessionId || !expectedConversationId) {
    throw new Error('training session and conversation ids are required')
  }

  const response = await trainingFetch(
    `${normalizedApiBase(trainingApiBase)}/sessions/${encodeURIComponent(sessionId)}/complete`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildTrainingConversationCompletionPayload(
          selectedTailMessageId,
          generateReport
        )
      ),
    }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to finish training session')
  }

  const result = normalizeTrainingConversationCompletionResult(
    await response.json(),
    sessionId,
    expectedConversationId
  )
  if (!result) {
    throw new Error(
      'Unable to finish training session: response did not confirm the persisted completion state'
    )
  }
  return result
}

export async function selectTrainingConversationBranch(
  conversationId: string,
  messagePublicId: string,
  signal?: AbortSignal
): Promise<TrainingConversationBranchResult> {
  const response = await trainingFetch(
    buildTrainingConversationMessageEndpoint(
      conversationId,
      messagePublicId,
      'actions'
    ),
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTrainingConversationBranchPayload()),
    }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to select message branch')
  }
  return normalizeTrainingConversationBranchResult(await response.json())
}

export async function forkTrainingSessionConversation(
  trainingApiBase: string,
  messagePublicId: string,
  request: TrainingConversationForkRequest,
  signal?: AbortSignal
): Promise<TrainingSessionConversationForkResult> {
  const sessionId = request.session.sessionId.trim()
  const messageId = messagePublicId.trim()
  if (!sessionId || !messageId) {
    throw new Error('training session and message ids are required')
  }

  const response = await trainingFetch(
    `${normalizedApiBase(trainingApiBase)}/sessions/${encodeURIComponent(sessionId)}/conversation/messages/${encodeURIComponent(messageId)}/fork`,
    {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTrainingConversationForkPayload(request)),
    }
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to fork training conversation')
  }

  const result = normalizeTrainingSessionConversationForkResult(
    await response.json()
  )
  if (!result) {
    throw new Error(
      'Unable to fork training conversation: response did not include a bound training session'
    )
  }
  if (result.trainingSession.id === sessionId) {
    throw new Error(
      'Unable to fork training conversation: response reused the source training session'
    )
  }
  return result
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
          ...scopedTrainingMetadata(session),
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

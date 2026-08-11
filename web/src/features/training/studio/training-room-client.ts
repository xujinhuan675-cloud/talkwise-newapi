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
import { useAuthStore } from '@/stores/auth-store'

import { trainingApiUrl } from '../scenarios/api'
import { trainingMessagePresentation } from '../training-message-presentation'

export type TrainingRoomSender = 'persona' | 'system' | 'user'

export interface TrainingRoomMessage {
  audioReplay?: TrainingRoomAudioReplay | null
  audioSynthesisAvailable?: boolean
  content: string
  emotionLabel: string | null
  emotionScore: number | null
  id: string
  metadata: Record<string, unknown>
  roomId: string
  senderId: string
  senderType: TrainingRoomSender
  timestamp: string | null
  videoAnswer: TrainingRoomVideoAnswer | null
}

export interface TrainingRoomAudioReplay {
  available: true
  original: boolean
  provenance: string | null
  segmentCount: number
  trainingMode: string | null
}

export interface TrainingRoomAudioSegment {
  index: number
  mimeType: string
  size: number
}

export interface TrainingRoomAudioManifest {
  available: true
  messageId: string
  original: boolean
  provenance: string | null
  roomId: string
  segmentCount: number
  segments: TrainingRoomAudioSegment[]
  trainingSessionId: string
}

export interface TrainingRoomVideoAnswer {
  durationMs: number | null
  mimeType: string | null
  recordedAt: string | null
  size: number | null
  url: string | null
}

export interface TrainingRoomEvent {
  data: unknown
  type: string
}

export interface TrainingRoomAudioChunk {
  data: string
  mimeType: string
  personaId: string | null
  replyId: string | null
  sentenceIndex: number | null
}

export interface TrainingRoomMessageInput {
  content: string
  metadata?: Record<string, unknown>
}

export type TrainingRoomCompletionReportStatus =
  | 'failed'
  | 'pending'
  | 'ready'
  | 'skipped'

export interface TrainingRoomCompletionResult {
  readonly sessionId: string
  readonly status: 'completed'
  readonly reportId: string | null
  readonly reportStatus: TrainingRoomCompletionReportStatus
  readonly reportError: string | null
  readonly metadata: Readonly<Record<string, unknown>>
}

interface TalkWiseResponse<T> {
  code: number
  data: T | null
  message: string
}

const VIDEO_ANSWER_MARKER = '[video-answer]'
const ROOM_PROXY_BASE = '/api/talkwise/conversations'
export const LOW_LATENCY_REALTIME_REPLY_MODEL = 'doubao-seed-2-0-mini-260428'

export function trainingRoomReplyModel(
  interactionMode: string,
  model: string
): string {
  if (interactionMode === 'realtime' && model === 'gpt-5.5') {
    return LOW_LATENCY_REALTIME_REPLY_MODEL
  }
  return model
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function completionReportMetadata(
  metadata: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return (
    recordValue(metadata.completionReport ?? metadata.completion_report) ?? {}
  )
}

function senderType(value: unknown): TrainingRoomSender {
  if (value === 'user' || value === 'persona' || value === 'system') {
    return value
  }
  return 'system'
}

function trainingRoomAudioReplay(
  metadata: Record<string, unknown>
): TrainingRoomAudioReplay | null {
  const replay = recordValue(metadata.aiAudio)
  const segmentCount = numberValue(replay?.segmentCount)
  const trainingMode = textValue(replay?.trainingMode)?.toLowerCase() ?? null
  if (
    replay?.available !== true ||
    typeof replay.original !== 'boolean' ||
    segmentCount == null ||
    !Number.isSafeInteger(segmentCount) ||
    segmentCount < 1 ||
    !trainingMode ||
    !['voice', 'realtime', 'realtime_voice', 'video'].includes(trainingMode)
  ) {
    return null
  }
  return {
    available: true,
    original: replay.original,
    provenance: textValue(replay.provenance),
    segmentCount,
    trainingMode,
  }
}

export function trainingRoomPath(roomId: string, sessionId: string): string {
  const normalizedRoomId = roomId.trim()
  const normalizedSessionId = sessionId.trim()
  if (!normalizedRoomId || !normalizedSessionId) {
    throw new Error('A bound training session and room are required.')
  }
  const params = new URLSearchParams({ trainingSessionId: normalizedSessionId })
  return `${ROOM_PROXY_BASE}/rooms/${encodeURIComponent(normalizedRoomId)}?${params.toString()}`
}

export function trainingRoomStreamPath(
  roomId: string,
  sessionId: string
): string {
  return trainingRoomPath(roomId, sessionId).replace(/\?/, '/stream?')
}

export function parseTrainingRoomVideoAnswer(content: string): {
  caption: string
  videoAnswer: TrainingRoomVideoAnswer | null
} {
  const markerIndex = content.indexOf(VIDEO_ANSWER_MARKER)
  if (markerIndex < 0) return { caption: content, videoAnswer: null }

  const caption = content.slice(0, markerIndex).trim()
  const rawMetadata = content
    .slice(markerIndex + VIDEO_ANSWER_MARKER.length)
    .trim()
  let metadata: Record<string, unknown> | null = null
  try {
    metadata = recordValue(JSON.parse(rawMetadata))
  } catch {
    metadata = null
  }

  return {
    caption,
    videoAnswer: {
      durationMs: numberValue(metadata?.durationMs),
      mimeType: textValue(metadata?.mimeType),
      recordedAt: textValue(metadata?.recordedAt),
      size: numberValue(metadata?.size),
      url: textValue(metadata?.url),
    },
  }
}

export function normalizeTrainingRoomMessages(
  value: unknown
): TrainingRoomMessage[] {
  const envelope = recordValue(value)
  const detail = recordValue(envelope?.data) ?? envelope
  const messages = Array.isArray(detail?.messages) ? detail.messages : []

  return messages.flatMap((item, index) => {
    const message = recordValue(item)
    if (!message) return []
    const rawContent =
      typeof message.content === 'string' ? message.content : ''
    const parsedContent = parseTrainingRoomVideoAnswer(rawContent)
    const rawEmotionScore = numberValue(message.emotion_score)
    const emotionScore =
      rawEmotionScore != null && rawEmotionScore >= -5 && rawEmotionScore <= 5
        ? rawEmotionScore
        : null
    const rawMetadata = recordValue(message.metadata) ?? {}
    const presentation = trainingMessagePresentation(
      parsedContent.caption,
      rawMetadata,
      emotionScore,
      textValue(message.emotion_label)
    )

    const audioReplay = trainingRoomAudioReplay(rawMetadata)
    const trainingMode = textValue(rawMetadata.trainingMode)?.toLowerCase()
    const isHistoricalVoiceOpening =
      senderType(message.sender_type) === 'persona' &&
      !audioReplay &&
      trainingMode === 'voice' &&
      (textValue(rawMetadata.eventKind) === 'scenario_opening' ||
        ['training_opening_message', 'scenario_training_opening'].includes(
          textValue(rawMetadata.source) ?? ''
        ))
    return [
      {
        ...(audioReplay ? { audioReplay } : {}),
        ...(isHistoricalVoiceOpening ? { audioSynthesisAvailable: true } : {}),
        content: presentation.content,
        emotionLabel: presentation.emotion.label,
        emotionScore: presentation.emotion.score,
        id: String(
          message.id ?? `${message.sender_type ?? 'message'}-${index}`
        ),
        metadata: rawMetadata,
        roomId: String(message.room_id ?? ''),
        senderId: String(message.sender_id ?? ''),
        senderType: senderType(message.sender_type),
        timestamp: textValue(message.timestamp),
        videoAnswer: parsedContent.videoAnswer,
      },
    ]
  })
}

export function normalizeTrainingRoomCompletionResult(
  value: unknown,
  expectedSessionId: string,
  generateReport: boolean
): TrainingRoomCompletionResult | null {
  const envelope = recordValue(value)
  const session = recordValue(envelope?.data) ?? envelope
  const normalizedSessionId = expectedSessionId.trim()
  const returnedSessionId = textValue(session?.session_id)
  const status = textValue(session?.status)?.toLowerCase()
  if (
    !normalizedSessionId ||
    returnedSessionId !== normalizedSessionId ||
    status !== 'completed'
  ) {
    return null
  }

  const taskConfig = recordValue(session?.task_config)
  const metadata = recordValue(taskConfig?.metadata) ?? {}
  const completion = completionReportMetadata(metadata)
  const reportId =
    textValue(session?.report_id) ??
    textValue(completion.reportId ?? completion.report_id)
  const reportedStatus = textValue(completion.status)?.toLowerCase()
  let reportStatus: TrainingRoomCompletionReportStatus
  if (reportId) {
    reportStatus = 'ready'
  } else if (
    reportedStatus === 'pending' ||
    reportedStatus === 'failed' ||
    reportedStatus === 'skipped'
  ) {
    reportStatus = reportedStatus
  } else {
    reportStatus = generateReport ? 'pending' : 'skipped'
  }

  return {
    sessionId: normalizedSessionId,
    status: 'completed',
    reportId,
    reportStatus,
    reportError: textValue(
      completion.message ?? completion.error ?? completion.error_message
    ),
    metadata,
  }
}

export function parseTrainingRoomSse(source: string): {
  events: TrainingRoomEvent[]
  remainder: string
} {
  const normalized = source.replaceAll('\r\n', '\n')
  const frames = normalized.split('\n\n')
  const remainder = frames.pop() ?? ''
  const events: TrainingRoomEvent[] = []

  for (const frame of frames) {
    if (!frame.trim() || frame.trimStart().startsWith(':')) continue
    let type = 'message'
    const dataLines: string[] = []
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim() || 'message'
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
    }
    if (dataLines.length === 0) continue
    const rawData = dataLines.join('\n')
    let data: unknown = rawData
    try {
      data = JSON.parse(rawData)
    } catch {
      // Preserve non-JSON upstream diagnostics as text.
    }
    events.push({ data, type })
  }

  return { events, remainder }
}

export function trainingRoomAudioChunk(
  event: TrainingRoomEvent
): TrainingRoomAudioChunk | null {
  if (event.type !== 'audio_chunk') return null
  const data = recordValue(event.data)
  const encoded = textValue(data?.data)
  if (!encoded) return null
  const rawMimeType = textValue(data?.mime_type ?? data?.mimeType)
  const mimeType = rawMimeType?.toLowerCase().startsWith('audio/')
    ? rawMimeType
    : 'audio/mpeg'
  const rawSentenceIndex = numberValue(
    data?.sentence_index ?? data?.sentenceIndex
  )

  return {
    data: encoded,
    mimeType,
    personaId: textValue(data?.persona_id ?? data?.personaId),
    replyId: textValue(data?.reply_id ?? data?.replyId),
    sentenceIndex:
      rawSentenceIndex != null && Number.isSafeInteger(rawSentenceIndex)
        ? rawSentenceIndex
        : null,
  }
}

export async function loadTrainingRoomMessages(
  roomId: string,
  sessionId: string
): Promise<TrainingRoomMessage[]> {
  const response = await api.get<TalkWiseResponse<unknown>>(
    trainingRoomPath(roomId, sessionId),
    {
      disableDuplicate: true,
      skipErrorHandler: true,
    }
  )
  return normalizeTrainingRoomMessages(response.data)
}

export function trainingRoomMessageAudioPath(
  roomId: string,
  sessionId: string,
  messageId: string,
  segmentIndex?: number
): string {
  const normalizedRoomId = roomId.trim()
  const normalizedSessionId = sessionId.trim()
  const normalizedMessageId = messageId.trim()
  if (!normalizedRoomId || !normalizedSessionId || !normalizedMessageId) {
    throw new Error('A training session, room, and message are required.')
  }
  const suffix =
    segmentIndex === undefined
      ? ''
      : `/${encodeURIComponent(String(segmentIndex))}`
  const params = new URLSearchParams({
    trainingSessionId: normalizedSessionId,
  })
  return `${ROOM_PROXY_BASE}/rooms/${encodeURIComponent(normalizedRoomId)}/messages/${encodeURIComponent(normalizedMessageId)}/audio${suffix}?${params.toString()}`
}

export async function loadTrainingRoomMessageAudioManifest(
  roomId: string,
  sessionId: string,
  messageId: string,
  signal?: AbortSignal
): Promise<TrainingRoomAudioManifest> {
  const response = await api.get<TalkWiseResponse<unknown>>(
    trainingRoomMessageAudioPath(roomId, sessionId, messageId),
    {
      signal,
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  const envelope = recordValue(response.data)
  const value = recordValue(envelope?.data)
  const segments = Array.isArray(value?.segments)
    ? value.segments.flatMap((item) => {
        const segment = recordValue(item)
        const index = numberValue(segment?.index)
        if (index == null || !Number.isSafeInteger(index) || index < 0) {
          return []
        }
        return [
          {
            index,
            mimeType:
              textValue(segment?.mimeType) ?? 'application/octet-stream',
            size: numberValue(segment?.size) ?? 0,
          },
        ]
      })
    : []
  if (
    value?.available !== true ||
    typeof value.original !== 'boolean' ||
    segments.length === 0
  ) {
    throw new Error('AI audio is not available for this message.')
  }
  return {
    available: true,
    messageId: String(value.messageId ?? messageId),
    original: value.original,
    provenance: textValue(value.provenance),
    roomId: String(value.roomId ?? roomId),
    segmentCount: segments.length,
    segments,
    trainingSessionId: String(value.trainingSessionId ?? sessionId),
  }
}

export async function synthesizeTrainingRoomMessageAudio(
  roomId: string,
  sessionId: string,
  messageId: string,
  signal?: AbortSignal
): Promise<TrainingRoomAudioManifest> {
  const manifestPath = trainingRoomMessageAudioPath(
    roomId,
    sessionId,
    messageId
  )
  const queryIndex = manifestPath.indexOf('?')
  const synthesisPath =
    queryIndex < 0
      ? `${manifestPath}/synthesize`
      : `${manifestPath.slice(0, queryIndex)}/synthesize${manifestPath.slice(queryIndex)}`
  const response = await api.post<TalkWiseResponse<unknown>>(
    synthesisPath,
    undefined,
    {
      signal,
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  const envelope = recordValue(response.data)
  const value = recordValue(envelope?.data)
  const segments = Array.isArray(value?.segments)
    ? value.segments.flatMap((item) => {
        const segment = recordValue(item)
        const index = numberValue(segment?.index)
        if (index == null || !Number.isSafeInteger(index) || index < 0) {
          return []
        }
        return [
          {
            index,
            mimeType:
              textValue(segment?.mimeType) ?? 'application/octet-stream',
            size: numberValue(segment?.size) ?? 0,
          },
        ]
      })
    : []
  if (
    value?.available !== true ||
    typeof value.original !== 'boolean' ||
    segments.length === 0
  ) {
    throw new Error('Synthesized AI audio is not available for this message.')
  }
  return {
    available: true,
    messageId: String(value.messageId ?? messageId),
    original: value.original,
    provenance: textValue(value.provenance),
    roomId: String(value.roomId ?? roomId),
    segmentCount: segments.length,
    segments,
    trainingSessionId: String(value.trainingSessionId ?? sessionId),
  }
}

export async function loadTrainingRoomMessageAudioSegment(
  roomId: string,
  sessionId: string,
  messageId: string,
  segmentIndex: number,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  const response = await api.get<ArrayBuffer>(
    trainingRoomMessageAudioPath(roomId, sessionId, messageId, segmentIndex),
    {
      signal,
      responseType: 'arraybuffer',
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  return response.data
}

export async function sendTrainingRoomMessage(
  roomId: string,
  sessionId: string,
  input: TrainingRoomMessageInput
): Promise<TrainingRoomMessage> {
  const content = input.content.trim()
  if (!content) throw new Error('A training room message cannot be empty.')
  const response = await api.post<TalkWiseResponse<unknown>>(
    trainingRoomPath(roomId, sessionId).replace(/\?/, '/messages?'),
    {
      content,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    },
    {
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  const messages = normalizeTrainingRoomMessages({
    data: { messages: [response.data.data] },
  })
  const message = messages[0]
  if (!message) {
    throw new Error(
      response.data.message || 'Training room message was not saved.'
    )
  }
  return message
}

export async function completeTrainingRoomSession(
  trainingApiBase: string,
  sessionId: string,
  generateReport: boolean,
  signal?: AbortSignal
): Promise<TrainingRoomCompletionResult> {
  const completionPath = trainingRoomCompletionPath(trainingApiBase, sessionId)
  const normalizedSessionId = sessionId.trim()

  const response = await api.post<TalkWiseResponse<unknown>>(
    completionPath,
    {
      generate_report: generateReport,
      report_generation: 'sync',
    },
    {
      signal,
      disableDuplicate: true,
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  const result = normalizeTrainingRoomCompletionResult(
    response.data,
    normalizedSessionId,
    generateReport
  )
  if (!result) {
    throw new Error(
      response.data.message ||
        'Unable to finish training session: response did not confirm completion.'
    )
  }
  return result
}

export function trainingRoomCompletionPath(
  trainingApiBase: string,
  sessionId: string
): string {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) {
    throw new Error('A training session id is required.')
  }
  return trainingApiUrl(
    trainingApiBase,
    `/sessions/${encodeURIComponent(normalizedSessionId)}/complete`
  )
}

export async function streamTrainingRoomEvents(
  roomId: string,
  sessionId: string,
  options: {
    onEvent: (event: TrainingRoomEvent) => void
    signal: AbortSignal
  }
): Promise<void> {
  const accessToken = useAuthStore.getState().auth.accessToken
  if (!accessToken) throw new Error('An authenticated session is required.')

  const response = await fetch(trainingRoomStreamPath(roomId, sessionId), {
    credentials: 'same-origin',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(
      `Training room stream failed with status ${response.status}.`
    )
  }
  if (!response.body) throw new Error('Training room stream is unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const parsed = parseTrainingRoomSse(buffer)
    buffer = parsed.remainder
    parsed.events.forEach(options.onEvent)
    if (done) break
  }
  parseTrainingRoomSse(`${buffer}\n\n`).events.forEach(options.onEvent)
}

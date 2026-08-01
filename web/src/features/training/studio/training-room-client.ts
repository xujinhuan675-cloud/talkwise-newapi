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

export type TrainingRoomSender = 'persona' | 'system' | 'user'

export interface TrainingRoomMessage {
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

interface TalkWiseResponse<T> {
  code: number
  data: T | null
  message: string
}

const VIDEO_ANSWER_MARKER = '[video-answer]'
const ROOM_PROXY_BASE = '/api/talkwise/conversations'

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

function senderType(value: unknown): TrainingRoomSender {
  if (value === 'user' || value === 'persona' || value === 'system') {
    return value
  }
  return 'system'
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

    return [
      {
        content: parsedContent.caption,
        emotionLabel: textValue(message.emotion_label),
        emotionScore,
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

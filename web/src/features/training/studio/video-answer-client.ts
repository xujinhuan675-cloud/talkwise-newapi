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

export const DEFAULT_VIDEO_ANSWER_API_BASE = '/api/talkwise/training'
export const VIDEO_ANSWER_CONVERSATION_API_BASE = '/api/talkwise/conversations'
export const VIDEO_ANSWER_MARKER = '[video-answer]'
export const VIDEO_ANSWER_MAX_BYTES = 100 * 1024 * 1024
export const VIDEO_ANSWER_MAX_CAPTION_LENGTH = 2000
export const VIDEO_ANSWER_MAX_DURATION_MS = 4 * 60 * 60 * 1000

export type VideoAnswerFeedbackMode = 'assisted' | 'drill' | 'simulation'

export interface VideoAnswerBinding {
  readonly roomId: string
  readonly trainingSessionId: string
}

export interface RecordedVideoAnswer {
  readonly blob: Blob
  readonly durationMs: number
  readonly mimeType: string
  readonly recordedAt: string
}

export interface VideoAnswerTrainingEvent {
  readonly cameraPresenceStatus: 'placeholder'
  readonly feedbackMode: VideoAnswerFeedbackMode
  readonly reportDimensions: readonly ['content_delivery', 'camera_presence']
  readonly schemaVersion: 1
  readonly trainingFeedbackMode: VideoAnswerFeedbackMode
  readonly trainingMode: 'video'
  readonly type: 'video_answer_submitted'
}

export interface VideoAnswerAttachment {
  readonly durationMs: number
  readonly mimeType: string
  readonly recordedAt: string
  readonly size: number
  readonly title: string
  readonly trainingEvent: VideoAnswerTrainingEvent
  readonly type: 'video'
  readonly url: string
}

export interface UploadedVideoAnswer extends VideoAnswerAttachment {
  readonly filename: string
  readonly replayUrl: string
}

export interface PersistedVideoAnswerMessage {
  readonly content: string
  readonly id: number
  readonly metadata: Readonly<Record<string, unknown>>
  readonly roomId: number
}

export interface VideoAnswerMessagePayload {
  readonly content: string
  readonly metadata: Readonly<Record<string, unknown>>
}

interface VideoAnswerClientDependencies {
  readonly fetcher?: typeof fetch
  readonly getAuthHeaders?: () => Promise<Record<string, string>>
}

interface VideoAnswerUploadInput extends VideoAnswerBinding {
  readonly apiBase?: string
  readonly feedbackMode: VideoAnswerFeedbackMode
  readonly filename?: string
  readonly recording: RecordedVideoAnswer
}

interface VideoAnswerMessageInput extends VideoAnswerBinding {
  readonly apiBase?: string
  readonly attachment: UploadedVideoAnswer
  readonly caption?: string
  readonly feedbackMode: VideoAnswerFeedbackMode
}

type JsonRecord = Record<string, unknown>

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

function integerValue(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function normalizedSessionId(value: string): string {
  const sessionId = value.trim()
  if (!sessionId || sessionId.length > 120) {
    throw new Error('training session id must contain 1 to 120 characters')
  }
  return sessionId
}

function normalizedRoomId(value: string): string {
  const roomId = value.trim()
  if (!/^[1-9]\d*$/.test(roomId) || !Number.isSafeInteger(Number(roomId))) {
    throw new Error('room id must be a positive integer')
  }
  return roomId
}

function normalizedApiBase(
  value: string | undefined,
  fallback: string
): string {
  const candidate = value?.trim() || fallback
  if (
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    candidate.includes('?') ||
    candidate.includes('#')
  ) {
    throw new Error('TalkWise media API must use a same-origin path')
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(candidate)
  } catch {
    throw new Error('TalkWise media API path is invalid')
  }
  if (
    decoded.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('TalkWise media API path is invalid')
  }
  return candidate.replace(/\/+$/, '') || fallback
}

function normalizedMimeType(value: string): string {
  const mimeType = value.split(';', 1)[0]?.trim().toLowerCase() || ''
  if (!mimeType.startsWith('video/') || mimeType.length > 100) {
    throw new Error('recording must use a supported video MIME type')
  }
  return mimeType
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === 'video/mp4') return '.mp4'
  if (mimeType === 'video/ogg') return '.ogv'
  if (mimeType === 'video/quicktime') return '.mov'
  return '.webm'
}

function normalizedFilename(value: string): string {
  const filename = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(filename)) {
    throw new Error('video answer filename is invalid')
  }
  return filename
}

function normalizedRecordedAt(value: string): string {
  const recordedAt = value.trim()
  if (
    !recordedAt ||
    recordedAt.length > 64 ||
    !Number.isFinite(Date.parse(recordedAt))
  ) {
    throw new Error('video answer recordedAt must be an ISO timestamp')
  }
  return recordedAt
}

function normalizedDuration(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > VIDEO_ANSWER_MAX_DURATION_MS
  ) {
    throw new Error('video answer duration is outside the supported range')
  }
  return value
}

function normalizedSize(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > VIDEO_ANSWER_MAX_BYTES
  ) {
    throw new Error('video answer size is outside the supported range')
  }
  return value
}

function responseData(value: unknown): unknown {
  const root = recordValue(value)
  return root && 'data' in root ? root.data : value
}

function nestedErrorText(value: unknown, depth = 0): string | null {
  if (depth > 3) return null
  const direct = textValue(value)
  if (direct) return direct.slice(0, 500)
  const record = recordValue(value)
  if (!record) return null
  for (const key of ['detail', 'message', 'error', 'details']) {
    const message = nestedErrorText(record[key], depth + 1)
    if (message) return message
  }
  return null
}

export function videoAnswerErrorMessage(
  value: unknown,
  status: number,
  fallback: string
): string {
  const message = nestedErrorText(value)
  return message
    ? `${fallback}: ${status} - ${message}`
    : `${fallback}: ${status}`
}

async function responseError(
  response: Response,
  fallback: string
): Promise<Error> {
  const payload = await response.json().catch(() => null)
  return new Error(videoAnswerErrorMessage(payload, response.status, fallback))
}

async function authenticatedFetch(
  path: string,
  init: RequestInit,
  dependencies: VideoAnswerClientDependencies
): Promise<Response> {
  const getAuthHeaders = dependencies.getAuthHeaders ?? getFreshAuthHeaders
  const authHeaders = await getAuthHeaders()
  const headers = new Headers(authHeaders)
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return (dependencies.fetcher ?? fetch)(path, {
    ...init,
    credentials: 'include',
    headers,
  })
}

export function buildVideoAnswerUploadUrl(
  apiBase: string | undefined,
  binding: VideoAnswerBinding
): string {
  const base = normalizedApiBase(apiBase, DEFAULT_VIDEO_ANSWER_API_BASE)
  const params = new URLSearchParams({
    training_session_id: normalizedSessionId(binding.trainingSessionId),
    room_id: normalizedRoomId(binding.roomId),
  })
  return `${base}/video-answers?${params.toString()}`
}

export function buildVideoAnswerReplayUrl(
  apiBase: string | undefined,
  binding: VideoAnswerBinding,
  filename: string
): string {
  const base = normalizedApiBase(apiBase, DEFAULT_VIDEO_ANSWER_API_BASE)
  const params = new URLSearchParams({
    training_session_id: normalizedSessionId(binding.trainingSessionId),
    room_id: normalizedRoomId(binding.roomId),
  })
  return `${base}/video-answers/${encodeURIComponent(normalizedFilename(filename))}?${params.toString()}`
}

export function buildVideoAnswerMessageUrl(
  binding: VideoAnswerBinding,
  conversationApiBase = VIDEO_ANSWER_CONVERSATION_API_BASE
): string {
  const base = normalizedApiBase(
    conversationApiBase,
    VIDEO_ANSWER_CONVERSATION_API_BASE
  )
  const params = new URLSearchParams({
    trainingSessionId: normalizedSessionId(binding.trainingSessionId),
  })
  return `${base}/rooms/${normalizedRoomId(binding.roomId)}/messages?${params.toString()}`
}

function assertUpstreamReplayBinding(
  value: unknown,
  binding: VideoAnswerBinding,
  filename: string
): void {
  const rawUrl = textValue(value)
  if (!rawUrl || rawUrl.startsWith('//')) {
    throw new Error('video upload response did not include a safe replay URL')
  }
  let parsed: URL
  try {
    parsed = new URL(rawUrl, 'https://talkwise.invalid')
  } catch {
    throw new Error('video upload response included an invalid replay URL')
  }
  if (parsed.origin !== 'https://talkwise.invalid') {
    throw new Error('video upload response included a cross-origin replay URL')
  }
  const returnedFilename = decodeURIComponent(
    parsed.pathname.split('/').at(-1) || ''
  )
  if (
    returnedFilename !== filename ||
    parsed.searchParams.get('training_session_id') !==
      normalizedSessionId(binding.trainingSessionId) ||
    parsed.searchParams.get('room_id') !== normalizedRoomId(binding.roomId)
  ) {
    throw new Error('video upload response did not match the active session')
  }
}

export async function uploadVideoAnswer(
  input: VideoAnswerUploadInput,
  dependencies: VideoAnswerClientDependencies = {}
): Promise<UploadedVideoAnswer> {
  const mimeType = normalizedMimeType(
    input.recording.blob.type || input.recording.mimeType
  )
  const size = normalizedSize(input.recording.blob.size)
  const durationMs = normalizedDuration(input.recording.durationMs)
  const recordedAt = normalizedRecordedAt(input.recording.recordedAt)
  const filename = normalizedFilename(
    input.filename ||
      `video-answer-${Date.now()}${extensionForMimeType(mimeType)}`
  )
  const response = await authenticatedFetch(
    buildVideoAnswerUploadUrl(input.apiBase, input),
    {
      body: input.recording.blob,
      headers: {
        Accept: 'application/json',
        'Content-Type': mimeType,
        'X-Filename': filename,
      },
      method: 'POST',
    },
    dependencies
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to upload video answer')
  }

  const data = recordValue(responseData(await response.json()))
  const storedFilename = normalizedFilename(textValue(data?.filename) || '')
  const storedMimeType = normalizedMimeType(textValue(data?.mimeType) || '')
  const storedSize = normalizedSize(integerValue(data?.size) ?? -1)
  if (storedMimeType !== mimeType || storedSize !== size) {
    throw new Error('video upload response did not match the recorded media')
  }
  assertUpstreamReplayBinding(data?.url, input, storedFilename)
  const replayUrl = buildVideoAnswerReplayUrl(
    input.apiBase,
    input,
    storedFilename
  )
  const trainingEvent: VideoAnswerTrainingEvent = {
    cameraPresenceStatus: 'placeholder',
    feedbackMode: input.feedbackMode,
    reportDimensions: ['content_delivery', 'camera_presence'],
    schemaVersion: 1,
    trainingFeedbackMode: input.feedbackMode,
    trainingMode: 'video',
    type: 'video_answer_submitted',
  }

  return {
    durationMs,
    filename: storedFilename,
    mimeType: storedMimeType,
    recordedAt,
    replayUrl,
    size: storedSize,
    title: 'Video answer',
    trainingEvent,
    type: 'video',
    url: replayUrl,
  }
}

export function buildVideoAnswerMessagePayload(
  input: VideoAnswerMessageInput
): VideoAnswerMessagePayload {
  const caption = (input.caption?.trim() || 'Video answer').slice(
    0,
    VIDEO_ANSWER_MAX_CAPTION_LENGTH + 1
  )
  if (caption.length > VIDEO_ANSWER_MAX_CAPTION_LENGTH) {
    throw new Error(
      `video answer caption cannot exceed ${VIDEO_ANSWER_MAX_CAPTION_LENGTH} characters`
    )
  }
  const trainingSessionId = normalizedSessionId(input.trainingSessionId)
  const roomId = normalizedRoomId(input.roomId)
  const filename = normalizedFilename(input.attachment.filename)
  const replayUrl = buildVideoAnswerReplayUrl(input.apiBase, input, filename)
  if (
    input.attachment.replayUrl !== replayUrl ||
    input.attachment.url !== replayUrl
  ) {
    throw new Error('video answer attachment is outside the active session')
  }
  const trainingEvent: VideoAnswerTrainingEvent = {
    cameraPresenceStatus: 'placeholder',
    feedbackMode: input.feedbackMode,
    reportDimensions: ['content_delivery', 'camera_presence'],
    schemaVersion: 1,
    trainingFeedbackMode: input.feedbackMode,
    trainingMode: 'video',
    type: 'video_answer_submitted',
  }
  const attachment: VideoAnswerAttachment = {
    durationMs: normalizedDuration(input.attachment.durationMs),
    mimeType: normalizedMimeType(input.attachment.mimeType),
    recordedAt: normalizedRecordedAt(input.attachment.recordedAt),
    size: normalizedSize(input.attachment.size),
    title: (input.attachment.title.trim() || 'Video answer').slice(0, 100),
    trainingEvent,
    type: 'video',
    url: replayUrl,
  }
  const content = `${caption}\n\n${VIDEO_ANSWER_MARKER}${JSON.stringify(attachment)}`
  if (content.length > 10000) {
    throw new Error('video answer message exceeds the server content limit')
  }

  return {
    content,
    metadata: {
      attachment,
      clientRequestId: `video-answer:${roomId}:${filename}`,
      interactionMode: 'turn_based',
      source: 'video_answer',
      trainingEvent,
      trainingMode: 'video',
      trainingSessionId,
    },
  }
}

export async function persistVideoAnswerMessage(
  input: VideoAnswerMessageInput,
  dependencies: VideoAnswerClientDependencies = {}
): Promise<PersistedVideoAnswerMessage> {
  const payload = buildVideoAnswerMessagePayload(input)
  const response = await authenticatedFetch(
    buildVideoAnswerMessageUrl(input),
    {
      body: JSON.stringify(payload),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
    dependencies
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to save video answer')
  }

  const data = recordValue(responseData(await response.json()))
  const id = integerValue(data?.id)
  const roomId = integerValue(data?.room_id ?? data?.roomId)
  const content = textValue(data?.content)
  if (
    id === null ||
    id <= 0 ||
    roomId !== Number(normalizedRoomId(input.roomId)) ||
    !content?.includes(VIDEO_ANSWER_MARKER)
  ) {
    throw new Error(
      'Unable to save video answer: response did not confirm message persistence'
    )
  }

  return {
    content,
    id,
    metadata: recordValue(data?.metadata) ?? {},
    roomId,
  }
}

export async function loadVideoAnswerReplay(
  attachment: UploadedVideoAnswer,
  binding: VideoAnswerBinding,
  apiBase?: string,
  dependencies: VideoAnswerClientDependencies = {}
): Promise<Blob> {
  const expectedUrl = buildVideoAnswerReplayUrl(
    apiBase,
    binding,
    attachment.filename
  )
  if (attachment.replayUrl !== expectedUrl) {
    throw new Error(
      'video answer replay URL is outside the authenticated proxy'
    )
  }
  const response = await authenticatedFetch(
    attachment.replayUrl,
    { headers: { Accept: attachment.mimeType }, method: 'GET' },
    dependencies
  )
  if (!response.ok) {
    throw await responseError(response, 'Unable to load saved video answer')
  }
  const blob = await response.blob()
  normalizedMimeType(blob.type || response.headers.get('content-type') || '')
  normalizedSize(blob.size)
  return blob
}

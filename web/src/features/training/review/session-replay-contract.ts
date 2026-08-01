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
import type {
  TrainingRoomMessage,
  TrainingRoomVideoAnswer,
} from '../studio/training-room-client'

const TRAINING_GUIDANCE_SOURCE = 'training_live_guidance'
const VIDEO_REPLAY_PATH_PREFIX = '/api/talkwise/training/video-answers/'
const LEGACY_VIDEO_REPLAY_PATH_PREFIX = '/api/v1/training-studio/video-answers/'
const VIDEO_REPLAY_QUERY_KEYS = new Set(['room_id', 'training_session_id'])

export interface ReviewEmotionPoint {
  readonly emotionLabel: string | null
  readonly messageId: string
  readonly score: number
  readonly senderId: string
  readonly sequence: number
  readonly timestamp: string | null
}

export interface ReviewEmotionSeries {
  readonly dataKey: string
  readonly points: ReviewEmotionPoint[]
  readonly senderId: string
}

export interface ReviewEmotionChartRow {
  readonly emotionLabel: string | null
  readonly messageId: string
  readonly sequence: number
  readonly timestamp: string | null
  [dataKey: string]: number | string | null
}

export interface ReviewEmotionChart {
  readonly rows: ReviewEmotionChartRow[]
  readonly series: ReviewEmotionSeries[]
}

export interface ReviewReplayBinding {
  readonly roomId: string
  readonly sessionId: string
}

function isGuidanceMessage(message: TrainingRoomMessage): boolean {
  return message.metadata.source === TRAINING_GUIDANCE_SOURCE
}

export function isNumericReviewRoomId(value: string | null | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return false
  return Number.isSafeInteger(Number(value))
}

export function reviewReplayMessages(
  messages: readonly TrainingRoomMessage[]
): TrainingRoomMessage[] {
  return messages.filter((message) => !isGuidanceMessage(message))
}

export function reviewEmotionPoints(
  messages: readonly TrainingRoomMessage[]
): ReviewEmotionPoint[] {
  return reviewReplayMessages(messages).flatMap((message, index) => {
    if (
      message.senderType !== 'persona' ||
      message.emotionScore === null ||
      message.emotionScore < -5 ||
      message.emotionScore > 5
    ) {
      return []
    }
    return [
      {
        emotionLabel: message.emotionLabel,
        messageId: message.id,
        score: message.emotionScore,
        senderId: message.senderId,
        sequence: index + 1,
        timestamp: message.timestamp,
      },
    ]
  })
}

export function buildReviewEmotionChart(
  messages: readonly TrainingRoomMessage[]
): ReviewEmotionChart {
  const points = reviewEmotionPoints(messages)
  const senderIds = [...new Set(points.map((point) => point.senderId))]
  const series = senderIds.map((senderId, index) => ({
    dataKey: `persona_${index + 1}`,
    points: points.filter((point) => point.senderId === senderId),
    senderId,
  }))
  const seriesBySender = new Map(
    series.map((item) => [item.senderId, item.dataKey])
  )
  const rows = points.map((point) => {
    const row: ReviewEmotionChartRow = {
      emotionLabel: point.emotionLabel,
      messageId: point.messageId,
      sequence: point.sequence,
      timestamp: point.timestamp,
    }
    const dataKey = seriesBySender.get(point.senderId)
    if (dataKey) row[dataKey] = point.score
    return row
  })
  return { rows, series }
}

function safeVideoFilename(pathname: string): string | null {
  let prefix: string | null = null
  if (pathname.startsWith(VIDEO_REPLAY_PATH_PREFIX)) {
    prefix = VIDEO_REPLAY_PATH_PREFIX
  } else if (pathname.startsWith(LEGACY_VIDEO_REPLAY_PATH_PREFIX)) {
    prefix = LEGACY_VIDEO_REPLAY_PATH_PREFIX
  }
  if (!prefix) return null
  const encoded = pathname.slice(prefix.length)
  if (!encoded || encoded.includes('/')) return null
  let filename: string
  try {
    filename = decodeURIComponent(encoded)
  } catch {
    return null
  }
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(filename) ? filename : null
}

export function reviewVideoReplayUrl(
  attachment: TrainingRoomVideoAnswer | null,
  binding: ReviewReplayBinding
): string | null {
  if (
    !attachment?.url ||
    !attachment.url.startsWith('/') ||
    attachment.url.startsWith('//') ||
    !isNumericReviewRoomId(binding.roomId)
  ) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(attachment.url, 'https://talkwise.invalid')
  } catch {
    return null
  }
  if (
    parsed.origin !== 'https://talkwise.invalid' ||
    !safeVideoFilename(parsed.pathname) ||
    parsed.searchParams.get('training_session_id') !== binding.sessionId ||
    parsed.searchParams.get('room_id') !== binding.roomId ||
    [...parsed.searchParams.keys()].length !== VIDEO_REPLAY_QUERY_KEYS.size ||
    [...parsed.searchParams.keys()].some(
      (key) => !VIDEO_REPLAY_QUERY_KEYS.has(key)
    )
  ) {
    return null
  }
  const filename = safeVideoFilename(parsed.pathname)
  const encodedFilename = filename ? encodeURIComponent(filename) : null
  if (!encodedFilename) return null
  return `${VIDEO_REPLAY_PATH_PREFIX}${encodedFilename}?${parsed.searchParams.toString()}`
}

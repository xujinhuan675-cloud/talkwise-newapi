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

import { sniffVoiceAudioMimeType } from './voice-audio'

export type RealtimeProfile = 'cascade' | 'speech_to_speech'

export type RealtimeTrainingStatus =
  | 'closed'
  | 'connecting'
  | 'error'
  | 'idle'
  | 'listening'
  | 'preparing'
  | 'processing'
  | 'speaking'

export interface RealtimeAudioContract {
  channels: 1
  inputSampleRate: number
  latencyProfile: 'near_realtime' | 'true_realtime'
  outputSampleRate: number
  profile: RealtimeProfile
}

export interface RealtimeServerEvent {
  createdAt?: string
  payload?: Record<string, unknown>
  sessionId?: string
  status?: RealtimeTrainingStatus
  type: string
}

/**
 * A client-initiated audio commit is only safe to close after the server has
 * acknowledged the commit and persisted the resulting transcript. The output
 * stream may finish before either event, so audio completion is not a commit
 * settlement signal by itself.
 */
export function realtimeCommitTranscriptSettled(input: {
  commitAcknowledged: boolean
  transcriptPersisted: boolean
}): boolean {
  return input.commitAcknowledged && input.transcriptPersisted
}

const AUTH_PROTOCOL_PREFIX = 'talkwise.bearer.'
const SESSION_AUTH_ERROR_CODES = new Set([
  'AUTH_SESSION_REVOKED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_UNAUTHORIZED',
  'AUTH_USER_DISABLED',
  'AUTH_USER_INVALID',
  'TALKWISE_SESSION_AUTHENTICATION_FAILED',
])

export const TALKWISE_REALTIME_PROTOCOL = 'talkwise.realtime'

export function realtimeAudioContract(
  profile: RealtimeProfile,
  provider?: string
): RealtimeAudioContract {
  if (provider?.trim() === 'volcengine.doubao_realtime') {
    return {
      channels: 1,
      inputSampleRate: 16000,
      latencyProfile: 'true_realtime',
      outputSampleRate: 24000,
      profile,
    }
  }
  if (profile === 'speech_to_speech') {
    return {
      channels: 1,
      inputSampleRate: 24000,
      latencyProfile: 'true_realtime',
      outputSampleRate: 24000,
      profile,
    }
  }

  return {
    channels: 1,
    inputSampleRate: 16000,
    latencyProfile: 'near_realtime',
    outputSampleRate: 24000,
    profile,
  }
}

export function talkWiseBearerProtocol(accessToken: string): string {
  const token = accessToken.trim()
  if (!token) throw new Error('An authenticated session is required.')
  if (!/^[A-Za-z0-9._~-]+$/.test(token)) {
    throw new Error(
      'The current access token cannot be used for realtime training.'
    )
  }
  return `${AUTH_PROTOCOL_PREFIX}${token}`
}

export function trainingRealtimeWebSocketUrl(
  apiBase: string,
  input: {
    profile: RealtimeProfile
    provider?: string
    roomId: string
    sessionId: string
  },
  location: Pick<Location, 'host' | 'protocol'> = window.location
): string {
  let normalizedBase =
    apiBase.trim().replace(/\/+$/, '') || '/api/talkwise/training'
  if (/^https?:\/\//i.test(normalizedBase)) {
    const configuredUrl = new URL(normalizedBase)
    if (configuredUrl.host !== location.host) {
      throw new Error(
        'Realtime training requires the same-origin training proxy.'
      )
    }
    normalizedBase = configuredUrl.pathname.replace(/\/+$/, '')
  }
  const path = `${normalizedBase}/realtime`
  const params = new URLSearchParams({
    input_sample_rate: String(
      realtimeAudioContract(input.profile, input.provider).inputSampleRate
    ),
    profile: input.profile,
    provider: input.provider?.trim() || 'configured',
    room_id: input.roomId,
    session_id: input.sessionId,
  })
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}${path}?${params.toString()}`
}

export function decodeRealtimeServerEvent(
  value: unknown
): RealtimeServerEvent | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const event = parsed as Record<string, unknown>
    if (typeof event.type !== 'string' || !event.type.trim()) return null
    return event as unknown as RealtimeServerEvent
  } catch {
    return null
  }
}

function eventRecords(event: RealtimeServerEvent): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [
    event as unknown as Record<string, unknown>,
  ]
  if (event.payload && typeof event.payload === 'object') {
    records.push(event.payload)
  }
  return records
}

export function realtimeEventText(event: RealtimeServerEvent): string | null {
  for (const record of eventRecords(event)) {
    for (const key of ['text', 'transcript', 'message', 'delta']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}

export type RealtimeTranscriptPreviewAction =
  | { type: 'clear' }
  | { text: string; type: 'update' }
  | { type: 'ignore' }

/**
 * Transcript deltas are display-only. They update one provisional bubble;
 * persistence remains server-owned and is acknowledged separately.
 */
export function realtimeTranscriptPreviewAction(
  event: RealtimeServerEvent
): RealtimeTranscriptPreviewAction {
  if (event.type === 'transcript.persisted') return { type: 'clear' }
  if (event.type !== 'transcript.delta') return { type: 'ignore' }
  const text = realtimeEventText(event)
  return text ? { text, type: 'update' } : { type: 'ignore' }
}

export function realtimeEventError(
  event: RealtimeServerEvent,
  localize?: (english: string, chinese: string) => string
): string | null {
  if (event.type !== 'error') return null
  for (const record of eventRecords(event)) {
    const code = String(record.sourceCode || record.code || '')
      .trim()
      .toUpperCase()
    const category = String(record.errorCategory || record.error_category || '')
      .trim()
      .toLowerCase()
    if (
      code === 'DOUBAO_VOICE_TRANSCRIPT_EMPTY' ||
      code === 'REALTIME_INPUT_AUDIO_UNRECOGNIZED' ||
      category === 'input_audio'
    ) {
      const english =
        'No clear speech was recognized. Move closer to the microphone and try again.'
      return localize
        ? localize(english, '没有识别到清晰语音，请靠近麦克风后重试。')
        : english
    }
    if (category === 'authentication') {
      const english =
        'Realtime speech authentication failed. Check the voice service configuration and try again.'
      return localize
        ? localize(english, '实时语音服务认证失败，请检查语音服务配置后重试。')
        : english
    }
    if (category === 'rate_limit') {
      const english =
        'Realtime speech requests are too frequent. Wait a moment and try again.'
      return localize
        ? localize(english, '实时语音请求过于频繁，请稍后重试。')
        : english
    }
    if (category === 'provider_unavailable') {
      const english =
        'The realtime speech service is temporarily unavailable. Try again shortly.'
      return localize
        ? localize(english, '实时语音服务暂时不可用，请稍后重试。')
        : english
    }
    if (category === 'bad_request') {
      const english =
        'The realtime speech request is invalid. Check the voice route configuration.'
      return localize
        ? localize(english, '实时语音请求配置无效，请检查语音路由配置。')
        : english
    }
    if (category === 'protocol_desync' || code === 'REALTIME_TURN_DESYNC') {
      const english =
        'The realtime speech turn became inconsistent. Restart realtime voice and try again.'
      return localize
        ? localize(english, '实时语音回合状态异常，请重新开始实时语音。')
        : english
    }
    if (
      category === 'provider_error' ||
      code.startsWith('PIPECAT_') ||
      code === 'REALTIME_EVENT_PUMP_FAILED'
    ) {
      const english =
        'Realtime speech processing failed. Restart realtime voice and try again.'
      return localize
        ? localize(english, '实时语音处理失败，请重新开始实时语音后重试。')
        : english
    }
  }
  return realtimeEventText(event) || 'Realtime training failed.'
}

export function isTalkWiseSessionAuthCode(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    SESSION_AUTH_ERROR_CODES.has(value.trim().toUpperCase())
  )
}

export function realtimeEventNeedsAuthRefresh(
  event: RealtimeServerEvent
): boolean {
  if (event.type !== 'error') return false
  for (const record of eventRecords(event)) {
    if (
      isTalkWiseSessionAuthCode(record.code) ||
      isTalkWiseSessionAuthCode(record.sourceCode)
    ) {
      return true
    }
    const metadata = record.metadata
    if (
      metadata &&
      typeof metadata === 'object' &&
      !Array.isArray(metadata) &&
      (isTalkWiseSessionAuthCode((metadata as Record<string, unknown>).code) ||
        isTalkWiseSessionAuthCode(
          (metadata as Record<string, unknown>).sourceCode
        ))
    ) {
      return true
    }
  }
  return false
}

export function realtimeAuthRenewalDelayMs(
  accessExpiresAt: number | null | undefined,
  nowMilliseconds = Date.now()
): number | null {
  if (!accessExpiresAt || !Number.isFinite(accessExpiresAt)) return null
  return Math.max(1000, accessExpiresAt * 1000 - nowMilliseconds - 60_000)
}

export function realtimeEventAudio(event: RealtimeServerEvent): {
  bytes: Uint8Array
  channels: number
  mimeType: string
  sampleRate: number
} | null {
  if (event.type !== 'audio.output') return null
  for (const record of eventRecords(event)) {
    const encoded = record.audio ?? record.audioData ?? record.data
    if (typeof encoded !== 'string' || !encoded.trim()) continue
    try {
      const encodedPayload = encoded.includes(',')
        ? (encoded.split(',').pop() ?? '')
        : encoded
      const binary = globalThis.atob(encodedPayload)
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0)
      )
      let mimeType = 'audio/pcm'
      if (typeof record.mimeType === 'string') mimeType = record.mimeType
      else if (typeof record.mime_type === 'string') mimeType = record.mime_type
      let sampleRate = 24000
      if (typeof record.sampleRate === 'number') sampleRate = record.sampleRate
      else if (typeof record.sample_rate === 'number') {
        sampleRate = record.sample_rate
      }
      return {
        bytes,
        channels:
          typeof record.channels === 'number'
            ? Math.max(1, record.channels)
            : 1,
        mimeType: sniffVoiceAudioMimeType(bytes, mimeType),
        sampleRate,
      }
    } catch {
      return null
    }
  }
  return null
}

export function downsamplePcm16(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Int16Array {
  if (outputSampleRate <= 0 || inputSampleRate <= 0) return new Int16Array()
  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Int16Array(outputLength)

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio)
    const end = Math.max(start + 1, Math.floor((outputIndex + 1) * ratio))
    let sum = 0
    let count = 0
    for (
      let inputIndex = start;
      inputIndex < end && inputIndex < input.length;
      inputIndex += 1
    ) {
      sum += input[inputIndex]
      count += 1
    }
    const sample = Math.max(-1, Math.min(1, count ? sum / count : 0))
    output[outputIndex] =
      sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff)
  }

  return output
}

export function pcm16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength
  )
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return globalThis.btoa(binary)
}

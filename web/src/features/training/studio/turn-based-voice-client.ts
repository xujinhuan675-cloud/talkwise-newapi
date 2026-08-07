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
import { talkWiseBearerProtocol } from './realtime-client'

export const TALKWISE_TURN_BASED_VOICE_PROTOCOL = 'talkwise.voice'
export const TURN_BASED_VOICE_SAMPLE_RATE = 16_000
export const TURN_BASED_VOICE_FORMAT = 'wav'
export const TURN_BASED_VOICE_MIME_TYPE = 'audio/wav'
export const TURN_BASED_VOICE_CHUNK_BYTES = 48 * 1024

export type TurnBasedVoiceStatus =
  | 'connecting'
  | 'encoding'
  | 'error'
  | 'idle'
  | 'persisted'
  | 'recording'
  | 'requesting_permission'
  | 'transcribing'

export function isTurnBasedVoiceInputActive(
  status: TurnBasedVoiceStatus
): boolean {
  return !['error', 'idle', 'persisted'].includes(status)
}

export interface TurnBasedVoiceServerEvent {
  code?: string
  details?: string
  is_final?: boolean
  message?: unknown
  text?: string
  type: string
}

export interface PersistedVoiceMessage {
  content: string | null
  id: number | string | null
}

export function abortTurnBasedVoiceRecorder(
  recorder: MediaRecorder | null
): void {
  if (!recorder) return
  recorder.ondataavailable = null
  recorder.onstop = null
  if (recorder.state === 'inactive') return
  try {
    recorder.stop()
  } catch {
    // The browser may finish the recorder between the state check and stop.
  }
}

interface VoiceLocation {
  host: string
  protocol: string
}

export interface TurnBasedVoiceBinding {
  roomId: string
  sessionId: string
}

interface VoiceAudioChunkFrame {
  data: string
  type: 'audio_chunk'
}

interface VoiceSpeechEndFrame {
  format: 'wav'
  metadata: {
    interactionMode: 'turn_based'
    llm?: {
      model: string
    }
    media: {
      channels: 1
      mimeType: 'audio/wav'
      sampleRate: 16000
    }
    modality: 'voice'
    source: 'voice_transcription'
    trainingMode: 'voice'
    trainingVoiceId?: string
    trainingVoiceSpeed?: number
    trainingVoiceLoudness?: number
    trainingVoiceEmotion?: string
    trainingVoiceEmotionScale?: number
    trainingVoiceStyle?: string
  }
  type: 'speech_end'
}

export type TurnBasedVoiceClientFrame =
  | VoiceAudioChunkFrame
  | VoiceSpeechEndFrame

export interface TurnBasedVoiceFrameOptions {
  llmModel?: string
  voiceMetadata?: Readonly<Record<string, unknown>>
}

export function turnBasedVoiceProtocols(accessToken: string): string[] {
  return [
    TALKWISE_TURN_BASED_VOICE_PROTOCOL,
    talkWiseBearerProtocol(accessToken),
  ]
}

export function trainingTurnBasedVoiceWebSocketUrl(
  apiBase: string,
  binding: TurnBasedVoiceBinding,
  location: VoiceLocation = window.location
): string {
  const roomId = requireNumericRoomId(binding.roomId)
  const sessionId = binding.sessionId.trim()
  if (!sessionId || sessionId.length > 200) {
    throw new Error('A valid training session binding is required.')
  }

  let trainingPath =
    apiBase.trim().replace(/\/+$/, '') || '/api/talkwise/training'
  if (/^https?:\/\//i.test(trainingPath)) {
    const configuredUrl = new URL(trainingPath)
    if (
      configuredUrl.host !== location.host ||
      configuredUrl.protocol !== location.protocol
    ) {
      throw new Error('Voice training requires the same-origin training proxy.')
    }
    if (configuredUrl.search || configuredUrl.hash) {
      throw new Error(
        'The training proxy URL must not contain query or hash data.'
      )
    }
    trainingPath = configuredUrl.pathname.replace(/\/+$/, '')
  }
  if (
    !trainingPath.startsWith('/') ||
    trainingPath.startsWith('//') ||
    trainingPath.includes('\\') ||
    trainingPath.includes('?') ||
    trainingPath.includes('#') ||
    trainingPath
      .split('/')
      .some((segment) => segment === '.' || segment === '..') ||
    !trainingPath.endsWith('/training')
  ) {
    throw new Error('The configured training proxy path is invalid.')
  }

  const proxyRoot = trainingPath.slice(0, -'/training'.length)
  const path = `${proxyRoot}/conversations/rooms/${roomId}/voice`
  const params = new URLSearchParams({ trainingSessionId: sessionId })
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${location.host}${path}?${params.toString()}`
}

export function decodeTurnBasedVoiceServerEvent(
  value: unknown
): TurnBasedVoiceServerEvent | null {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const event = parsed as Record<string, unknown>
    if (typeof event.type !== 'string' || !event.type.trim()) return null
    return event as unknown as TurnBasedVoiceServerEvent
  } catch {
    return null
  }
}

export function finalVoiceTranscript(
  event: TurnBasedVoiceServerEvent
): string | null {
  if (event.type !== 'transcription' || event.is_final !== true) return null
  return typeof event.text === 'string' ? event.text.trim() : null
}

export function persistedVoiceMessage(
  event: TurnBasedVoiceServerEvent
): PersistedVoiceMessage | null {
  if (
    event.type !== 'message_sent' ||
    !event.message ||
    typeof event.message !== 'object' ||
    Array.isArray(event.message)
  ) {
    return null
  }
  const message = event.message as Record<string, unknown>
  const id =
    typeof message.id === 'string' || typeof message.id === 'number'
      ? message.id
      : null
  const content =
    typeof message.content === 'string' && message.content.trim()
      ? message.content.trim()
      : null
  if (id === null && content === null) return null
  return { content, id }
}

export function voiceServerError(
  event: TurnBasedVoiceServerEvent
): { code: string | null; message: string | null } | null {
  if (event.type !== 'error') return null
  return {
    code: typeof event.code === 'string' ? event.code : null,
    message: typeof event.message === 'string' ? event.message.trim() : null,
  }
}

export function buildTurnBasedVoiceFrames(
  wavBytes: Uint8Array,
  maxChunkBytes = TURN_BASED_VOICE_CHUNK_BYTES,
  options: TurnBasedVoiceFrameOptions = {}
): TurnBasedVoiceClientFrame[] {
  if (!Number.isSafeInteger(maxChunkBytes) || maxChunkBytes <= 0) {
    throw new Error('Voice chunk size must be a positive integer.')
  }
  if (!wavBytes.byteLength) {
    throw new Error('No audio data was recorded.')
  }

  const llmModel = options.llmModel?.trim()
  const frames: TurnBasedVoiceClientFrame[] = []
  for (let offset = 0; offset < wavBytes.length; offset += maxChunkBytes) {
    frames.push({
      data: bytesToBase64(wavBytes.subarray(offset, offset + maxChunkBytes)),
      type: 'audio_chunk',
    })
  }
  const voiceMetadata = options.voiceMetadata ?? {}
  const trainingVoiceFields = Object.fromEntries(
    [
      'trainingVoiceId',
      'trainingVoiceSpeed',
      'trainingVoiceLoudness',
      'trainingVoiceEmotion',
      'trainingVoiceEmotionScale',
      'trainingVoiceStyle',
    ].flatMap((key) =>
      voiceMetadata[key] === undefined || voiceMetadata[key] === null
        ? []
        : [[key, voiceMetadata[key]]]
    )
  )
  frames.push({
    format: TURN_BASED_VOICE_FORMAT,
    metadata: {
      interactionMode: 'turn_based',
      ...(llmModel ? { llm: { model: llmModel } } : {}),
      media: {
        channels: 1,
        mimeType: TURN_BASED_VOICE_MIME_TYPE,
        sampleRate: TURN_BASED_VOICE_SAMPLE_RATE,
      },
      modality: 'voice',
      source: 'voice_transcription',
      trainingMode: 'voice',
      ...trainingVoiceFields,
    },
    type: 'speech_end',
  })
  return frames
}

export function downmixAndResampleVoiceAudio(
  channels: readonly Float32Array[],
  sourceSampleRate: number,
  targetSampleRate = TURN_BASED_VOICE_SAMPLE_RATE
): Float32Array {
  if (
    !channels.length ||
    !Number.isFinite(sourceSampleRate) ||
    sourceSampleRate <= 0 ||
    !Number.isFinite(targetSampleRate) ||
    targetSampleRate <= 0
  ) {
    return new Float32Array()
  }

  const frameCount = Math.min(...channels.map((channel) => channel.length))
  if (!frameCount) return new Float32Array()

  const targetFrameCount = Math.max(
    1,
    Math.round((frameCount * targetSampleRate) / sourceSampleRate)
  )
  const output = new Float32Array(targetFrameCount)
  const sourceStep = sourceSampleRate / targetSampleRate

  for (let index = 0; index < targetFrameCount; index += 1) {
    const position = Math.min(index * sourceStep, frameCount - 1)
    const leftIndex = Math.floor(position)
    const rightIndex = Math.min(leftIndex + 1, frameCount - 1)
    const fraction = position - leftIndex
    let mixedSample = 0

    for (const channel of channels) {
      mixedSample +=
        channel[leftIndex] +
        (channel[rightIndex] - channel[leftIndex]) * fraction
    }
    output[index] = mixedSample / channels.length
  }

  return output
}

export function encodeVoicePcmWav(
  samples: Float32Array,
  sampleRate = TURN_BASED_VOICE_SAMPLE_RATE
): ArrayBuffer {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new Error('Voice sample rate must be a positive integer.')
  }
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    const pcm =
      clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
    view.setInt16(44 + index * bytesPerSample, pcm, true)
  })
  return buffer
}

export async function normalizeTurnBasedVoiceAudio(
  recordedAudio: Blob
): Promise<Blob> {
  const audioContext = new AudioContext()
  try {
    const decoded = await audioContext.decodeAudioData(
      await recordedAudio.arrayBuffer()
    )
    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (_, index) => decoded.getChannelData(index)
    )
    const samples = downmixAndResampleVoiceAudio(channels, decoded.sampleRate)
    if (!samples.length) {
      throw new Error('The recording did not contain decodable audio samples.')
    }
    return new Blob([encodeVoicePcmWav(samples)], {
      type: TURN_BASED_VOICE_MIME_TYPE,
    })
  } finally {
    await audioContext.close()
  }
}

export function selectVoiceRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string | null {
  for (const mimeType of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ]) {
    if (isTypeSupported(mimeType)) return mimeType
  }
  return null
}

function requireNumericRoomId(value: string): string {
  const roomId = value.trim()
  if (!/^[1-9][0-9]*$/.test(roomId)) {
    throw new Error('A numeric training room binding is required.')
  }
  return roomId
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return globalThis.btoa(binary)
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

export interface VoiceAudioData {
  bytes: Uint8Array
  channels: number
  mimeType?: string
  sampleRate: number
}

export interface DecodedVoiceAudio {
  buffer: AudioBuffer
  mimeType: string
  waveformSamples: Float32Array | Int16Array
  waveformScale: number
}

const PCM_MIME_TYPES = new Set([
  'audio/l16',
  'audio/pcm',
  'audio/pcm16',
  'audio/s16le',
])

export function isPcmVoiceAudioMimeType(mimeType: string): boolean {
  return PCM_MIME_TYPES.has(mimeType.split(';', 1)[0].trim().toLowerCase())
}

export class VoiceCaptureUnavailableError extends Error {
  constructor() {
    super('Microphone capture is unavailable in this browser.')
    this.name = 'VoiceCaptureUnavailableError'
  }
}

export function requestVoiceMicrophone(): Promise<MediaStream> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new VoiceCaptureUnavailableError()
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  })
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

export function sniffVoiceAudioMimeType(
  bytes: Uint8Array,
  declaredMimeType?: string
): string {
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === 'OggS') {
    return 'audio/ogg'
  }
  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WAVE'
  ) {
    return 'audio/wav'
  }
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'audio/webm'
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    return 'audio/mp4'
  }
  if (
    (bytes.byteLength >= 3 && ascii(bytes, 0, 3) === 'ID3') ||
    (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  ) {
    return 'audio/mpeg'
  }
  return (
    declaredMimeType?.split(';', 1)[0].trim().toLowerCase() ||
    'application/octet-stream'
  )
}

export function int16PcmSamples(bytes: Uint8Array): Int16Array {
  const sampleCount = Math.floor(bytes.byteLength / 2)
  const samples = new Int16Array(sampleCount)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true)
  }
  return samples
}

export async function decodeVoiceAudio(
  context: AudioContext,
  audio: VoiceAudioData
): Promise<DecodedVoiceAudio> {
  const mimeType = sniffVoiceAudioMimeType(audio.bytes, audio.mimeType)
  if (isPcmVoiceAudioMimeType(mimeType)) {
    const samples = int16PcmSamples(audio.bytes)
    const channels = Math.max(1, audio.channels)
    const buffer = context.createBuffer(
      channels,
      Math.floor(samples.length / channels),
      audio.sampleRate
    )
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const output = buffer.getChannelData(channel)
      for (let index = 0; index < output.length; index += 1) {
        output[index] =
          samples[index * buffer.numberOfChannels + channel] / 0x8000
      }
    }
    return {
      buffer,
      mimeType,
      waveformSamples: samples,
      waveformScale: 0x8000,
    }
  }

  const encoded = audio.bytes.buffer.slice(
    audio.bytes.byteOffset,
    audio.bytes.byteOffset + audio.bytes.byteLength
  ) as ArrayBuffer
  const buffer = await context.decodeAudioData(encoded)
  return {
    buffer,
    mimeType,
    waveformSamples: buffer.getChannelData(0),
    waveformScale: 1,
  }
}

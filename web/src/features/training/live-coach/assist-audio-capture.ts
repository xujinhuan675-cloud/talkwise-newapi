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

/** A browser capture source used by the in-conversation assist MVP. */
export type AssistAudioSource = 'microphone' | 'system' | 'mixed'

export type AssistAudioCaptureState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'stopped'

export type AssistAudioCaptureErrorCode =
  | 'audio_track_missing'
  | 'display_capture_unavailable'
  | 'media_recorder_unavailable'
  | 'microphone_capture_unavailable'
  | 'mixing_unavailable'
  | 'system_audio_missing'

export class AssistAudioCaptureError extends Error {
  readonly code: AssistAudioCaptureErrorCode

  constructor(code: AssistAudioCaptureErrorCode, message: string) {
    super(message)
    this.name = 'AssistAudioCaptureError'
    this.code = code
  }
}

export interface AssistAudioChunk {
  /** The encoded browser audio chunk, normally audio/webm;codecs=opus. */
  readonly blob: Blob
  readonly capturedAt: number
  readonly mimeType: string
  readonly sequence: number
  /** Identifies the participant-side source represented by this chunk. */
  readonly source: AssistAudioSource
}

export interface AssistAudioCaptureOptions {
  readonly chunkMs?: number
  readonly displayMediaOptions?: DisplayMediaStreamOptions
  readonly microphoneConstraints?: MediaTrackConstraints
  readonly mimeTypes?: readonly string[]
  readonly onChunk: (chunk: AssistAudioChunk) => void
  readonly onError?: (error: Error) => void
  readonly source: AssistAudioSource
}

export interface AssistMediaDevices {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
  getDisplayMedia?: (
    options?: DisplayMediaStreamOptions
  ) => Promise<MediaStream>
}

export interface AssistAudioCaptureEnvironment {
  readonly createAudioContext?: () => AudioContext
  readonly createMediaRecorder?: (
    stream: MediaStream,
    options?: MediaRecorderOptions
  ) => MediaRecorder
  readonly createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream
  readonly isMediaRecorderTypeSupported?: (mimeType: string) => boolean
  readonly mediaDevices?: AssistMediaDevices
  readonly now?: () => number
}

export interface AssistAudioCaptureController {
  readonly source: AssistAudioSource
  readonly state: AssistAudioCaptureState
  start(): Promise<void>
  stop(): Promise<void>
  /** Stop without waiting for a final recorder chunk. */
  dispose(): void
}

const DEFAULT_CHUNK_MS = 1000
const DEFAULT_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
] as const

const DEFAULT_MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
}

type CaptureBundle = {
  readonly context: AudioContext | null
  readonly recordingStream: MediaStream
  readonly ownedStreams: readonly MediaStream[]
}

function defaultEnvironment(): AssistAudioCaptureEnvironment {
  const mediaDevices =
    typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  return {
    createAudioContext: () => new AudioContext(),
    createMediaRecorder: (stream, options) =>
      options ? new MediaRecorder(stream, options) : new MediaRecorder(stream),
    createMediaStream: (tracks) => new MediaStream(tracks),
    isMediaRecorderTypeSupported: (mimeType) =>
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(mimeType),
    mediaDevices,
    now: () => Date.now(),
  }
}

function uniqueTracks(streams: readonly MediaStream[]): MediaStreamTrack[] {
  const tracks = new Set<MediaStreamTrack>()
  for (const stream of streams) {
    for (const track of stream.getTracks()) tracks.add(track)
  }
  return [...tracks]
}

function stopStreams(streams: readonly MediaStream[]): void {
  for (const track of uniqueTracks(streams)) track.stop()
}

function audioTracks(stream: MediaStream): MediaStreamTrack[] {
  return stream.getAudioTracks().filter((track) => track.readyState !== 'ended')
}

function requireAudioTracks(
  stream: MediaStream,
  code: AssistAudioCaptureErrorCode,
  message: string
): MediaStreamTrack[] {
  const tracks = audioTracks(stream)
  if (tracks.length === 0) throw new AssistAudioCaptureError(code, message)
  return tracks
}

class BrowserAssistAudioCapture implements AssistAudioCaptureController {
  readonly source: AssistAudioSource

  private readonly options: AssistAudioCaptureOptions
  private readonly environment: AssistAudioCaptureEnvironment
  private _state: AssistAudioCaptureState = 'idle'
  private recorder: MediaRecorder | null = null
  private capture: CaptureBundle | null = null
  private sequence = 0
  private stopRequested = false
  private startPromise: Promise<void> | null = null
  private stopPromise: Promise<void> | null = null
  private resolveStop: (() => void) | null = null

  constructor(
    options: AssistAudioCaptureOptions,
    environment: AssistAudioCaptureEnvironment
  ) {
    this.options = options
    this.source = options.source
    this.environment = environment
  }

  get state(): AssistAudioCaptureState {
    return this._state
  }

  start(): Promise<void> {
    if (this._state === 'starting' || this._state === 'recording') {
      return this.startPromise ?? Promise.resolve()
    }
    if (this._state === 'stopping') {
      return Promise.reject(new Error('Audio capture is stopping.'))
    }

    this.stopRequested = false
    this.sequence = 0
    this._state = 'starting'
    const operation = this.startInternal()
    this.startPromise = operation
    void operation.then(
      () => {
        if (this.startPromise === operation) this.startPromise = null
      },
      () => {
        if (this.startPromise === operation) this.startPromise = null
      }
    )
    return operation
  }

  stop(): Promise<void> {
    this.stopRequested = true
    if (this._state === 'starting') {
      return (this.startPromise ?? Promise.resolve()).then(() => this.stop())
    }
    if (this._state !== 'recording') {
      this._state = 'stopped'
      this.releaseCapture()
      return Promise.resolve()
    }
    if (this.stopPromise) return this.stopPromise

    this._state = 'stopping'
    const stopPromise = new Promise<void>((resolve) => {
      this.resolveStop = resolve
    })
    this.stopPromise = stopPromise
    try {
      this.recorder?.requestData()
    } catch {
      // Some engines reject requestData immediately before stop().
    }
    try {
      this.recorder?.stop()
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error : new Error('Audio recording could not stop.')
      )
      this.finishStopped()
    }
    return stopPromise
  }

  dispose(): void {
    this.stopRequested = true
    const recorder = this.recorder
    this.recorder = null
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // The browser may have stopped the recorder concurrently.
        }
      }
    }
    this.finishStopped()
  }

  private async startInternal(): Promise<void> {
    let capture: CaptureBundle | null = null
    try {
      capture = await this.acquireCapture()
      if (this.stopRequested) {
        stopStreams(capture.ownedStreams)
        await closeContext(capture.context)
        this._state = 'stopped'
        return
      }

      const recorderFactory = this.environment.createMediaRecorder
      if (!recorderFactory) {
        throw new AssistAudioCaptureError(
          'media_recorder_unavailable',
          'Audio recording is unavailable in this browser.'
        )
      }
      const mimeType = selectMimeType(
        this.options.mimeTypes ?? DEFAULT_MIME_TYPES,
        this.environment.isMediaRecorderTypeSupported
      )
      const recorder = recorderFactory(
        capture.recordingStream,
        mimeType ? { mimeType } : undefined
      )
      this.capture = capture
      this.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0 || this._state === 'stopped') return
        const type = event.data.type || recorder.mimeType || mimeType || 'audio/webm'
        this.options.onChunk({
          blob: event.data,
          capturedAt: this.environment.now?.() ?? Date.now(),
          mimeType: type,
          sequence: this.sequence++,
          source: this.source,
        })
      }
      recorder.onerror = () => {
        this.options.onError?.(new Error('Audio recording failed.'))
      }
      recorder.onstop = () => this.finishStopped()
      recorder.start(this.options.chunkMs ?? DEFAULT_CHUNK_MS)
      this._state = 'recording'
    } catch (error) {
      if (capture) {
        stopStreams(capture.ownedStreams)
        await closeContext(capture.context)
      }
      this.capture = null
      this.recorder = null
      this._state = 'stopped'
      throw error
    }
  }

  private async acquireCapture(): Promise<CaptureBundle> {
    const mediaDevices = this.environment.mediaDevices ?? defaultEnvironment().mediaDevices
    if (!mediaDevices?.getUserMedia) {
      throw new AssistAudioCaptureError(
        'microphone_capture_unavailable',
        'Microphone capture is unavailable in this browser.'
      )
    }

    if (this.source === 'microphone') {
      const microphone = await mediaDevices.getUserMedia({
        audio: {
          ...DEFAULT_MICROPHONE_CONSTRAINTS,
          ...this.options.microphoneConstraints,
        },
        video: false,
      })
      requireAudioTracks(
        microphone,
        'audio_track_missing',
        'The microphone stream did not provide an audio track.'
      )
      return { context: null, ownedStreams: [microphone], recordingStream: microphone }
    }

    const getDisplayMedia = mediaDevices.getDisplayMedia
    if (!getDisplayMedia) {
      throw new AssistAudioCaptureError(
        'display_capture_unavailable',
        'System audio capture is unavailable in this browser.'
      )
    }

    const display = await getDisplayMedia({
      audio: true,
      video: true,
      ...this.options.displayMediaOptions,
    })
    let displayAudio: MediaStreamTrack[]
    try {
      displayAudio = requireAudioTracks(
        display,
        'system_audio_missing',
        'The selected display did not provide system audio.'
      )
    } catch (error) {
      stopStreams([display])
      throw error
    }

    if (this.source === 'system') {
      const recordingStream = this.createAudioOnlyStream(displayAudio)
      return { context: null, ownedStreams: [display, recordingStream], recordingStream }
    }

    let microphone: MediaStream
    try {
      microphone = await mediaDevices.getUserMedia({
        audio: {
          ...DEFAULT_MICROPHONE_CONSTRAINTS,
          ...this.options.microphoneConstraints,
        },
        video: false,
      })
      requireAudioTracks(
        microphone,
        'audio_track_missing',
        'The microphone stream did not provide an audio track.'
      )
    } catch (error) {
      stopStreams([display])
      throw error
    }

    const contextFactory = this.environment.createAudioContext
    if (!contextFactory) {
      stopStreams([display, microphone])
      throw new AssistAudioCaptureError(
        'mixing_unavailable',
        'Mixed microphone and system audio is unavailable in this browser.'
      )
    }
    let context: AudioContext
    try {
      context = contextFactory()
      const microphoneSource = context.createMediaStreamSource(microphone)
      const displaySource = context.createMediaStreamSource(
        this.createAudioOnlyStream(displayAudio)
      )
      const destination = context.createMediaStreamDestination()
      microphoneSource.connect(destination)
      displaySource.connect(destination)
      const recordingStream = destination.stream
      requireAudioTracks(
        recordingStream,
        'audio_track_missing',
        'The mixed stream did not provide an audio track.'
      )
      return {
        context,
        ownedStreams: [display, microphone, recordingStream],
        recordingStream,
      }
    } catch (error) {
      stopStreams([display, microphone])
      await closeContext(context!)
      throw error
    }
  }

  private createAudioOnlyStream(tracks: MediaStreamTrack[]): MediaStream {
    const createMediaStream = this.environment.createMediaStream
    if (createMediaStream) return createMediaStream(tracks)
    if (typeof MediaStream === 'undefined') {
      throw new AssistAudioCaptureError(
        'audio_track_missing',
        'Audio stream construction is unavailable in this browser.'
      )
    }
    return new MediaStream(tracks)
  }

  private releaseCapture(): void {
    const capture = this.capture
    this.capture = null
    this.recorder = null
    if (!capture) return
    stopStreams(capture.ownedStreams)
    void closeContext(capture.context)
  }

  private finishStopped(): void {
    this._state = 'stopped'
    const recorder = this.recorder
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
    }
    this.releaseCapture()
    const resolve = this.resolveStop
    this.resolveStop = null
    this.stopPromise = null
    resolve?.()
  }
}

async function closeContext(context: AudioContext | null | undefined): Promise<void> {
  if (!context || context.state === 'closed') return
  try {
    await context.close()
  } catch {
    // The context may already have closed when its source tracks ended.
  }
}

function selectMimeType(
  candidates: readonly string[],
  isSupported: ((mimeType: string) => boolean) | undefined
): string | null {
  if (!isSupported) return candidates[0] ?? null
  return candidates.find((candidate) => isSupported(candidate)) ?? null
}

export function createAssistAudioCapture(
  options: AssistAudioCaptureOptions,
  environment: AssistAudioCaptureEnvironment = defaultEnvironment()
): AssistAudioCaptureController {
  if (!options.onChunk) throw new TypeError('onChunk is required.')
  if (!options.source) throw new TypeError('source is required.')
  return new BrowserAssistAudioCapture(options, environment)
}

export function assistAudioMimeTypes(): readonly string[] {
  return DEFAULT_MIME_TYPES
}

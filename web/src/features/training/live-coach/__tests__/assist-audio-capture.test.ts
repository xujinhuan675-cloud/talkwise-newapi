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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  AssistAudioCaptureError,
  createAssistAudioCapture,
  type AssistAudioCaptureEnvironment,
} from '../assist-audio-capture'

class FakeTrack {
  readonly kind: 'audio' | 'video'
  readyState: MediaStreamTrackState = 'live'
  stopped = false

  constructor(kind: 'audio' | 'video' = 'audio') {
    this.kind = kind
  }

  stop() {
    this.stopped = true
    this.readyState = 'ended'
  }
}

class FakeStream {
  constructor(readonly tracks: FakeTrack[]) {}

  getTracks() {
    return this.tracks
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === 'audio')
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = []
  state: RecordingState = 'inactive'
  mimeType = 'audio/webm;codecs=opus'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onstop: (() => void) | null = null
  readonly stream: MediaStream
  readonly options?: MediaRecorderOptions
  startCalls: number[] = []
  stopCalls = 0
  requestDataCalls = 0

  constructor(stream: MediaStream, options?: MediaRecorderOptions) {
    this.stream = stream
    this.options = options
    FakeRecorder.instances.push(this)
  }

  start(timeslice?: number) {
    this.state = 'recording'
    this.startCalls.push(timeslice ?? 0)
  }

  requestData() {
    this.requestDataCalls += 1
  }

  stop() {
    this.stopCalls += 1
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['final'], { type: this.mimeType }) } as BlobEvent)
    this.onstop?.()
  }
}

function stream(tracks = [new FakeTrack()]): MediaStream {
  return new FakeStream(tracks) as unknown as MediaStream
}

function recorderEnvironment(
  mediaDevices: AssistAudioCaptureEnvironment['mediaDevices'],
  now = () => 123
): AssistAudioCaptureEnvironment {
  return {
    createMediaRecorder: (recordingStream, options) =>
      new FakeRecorder(recordingStream, options) as unknown as MediaRecorder,
    createMediaStream: (tracks) =>
      new FakeStream(tracks as unknown as FakeTrack[]) as unknown as MediaStream,
    isMediaRecorderTypeSupported: (mimeType) =>
      mimeType === 'audio/webm;codecs=opus',
    mediaDevices,
    now,
  }
}

describe('assist audio capture', () => {
  test('captures microphone chunks and labels them as microphone', async () => {
    const mic = stream()
    const chunks: { source: string; sequence: number; text: string }[] = []
    const controller = createAssistAudioCapture(
      {
        onChunk: ({ blob, sequence, source }) => {
          const index = chunks.push({ source, sequence, text: 'pending' }) - 1
          void blob.text().then((text) => (chunks[index]!.text = text))
        },
        source: 'microphone',
      },
      recorderEnvironment({
        getUserMedia: async () => mic,
      })
    )

    await controller.start()
    assert.equal(controller.state, 'recording')
    const recorder = FakeRecorder.instances.at(-1)!
    recorder.ondataavailable?.({
      data: new Blob(['hello'], { type: 'audio/webm' }),
    } as BlobEvent)
    await controller.stop()

    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    assert.equal(controller.state, 'stopped')
    assert.deepEqual(chunks, [
      { source: 'microphone', sequence: 0, text: 'hello' },
      { source: 'microphone', sequence: 1, text: 'final' },
    ])
    assert.equal((mic.getTracks()[0] as unknown as FakeTrack).stopped, true)
  })

  test('captures display audio without leaking the display video track to the recorder', async () => {
    const systemAudio = new FakeTrack()
    const display = new FakeStream([systemAudio, new FakeTrack('video')])
    const controller = createAssistAudioCapture(
      { onChunk: () => {}, source: 'system' },
      recorderEnvironment({
        getUserMedia: async () => stream(),
        getDisplayMedia: async () => display as unknown as MediaStream,
      })
    )

    await controller.start()
    const recorder = FakeRecorder.instances.at(-1)!
    assert.deepEqual(recorder.stream.getAudioTracks(), [systemAudio])
    assert.equal(recorder.stream.getTracks().length, 1)
    await controller.stop()
    assert.equal(systemAudio.stopped, true)
  })

  test('mixes microphone and display audio and labels chunks as mixed', async () => {
    const mic = stream()
    const display = stream()
    const destination = stream()
    const connected: MediaStream[] = []
    const context = {
      state: 'running',
      createMediaStreamSource: (source: MediaStream) => ({
        connect: () => connected.push(source),
      }),
      createMediaStreamDestination: () => ({ stream: destination }),
      close: async () => {},
    } as unknown as AudioContext
    const chunks: string[] = []
    const controller = createAssistAudioCapture(
      {
        onChunk: ({ source }) => chunks.push(source),
        source: 'mixed',
      },
      {
        ...recorderEnvironment({
          getUserMedia: async () => mic,
          getDisplayMedia: async () => display,
        }),
        createAudioContext: () => context,
        createMediaStream: (tracks) =>
          (tracks.length === 1
            ? new FakeStream(tracks as unknown as FakeTrack[])
            : destination) as unknown as MediaStream,
      }
    )

    await controller.start()
    assert.equal(connected.length, 2)
    assert.equal(FakeRecorder.instances.at(-1)!.stream, destination)
    FakeRecorder.instances.at(-1)!.ondataavailable?.({
      data: new Blob(['mixed'], { type: 'audio/webm' }),
    } as BlobEvent)
    assert.deepEqual(chunks, ['mixed'])
    await controller.stop()
  })

  test('rejects a display selection that has no audio and stops its tracks', async () => {
    const videoOnlyTrack = new FakeTrack('video')
    const display = new FakeStream([videoOnlyTrack])
    const controller = createAssistAudioCapture(
      { onChunk: () => {}, source: 'system' },
      recorderEnvironment({
        getUserMedia: async () => stream(),
        getDisplayMedia: async () => display as unknown as MediaStream,
      })
    )

    await assert.rejects(controller.start(), (error: unknown) => {
      assert.ok(error instanceof AssistAudioCaptureError)
      assert.equal(error.code, 'system_audio_missing')
      return true
    })
    await Promise.resolve()
    assert.equal(controller.state, 'stopped')
    assert.equal(videoOnlyTrack.stopped, true)
  })
})

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
  buildVideoAnswerMessagePayload,
  buildVideoAnswerMessageUrl,
  buildVideoAnswerReplayUrl,
  buildVideoAnswerUploadUrl,
  loadVideoAnswerReplay,
  persistVideoAnswerMessage,
  uploadVideoAnswer,
  videoAnswerErrorMessage,
  VIDEO_ANSWER_MARKER,
  VIDEO_ANSWER_MAX_BYTES,
  VIDEO_ANSWER_MAX_CAPTION_LENGTH,
  type UploadedVideoAnswer,
} from '../video-answer-client'

const binding = { roomId: '42', trainingSessionId: 'session-1' }

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function uploadedAttachment(
  overrides: Partial<UploadedVideoAnswer> = {}
): UploadedVideoAnswer {
  const replayUrl = buildVideoAnswerReplayUrl(
    '/api/talkwise/training',
    binding,
    'stored-answer.webm'
  )
  return {
    durationMs: 4200,
    filename: 'stored-answer.webm',
    mimeType: 'video/webm',
    recordedAt: '2026-08-01T03:00:00.000Z',
    replayUrl,
    size: 11,
    title: 'Video answer',
    trainingEvent: {
      cameraPresenceStatus: 'placeholder',
      feedbackMode: 'simulation',
      reportDimensions: ['content_delivery', 'camera_presence'],
      schemaVersion: 1,
      trainingFeedbackMode: 'simulation',
      trainingMode: 'video',
      type: 'video_answer_submitted',
    },
    type: 'video',
    url: replayUrl,
    ...overrides,
  }
}

describe('training video answer client contract', () => {
  test('builds authenticated same-origin upload, replay, and room-message URLs', () => {
    assert.equal(
      buildVideoAnswerUploadUrl('/api/talkwise/training/', binding),
      '/api/talkwise/training/video-answers?training_session_id=session-1&room_id=42'
    )
    assert.equal(
      buildVideoAnswerReplayUrl(
        '/api/talkwise/training',
        binding,
        'answer.webm'
      ),
      '/api/talkwise/training/video-answers/answer.webm?training_session_id=session-1&room_id=42'
    )
    assert.equal(
      buildVideoAnswerMessageUrl(binding),
      '/api/talkwise/conversations/rooms/42/messages?trainingSessionId=session-1'
    )
    assert.throws(() =>
      buildVideoAnswerUploadUrl(
        'https://upstream.example/api/v1/training-studio',
        binding
      )
    )
    assert.throws(() =>
      buildVideoAnswerMessageUrl({ ...binding, roomId: 'room-42' })
    )
  })

  test('uploads the backend raw-video contract and rebuilds an identity-free replay URL', async () => {
    const recordingBlob = new Blob(['video-bytes'], { type: 'video/webm' })
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedInit = init
      return jsonResponse(
        {
          data: {
            filename: 'stored-answer.webm',
            mimeType: 'video/webm',
            size: recordingBlob.size,
            url: '/api/v1/training-studio/video-answers/stored-answer.webm?training_session_id=session-1&room_id=42&auth_user_id=forged',
          },
        },
        201
      )
    }) as typeof fetch

    const result = await uploadVideoAnswer(
      {
        apiBase: '/api/talkwise/training',
        feedbackMode: 'drill',
        filename: 'local-answer.webm',
        recording: {
          blob: recordingBlob,
          durationMs: 4200,
          mimeType: 'video/webm;codecs=vp8,opus',
          recordedAt: '2026-08-01T03:00:00.000Z',
        },
        ...binding,
      },
      {
        fetcher,
        getAuthHeaders: async () => ({ Authorization: 'Bearer access-token' }),
      }
    )

    assert.equal(
      capturedUrl,
      '/api/talkwise/training/video-answers?training_session_id=session-1&room_id=42'
    )
    assert.equal(capturedInit?.method, 'POST')
    assert.equal(capturedInit?.body, recordingBlob)
    assert.equal(capturedInit?.body instanceof FormData, false)
    const headers = new Headers(capturedInit?.headers)
    assert.equal(headers.get('authorization'), 'Bearer access-token')
    assert.equal(headers.get('content-type'), 'video/webm')
    assert.equal(headers.get('x-filename'), 'local-answer.webm')
    assert.equal(
      result.replayUrl,
      '/api/talkwise/training/video-answers/stored-answer.webm?training_session_id=session-1&room_id=42'
    )
    assert.equal(result.replayUrl.includes('auth_user_id'), false)
    assert.equal(result.trainingEvent.feedbackMode, 'drill')
  })

  test('serializes bounded server-compatible attachment and training metadata', () => {
    const payload = buildVideoAnswerMessagePayload({
      apiBase: '/api/talkwise/training',
      attachment: uploadedAttachment(),
      caption: 'A concise objection response.',
      feedbackMode: 'assisted',
      ...binding,
    })

    assert.ok(payload.content.startsWith('A concise objection response.'))
    const markerIndex = payload.content.indexOf(VIDEO_ANSWER_MARKER)
    assert.ok(markerIndex > 0)
    const attachment = JSON.parse(
      payload.content.slice(markerIndex + VIDEO_ANSWER_MARKER.length)
    ) as Record<string, unknown>
    assert.equal(attachment.url, uploadedAttachment().replayUrl)
    assert.equal(attachment.type, 'video')
    assert.deepEqual(attachment.trainingEvent, {
      cameraPresenceStatus: 'placeholder',
      feedbackMode: 'assisted',
      reportDimensions: ['content_delivery', 'camera_presence'],
      schemaVersion: 1,
      trainingFeedbackMode: 'assisted',
      trainingMode: 'video',
      type: 'video_answer_submitted',
    })
    assert.equal(payload.metadata.source, 'video_answer')
    assert.equal(payload.metadata.trainingSessionId, 'session-1')
    assert.equal(
      payload.metadata.clientRequestId,
      'video-answer:42:stored-answer.webm'
    )
    assert.equal('userId' in payload.metadata, false)
    assert.equal('teamId' in payload.metadata, false)
    assert.equal('authScope' in payload.metadata, false)

    assert.throws(() =>
      buildVideoAnswerMessagePayload({
        attachment: uploadedAttachment({ size: VIDEO_ANSWER_MAX_BYTES + 1 }),
        caption: 'Too large',
        feedbackMode: 'simulation',
        ...binding,
      })
    )
    assert.throws(() =>
      buildVideoAnswerMessagePayload({
        attachment: uploadedAttachment(),
        caption: 'x'.repeat(VIDEO_ANSWER_MAX_CAPTION_LENGTH + 1),
        feedbackMode: 'simulation',
        ...binding,
      })
    )
  })

  test('persists the marker message through the scoped room namespace', async () => {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> | null = null
    const attachment = uploadedAttachment()
    const expectedPayload = buildVideoAnswerMessagePayload({
      attachment,
      caption: 'Saved answer',
      feedbackMode: 'simulation',
      ...binding,
    })
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return jsonResponse(
        {
          data: {
            content: expectedPayload.content,
            id: 91,
            metadata: expectedPayload.metadata,
            room_id: 42,
          },
        },
        201
      )
    }) as typeof fetch

    const result = await persistVideoAnswerMessage(
      {
        attachment,
        caption: 'Saved answer',
        feedbackMode: 'simulation',
        ...binding,
      },
      {
        fetcher,
        getAuthHeaders: async () => ({ Authorization: 'Bearer access-token' }),
      }
    )

    assert.equal(
      capturedUrl,
      '/api/talkwise/conversations/rooms/42/messages?trainingSessionId=session-1'
    )
    assert.deepEqual(capturedBody, expectedPayload)
    assert.equal(result.id, 91)
    assert.equal(result.roomId, 42)
  })

  test('does not report persistence when the server response is malformed', async () => {
    await assert.rejects(() =>
      persistVideoAnswerMessage(
        {
          attachment: uploadedAttachment(),
          feedbackMode: 'simulation',
          ...binding,
        },
        {
          fetcher: (async () =>
            jsonResponse(
              { data: { id: 91, room_id: 99 } },
              201
            )) as typeof fetch,
          getAuthHeaders: async () => ({}),
        }
      )
    )
  })

  test('loads replay media through authenticated fetch rather than trusting a media URL credential', async () => {
    const attachment = uploadedAttachment()
    let capturedUrl = ''
    let capturedHeaders = new Headers()
    const replay = await loadVideoAnswerReplay(
      attachment,
      binding,
      '/api/talkwise/training',
      {
        fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
          capturedUrl = String(input)
          capturedHeaders = new Headers(init?.headers)
          return new Response(
            new Blob(['stored-video'], { type: 'video/webm' }),
            {
              headers: { 'Content-Type': 'video/webm' },
            }
          )
        }) as typeof fetch,
        getAuthHeaders: async () => ({ Authorization: 'Bearer access-token' }),
      }
    )

    assert.equal(capturedUrl, attachment.replayUrl)
    assert.equal(capturedHeaders.get('authorization'), 'Bearer access-token')
    assert.equal(replay.type, 'video/webm')
    assert.ok(replay.size > 0)
  })

  test('parses nested proxy and backend errors without exposing an object dump', () => {
    assert.equal(
      videoAnswerErrorMessage(
        { error: { detail: 'Training session access denied' } },
        403,
        'Unable to save video answer'
      ),
      'Unable to save video answer: 403 - Training session access denied'
    )
    assert.equal(
      videoAnswerErrorMessage({}, 503, 'Unable to upload video answer'),
      'Unable to upload video answer: 503'
    )
  })
})

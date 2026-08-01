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
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Mic,
  Square,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import {
  buildTurnBasedVoiceFrames,
  decodeTurnBasedVoiceServerEvent,
  finalVoiceTranscript,
  normalizeTurnBasedVoiceAudio,
  persistedVoiceMessage,
  selectVoiceRecorderMimeType,
  trainingTurnBasedVoiceWebSocketUrl,
  turnBasedVoiceProtocols,
  voiceServerError,
  type PersistedVoiceMessage,
  type TurnBasedVoiceServerEvent,
  type TurnBasedVoiceStatus,
} from './turn-based-voice-client'

interface TurnBasedVoicePanelProps {
  apiBase: string
  disabled?: boolean
  onMessagePersisted?: (message: PersistedVoiceMessage) => void
  roomId: string
  sessionId: string
}

const TRANSCRIPTION_TIMEOUT_MS = 45_000
const CONNECTION_TIMEOUT_MS = 12_000

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  )
}

function isMissingDeviceError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

function statusVariant(
  status: TurnBasedVoiceStatus
): 'destructive' | 'outline' | 'secondary' {
  if (status === 'error') return 'destructive'
  if (status === 'idle' || status === 'persisted') return 'outline'
  return 'secondary'
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function TurnBasedVoicePanel({
  apiBase,
  disabled = false,
  onMessagePersisted,
  roomId,
  sessionId,
}: TurnBasedVoicePanelProps) {
  const { i18n, t } = useTranslation()
  const accessToken = useAuthStore((state) => state.auth.accessToken)
  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const requestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const intentionalCloseRef = useRef(false)
  const transcriptRef = useRef('')
  const [status, setStatus] = useState<TurnBasedVoiceStatus>('idle')
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )

  const clearTimers = useCallback(() => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    if (requestTimerRef.current) clearTimeout(requestTimerRef.current)
    durationTimerRef.current = null
    requestTimerRef.current = null
  }, [])

  const releaseCapture = useCallback((abortRecorder: boolean) => {
    const recorder = recorderRef.current
    recorderRef.current = null
    if (abortRecorder && recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // The browser may finish the recorder between the state check and stop.
        }
      }
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const releaseRuntime = useCallback(
    (abortRecorder = true) => {
      clearTimers()
      releaseCapture(abortRecorder)
      intentionalCloseRef.current = true
      const socket = socketRef.current
      socketRef.current = null
      try {
        socket?.close()
      } catch {
        // A connecting socket can reject close while its handshake is settling.
      }
      chunksRef.current = []
    },
    [clearTimers, releaseCapture]
  )

  const fail = useCallback(
    (message: string) => {
      generationRef.current += 1
      releaseRuntime()
      setError(message)
      setStatus('error')
      setDuration(0)
    },
    [releaseRuntime]
  )

  const voiceErrorMessage = useCallback(
    (event: TurnBasedVoiceServerEvent): string | null => {
      const serverError = voiceServerError(event)
      if (!serverError) return null
      if (serverError.code === 'stt_not_configured') {
        return localize(
          'Speech recognition is not available for this workspace.',
          '\u5f53\u524d\u5de5\u4f5c\u533a\u672a\u914d\u7f6e\u8bed\u97f3\u8bc6\u522b\u3002'
        )
      }
      if (serverError.code === 'stt_timeout') {
        return localize(
          'Speech recognition timed out. Try the turn again.',
          '\u8bed\u97f3\u8bc6\u522b\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5\u672c\u56de\u5408\u3002'
        )
      }
      if (serverError.code === 'stt_transcription_failed') {
        return localize(
          'Speech recognition failed. Try the turn again.',
          '\u8bed\u97f3\u8bc6\u522b\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u672c\u56de\u5408\u3002'
        )
      }
      return (
        serverError.message ||
        localize(
          'The voice turn could not be processed.',
          '\u8bed\u97f3\u56de\u5408\u65e0\u6cd5\u5904\u7406\u3002'
        )
      )
    },
    [localize]
  )

  const handleServerEvent = useCallback(
    (event: TurnBasedVoiceServerEvent) => {
      const nextError = voiceErrorMessage(event)
      if (nextError) {
        fail(nextError)
        return
      }

      const nextTranscript = finalVoiceTranscript(event)
      if (nextTranscript !== null) {
        if (!nextTranscript) {
          fail(
            localize(
              'No speech was recognized. Try recording the turn again.',
              '\u672a\u8bc6\u522b\u5230\u8bed\u97f3\uff0c\u8bf7\u91cd\u65b0\u5f55\u5236\u672c\u56de\u5408\u3002'
            )
          )
          return
        }
        transcriptRef.current = nextTranscript
        setTranscript(nextTranscript)
        return
      }

      const persisted = persistedVoiceMessage(event)
      if (!persisted) return
      const confirmedText = persisted.content || transcriptRef.current
      if (confirmedText) {
        transcriptRef.current = confirmedText
        setTranscript(confirmedText)
      }
      generationRef.current += 1
      releaseRuntime(false)
      setError(null)
      setDuration(0)
      setStatus('persisted')
      onMessagePersisted?.(persisted)
    },
    [fail, localize, onMessagePersisted, releaseRuntime, voiceErrorMessage]
  )

  const startRecording = useCallback(async () => {
    if (disabled || !accessToken) return
    releaseRuntime()
    intentionalCloseRef.current = false
    transcriptRef.current = ''
    setTranscript('')
    setError(null)
    setDuration(0)
    setStatus('requesting_permission')
    const generation = generationRef.current + 1
    generationRef.current = generation

    try {
      const socketUrl = trainingTurnBasedVoiceWebSocketUrl(apiBase, {
        roomId,
        sessionId,
      })
      const protocols = turnBasedVoiceProtocols(accessToken)
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is unavailable in this browser.')
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('Audio recording is unavailable in this browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      if (generationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setStatus('connecting')

      const socket = new WebSocket(socketUrl, protocols)
      socketRef.current = socket
      requestTimerRef.current = setTimeout(() => {
        if (generationRef.current !== generation) return
        fail(
          localize(
            'The voice channel took too long to connect.',
            '\u8bed\u97f3\u901a\u9053\u8fde\u63a5\u8d85\u65f6\u3002'
          )
        )
      }, CONNECTION_TIMEOUT_MS)

      socket.addEventListener('open', () => {
        if (
          generationRef.current !== generation ||
          socketRef.current !== socket
        ) {
          socket.close()
          return
        }
        if (requestTimerRef.current) clearTimeout(requestTimerRef.current)
        requestTimerRef.current = null
        const mimeType = selectVoiceRecorderMimeType((candidate) =>
          MediaRecorder.isTypeSupported(candidate)
        )
        let recorder: MediaRecorder
        try {
          recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream)
        } catch {
          fail(
            localize(
              'Audio recording could not be initialized.',
              '\u65e0\u6cd5\u521d\u59cb\u5316\u5f55\u97f3\u3002'
            )
          )
          return
        }
        recorderRef.current = recorder
        chunksRef.current = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data)
        }
        recorder.onstop = () => {
          recorderRef.current = null
          void (async () => {
            if (
              generationRef.current !== generation ||
              socketRef.current !== socket
            ) {
              return
            }
            setStatus('encoding')
            try {
              const sourceAudio = new Blob(chunksRef.current, {
                type: recorder.mimeType || mimeType || 'audio/webm',
              })
              chunksRef.current = []
              const normalized = await normalizeTurnBasedVoiceAudio(sourceAudio)
              if (
                generationRef.current !== generation ||
                socketRef.current !== socket ||
                socket.readyState !== WebSocket.OPEN
              ) {
                return
              }
              const wavBytes = new Uint8Array(await normalized.arrayBuffer())
              for (const frame of buildTurnBasedVoiceFrames(wavBytes)) {
                socket.send(JSON.stringify(frame))
              }
              setStatus('transcribing')
              requestTimerRef.current = setTimeout(() => {
                if (generationRef.current !== generation) return
                const message = transcriptRef.current
                  ? localize(
                      'Speech was recognized, but message persistence was not confirmed.',
                      '\u8bed\u97f3\u5df2\u8bc6\u522b\uff0c\u4f46\u6d88\u606f\u5199\u5165\u672a\u786e\u8ba4\u3002'
                    )
                  : localize(
                      'Speech recognition timed out. Try the turn again.',
                      '\u8bed\u97f3\u8bc6\u522b\u8d85\u65f6\uff0c\u8bf7\u91cd\u8bd5\u672c\u56de\u5408\u3002'
                    )
                fail(message)
              }, TRANSCRIPTION_TIMEOUT_MS)
            } catch {
              fail(
                localize(
                  'The recording could not be converted to standard audio.',
                  '\u5f55\u97f3\u65e0\u6cd5\u8f6c\u6362\u4e3a\u6807\u51c6\u97f3\u9891\u3002'
                )
              )
            }
          })()
        }
        try {
          recorder.start(500)
        } catch {
          fail(
            localize(
              'Audio recording could not be started.',
              '\u65e0\u6cd5\u5f00\u59cb\u5f55\u97f3\u3002'
            )
          )
          return
        }
        setStatus('recording')
        durationTimerRef.current = setInterval(
          () => setDuration((current) => current + 1),
          1000
        )
      })
      socket.addEventListener('message', (message) => {
        if (
          generationRef.current !== generation ||
          socketRef.current !== socket
        ) {
          return
        }
        const event = decodeTurnBasedVoiceServerEvent(message.data)
        if (event) handleServerEvent(event)
      })
      socket.addEventListener('error', () => {
        if (
          generationRef.current !== generation ||
          socketRef.current !== socket
        ) {
          return
        }
        fail(
          localize(
            'The voice training channel could not be opened.',
            '\u8bed\u97f3\u8bad\u7ec3\u901a\u9053\u65e0\u6cd5\u5efa\u7acb\u3002'
          )
        )
      })
      socket.addEventListener('close', (event) => {
        if (
          generationRef.current !== generation ||
          intentionalCloseRef.current
        ) {
          return
        }
        socketRef.current = null
        let message = localize(
          'The voice training channel closed unexpectedly.',
          '\u8bed\u97f3\u8bad\u7ec3\u901a\u9053\u610f\u5916\u5173\u95ed\u3002'
        )
        if (event.code === 1008) {
          message = localize(
            'Voice training access was rejected. Sign in again or check session ownership.',
            '\u8bed\u97f3\u8bad\u7ec3\u8bbf\u95ee\u88ab\u62d2\u7edd\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u6216\u68c0\u67e5\u4f1a\u8bdd\u6743\u9650\u3002'
          )
        } else if (transcriptRef.current) {
          message = localize(
            'Speech was recognized, but message persistence was not confirmed.',
            '\u8bed\u97f3\u5df2\u8bc6\u522b\uff0c\u4f46\u6d88\u606f\u5199\u5165\u672a\u786e\u8ba4\u3002'
          )
        }
        fail(message)
      })
    } catch (nextError) {
      let message = localize(
        'Voice recording could not be started.',
        '\u65e0\u6cd5\u542f\u52a8\u8bed\u97f3\u5f55\u5236\u3002'
      )
      if (isPermissionError(nextError)) {
        message = localize(
          'Microphone permission was not granted.',
          '\u672a\u83b7\u5f97\u9ea6\u514b\u98ce\u6743\u9650\u3002'
        )
      } else if (isMissingDeviceError(nextError)) {
        message = localize(
          'No microphone was detected.',
          '\u672a\u68c0\u6d4b\u5230\u9ea6\u514b\u98ce\u3002'
        )
      } else if (nextError instanceof Error) {
        message = nextError.message
      }
      fail(message)
    }
  }, [
    accessToken,
    apiBase,
    disabled,
    fail,
    handleServerEvent,
    localize,
    releaseRuntime,
    roomId,
    sessionId,
  ])

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    clearTimers()
    setStatus('encoding')
    try {
      recorder.requestData()
    } catch {
      // Some engines reject requestData immediately before stop.
    }
    recorder.stop()
    releaseCapture(false)
  }, [clearTimers, releaseCapture])

  useEffect(() => {
    return () => {
      generationRef.current += 1
      releaseRuntime()
    }
  }, [releaseRuntime])

  useEffect(() => {
    generationRef.current += 1
    releaseRuntime()
    transcriptRef.current = ''
    setTranscript('')
    setError(null)
    setDuration(0)
    setStatus('idle')
  }, [releaseRuntime, roomId, sessionId])

  const statusLabels: Record<TurnBasedVoiceStatus, string> = {
    connecting: localize('Connecting', '\u8fde\u63a5\u4e2d'),
    encoding: localize('Preparing audio', '\u5904\u7406\u97f3\u9891'),
    error: localize('Needs attention', '\u9700\u8981\u5904\u7406'),
    idle: localize('Ready', '\u5f85\u5f55\u5236'),
    persisted: localize('Saved', '\u5df2\u5199\u5165'),
    recording: localize('Recording', '\u5f55\u5236\u4e2d'),
    requesting_permission: localize(
      'Requesting microphone',
      '\u8bf7\u6c42\u9ea6\u514b\u98ce'
    ),
    transcribing: localize('Recognizing', '\u8bc6\u522b\u4e2d'),
  }
  const busy = !['error', 'idle', 'persisted', 'recording'].includes(status)
  let actionIcon = <Mic />
  let actionLabel = localize('Record', '\u5f55\u5236')
  if (busy) {
    actionIcon = <LoaderCircle className='animate-spin' />
  } else if (status === 'recording') {
    actionIcon = <Square />
    actionLabel = localize('Stop', '\u505c\u6b62')
  } else if (status === 'persisted') {
    actionLabel = localize('Record another', '\u518d\u5f55\u4e00\u6b21')
  }

  return (
    <section className='border-border border-t pt-4' aria-live='polite'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-sm font-semibold'>
              {localize('Voice turn', '\u8bed\u97f3\u56de\u5408')}
            </h2>
            <Badge variant={statusVariant(status)}>
              {statusLabels[status]}
            </Badge>
            {status === 'recording' && (
              <Badge variant='outline' className='tabular-nums'>
                {formatDuration(duration)}
              </Badge>
            )}
          </div>
          <p className='text-muted-foreground mt-1 min-h-4 text-xs'>
            {transcript ||
              localize(
                'No saved voice turn yet',
                '\u5c1a\u65e0\u5df2\u5199\u5165\u7684\u8bed\u97f3\u56de\u5408'
              )}
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          variant={status === 'recording' ? 'destructive' : 'default'}
          onClick={status === 'recording' ? stopRecording : startRecording}
          disabled={
            busy || ((disabled || !accessToken) && status !== 'recording')
          }
        >
          {actionIcon}
          {actionLabel}
        </Button>
      </div>

      {error && (
        <Alert variant='destructive' className='mt-3'>
          <CircleAlert />
          <AlertTitle>
            {localize(
              'Voice turn unavailable',
              '\u8bed\u97f3\u56de\u5408\u4e0d\u53ef\u7528'
            )}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {status === 'persisted' && transcript && (
        <Alert className='mt-3'>
          <CircleCheck />
          <AlertTitle>
            {localize(
              'Voice turn saved',
              '\u8bed\u97f3\u56de\u5408\u5df2\u5199\u5165'
            )}
          </AlertTitle>
          <AlertDescription>{transcript}</AlertDescription>
        </Alert>
      )}
    </section>
  )
}

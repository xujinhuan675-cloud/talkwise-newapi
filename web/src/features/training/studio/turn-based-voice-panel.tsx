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
import { Check, LoaderCircle, Mic, X } from 'lucide-react'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  AuthSessionExpiredError,
  getFreshAccessToken,
  redirectToSignIn,
} from '@/lib/auth-session'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import type {
  TrainingRoomMediaControlHandle,
  TrainingRoomPrimaryActionState,
} from './training-room-media-control'
import {
  abortTurnBasedVoiceRecorder,
  buildTurnBasedVoiceFrames,
  decodeTurnBasedVoiceServerEvent,
  finalVoiceTranscript,
  isTurnBasedVoiceInputActive,
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
import {
  QUIET_WAVEFORM,
  quietWaveformLevels,
  waveformLevelsFromFrequencyData,
} from './turn-based-voice-waveform'
import { useResponsiveVoiceWaveform } from './use-responsive-voice-waveform'
import {
  requestVoiceMicrophone,
  VoiceCaptureUnavailableError,
} from './voice-audio'

interface TurnBasedVoicePanelProps {
  apiBase: string
  disabled?: boolean
  model?: string
  onErrorChange?: (error: string | null) => void
  onPrimaryActionChange?: (
    action: TrainingRoomPrimaryActionState | null
  ) => void
  onVoiceInputStateChange?: (active: boolean) => void
  onMessagePersisted?: (message: PersistedVoiceMessage) => void
  roomId: string
  sessionId: string
  showPrimaryAction?: boolean
  voiceMetadata?: Readonly<Record<string, unknown>>
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

export const TurnBasedVoicePanel = forwardRef<
  TrainingRoomMediaControlHandle,
  TurnBasedVoicePanelProps
>(function TurnBasedVoicePanel(
  {
    apiBase,
    disabled = false,
    model,
    onErrorChange,
    onPrimaryActionChange,
    onVoiceInputStateChange,
    onMessagePersisted,
    roomId,
    sessionId,
    showPrimaryAction = true,
    voiceMetadata,
  },
  ref
) {
  const { i18n, t } = useTranslation()
  const accessToken = useAuthStore((state) => state.auth.accessToken)
  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const requestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const intentionalCloseRef = useRef(false)
  const transcriptRef = useRef('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserGainRef = useRef<GainNode | null>(null)
  const analyserDataRef = useRef<Uint8Array | null>(null)
  const waveformFrameRef = useRef<number | null>(null)
  const [status, setStatus] = useState<TurnBasedVoiceStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<readonly number[]>(QUIET_WAVEFORM)
  const { waveformBarCountRef, waveformContainerRef } =
    useResponsiveVoiceWaveform((barCount) => {
      setWaveform(quietWaveformLevels(barCount))
    })
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )

  const clearTimers = useCallback(() => {
    if (requestTimerRef.current) clearTimeout(requestTimerRef.current)
    requestTimerRef.current = null
  }, [])

  const stopWaveformMonitor = useCallback(() => {
    if (waveformFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(waveformFrameRef.current)
    }
    waveformFrameRef.current = null

    try {
      analyserSourceRef.current?.disconnect()
      analyserRef.current?.disconnect()
      analyserGainRef.current?.disconnect()
    } catch {
      // The audio graph may already be closed when the capture track ends.
    }
    analyserSourceRef.current = null
    analyserRef.current = null
    analyserGainRef.current = null
    analyserDataRef.current = null

    const context = audioContextRef.current
    audioContextRef.current = null
    if (context) {
      try {
        void context.close()
      } catch {
        // The browser may have closed the context concurrently.
      }
    }
    setWaveform(quietWaveformLevels(waveformBarCountRef.current))
  }, [waveformBarCountRef])

  const startWaveformMonitor = useCallback(
    (stream: MediaStream) => {
      stopWaveformMonitor()
      if (
        typeof window === 'undefined' ||
        typeof AudioContext === 'undefined' ||
        stream.getAudioTracks().length === 0
      ) {
        return
      }

      try {
        const context = new AudioContext()
        const source = context.createMediaStreamSource(stream)
        const analyser = context.createAnalyser()
        const silentGain = context.createGain()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.75
        silentGain.gain.value = 0
        source.connect(analyser)
        analyser.connect(silentGain)
        silentGain.connect(context.destination)
        const data = new Uint8Array(analyser.frequencyBinCount)

        audioContextRef.current = context
        analyserSourceRef.current = source
        analyserRef.current = analyser
        analyserGainRef.current = silentGain
        analyserDataRef.current = data

        if (context.state === 'suspended') {
          void context.resume().catch(() => undefined)
        }

        const updateWaveform = () => {
          if (analyserRef.current !== analyser || !analyserDataRef.current) {
            return
          }
          analyser.getByteFrequencyData(data)
          const next = waveformLevelsFromFrequencyData(
            data,
            waveformBarCountRef.current
          )
          setWaveform((current) => {
            const unchanged = current.every(
              (level, index) => Math.abs(level - (next[index] ?? 0)) < 0.02
            )
            return unchanged ? current : next
          })
          waveformFrameRef.current =
            window.requestAnimationFrame(updateWaveform)
        }

        waveformFrameRef.current = window.requestAnimationFrame(updateWaveform)
      } catch {
        stopWaveformMonitor()
      }
    },
    [stopWaveformMonitor, waveformBarCountRef]
  )

  const releaseCapture = useCallback(
    (abortRecorder: boolean) => {
      const recorder = recorderRef.current
      recorderRef.current = null
      if (abortRecorder && recorder) {
        abortTurnBasedVoiceRecorder(recorder)
      }
      stopWaveformMonitor()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    },
    [stopWaveformMonitor]
  )

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
        return
      }

      const persisted = persistedVoiceMessage(event)
      if (!persisted) return
      const confirmedText = persisted.content || transcriptRef.current
      if (confirmedText) {
        transcriptRef.current = confirmedText
      }
      generationRef.current += 1
      releaseRuntime(false)
      setError(null)
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
    setError(null)
    setStatus('requesting_permission')
    const generation = generationRef.current + 1
    generationRef.current = generation

    try {
      const socketUrl = trainingTurnBasedVoiceWebSocketUrl(apiBase, {
        roomId,
        sessionId,
      })
      const freshAccessToken = await getFreshAccessToken()
      const protocols = turnBasedVoiceProtocols(freshAccessToken)
      if (typeof MediaRecorder === 'undefined') {
        throw new Error(
          localize(
            'Audio recording is unavailable in this browser.',
            '当前浏览器不支持录音。'
          )
        )
      }

      const stream = await requestVoiceMicrophone()
      if (
        stream.getAudioTracks().length === 0 ||
        stream.getAudioTracks().every((track) => track.readyState === 'ended')
      ) {
        stream.getTracks().forEach((track) => track.stop())
        throw new DOMException('No microphone was detected.', 'NotFoundError')
      }
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
              for (const frame of buildTurnBasedVoiceFrames(
                wavBytes,
                undefined,
                { llmModel: model, voiceMetadata }
              )) {
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
        startWaveformMonitor(stream)
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
      } else if (nextError instanceof VoiceCaptureUnavailableError) {
        message = localize(
          'Microphone capture is unavailable in this browser.',
          '\u5f53\u524d\u6d4f\u89c8\u5668\u65e0\u6cd5\u91c7\u96c6\u9ea6\u514b\u98ce\u3002'
        )
      } else if (nextError instanceof AuthSessionExpiredError) {
        redirectToSignIn()
        return
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
    model,
    releaseRuntime,
    roomId,
    sessionId,
    startWaveformMonitor,
    voiceMetadata,
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

  const cancelRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    generationRef.current += 1
    transcriptRef.current = ''
    releaseRuntime()
    setError(null)
    setStatus('idle')
  }, [releaseRuntime])

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
    setError(null)
    setStatus('idle')
  }, [releaseRuntime, roomId, sessionId])

  useEffect(() => {
    if (!disabled) return
    generationRef.current += 1
    releaseRuntime()
    transcriptRef.current = ''
    setError(null)
    setStatus('idle')
  }, [disabled, releaseRuntime])

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
  let actionLabel = localize('Voice input', '\u8bed\u97f3\u8f93\u5165')
  if (busy) {
    actionIcon = <LoaderCircle className='animate-spin' />
    actionLabel = localize('Preparing', '\u5904\u7406\u4e2d')
  } else if (status === 'recording') {
    actionIcon = <Check />
    actionLabel = localize('Done speaking', '\u8bf4\u5b8c\u4e86')
  } else if (status === 'error') {
    actionLabel = localize('Try again', '\u91cd\u8bd5\u5f55\u97f3')
  }
  const isRecording = status === 'recording'
  const voiceInputActive = isTurnBasedVoiceInputActive(status)
  let actionVariant: 'default' | 'destructive' | 'ghost' = 'ghost'
  if (status === 'error') actionVariant = 'destructive'
  else if (isRecording) actionVariant = 'default'
  let primaryActionIcon: TrainingRoomPrimaryActionState['icon'] = 'mic'
  if (busy) primaryActionIcon = 'loader'
  else if (isRecording) primaryActionIcon = 'check'

  useImperativeHandle(
    ref,
    () => ({
      trigger() {
        if (isRecording) stopRecording()
        else if (!busy) void startRecording()
      },
    }),
    [busy, isRecording, startRecording, stopRecording]
  )

  useEffect(() => {
    onPrimaryActionChange?.({
      active: isRecording,
      disabled: disabled || busy || !accessToken,
      icon: primaryActionIcon,
      label: actionLabel,
      title: error || actionLabel,
      tone: status === 'error' ? 'destructive' : 'default',
    })
  }, [
    accessToken,
    actionLabel,
    busy,
    disabled,
    error,
    isRecording,
    onPrimaryActionChange,
    primaryActionIcon,
    status,
  ])

  useEffect(() => () => onPrimaryActionChange?.(null), [onPrimaryActionChange])

  useEffect(() => {
    onErrorChange?.(error)
  }, [error, onErrorChange])

  useEffect(() => {
    onVoiceInputStateChange?.(voiceInputActive)
    return () => onVoiceInputStateChange?.(false)
  }, [onVoiceInputStateChange, voiceInputActive])

  return (
    <div className='flex min-w-0 flex-1 items-center gap-2'>
      <div
        aria-hidden={!isRecording}
        aria-label={localize(
          'Microphone input level',
          '\u9ea6\u514b\u98ce\u8f93\u5165\u97f3\u91cf'
        )}
        className={cn(
          'flex h-6 min-w-14 flex-1 items-center justify-between gap-0.5 overflow-hidden rounded-md bg-muted/50 px-1 transition-opacity',
          isRecording ? 'opacity-100' : 'opacity-0'
        )}
        data-testid='turn-based-voice-waveform'
        ref={waveformContainerRef}
        role='img'
      >
        {waveform
          .map((level, index) => ({
            id: `waveform-bar-${index}`,
            level,
          }))
          .map((bar) => (
            <span
              aria-hidden='true'
              className='bg-primary/70 w-0.5 shrink-0 rounded-full transition-[height] duration-75'
              key={bar.id}
              style={{
                height: `${Math.max(18, Math.round(bar.level * 100))}%`,
              }}
            />
          ))}
      </div>
      <div className='flex shrink-0 items-center gap-1.5'>
        {isRecording && (
          <Button
            aria-label={localize(
              'Cancel current recording',
              '\u53d6\u6d88\u5f53\u524d\u5f55\u97f3'
            )}
            className='min-w-0 justify-center gap-1 px-2'
            title={localize('Cancel recording', '\u53d6\u6d88\u5f55\u97f3')}
            type='button'
            variant='ghost'
            onClick={cancelRecording}
          >
            <X />
            <span className='truncate text-xs sm:text-sm'>
              {localize('Cancel', '\u53d6\u6d88')}
            </span>
          </Button>
        )}
        {showPrimaryAction && (
          <Button
            aria-label={actionLabel}
            aria-pressed={isRecording}
            className='min-w-0 justify-center gap-1.5 px-2'
            disabled={disabled || busy || !accessToken}
            title={error || statusLabels[status]}
            type='button'
            variant={actionVariant}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {actionIcon}
            <span className='truncate text-xs sm:text-sm'>{actionLabel}</span>
          </Button>
        )}
      </div>
      <span aria-live='polite' className='sr-only'>
        {isRecording
          ? localize(
              'Microphone input is active.',
              '\u6b63\u5728\u63a5\u6536\u9ea6\u514b\u98ce\u58f0\u97f3\u3002'
            )
          : error || statusLabels[status]}
      </span>
    </div>
  )
})

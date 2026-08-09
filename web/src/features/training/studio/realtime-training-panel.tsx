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
import { LoaderCircle, Mic, Square } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  decodeRealtimeServerEvent,
  downsamplePcm16,
  pcm16ToBase64,
  realtimeAudioContract,
  realtimeEventAudio,
  realtimeEventError,
  TALKWISE_REALTIME_PROTOCOL,
  talkWiseBearerProtocol,
  trainingRealtimeWebSocketUrl,
  type RealtimeProfile,
  type RealtimeServerEvent,
  type RealtimeTrainingStatus,
} from './realtime-client'
import type {
  TrainingRoomMediaControlHandle,
  TrainingRoomPrimaryActionState,
} from './training-room-media-control'
import {
  QUIET_WAVEFORM,
  quietWaveformLevels,
  waveformLevelsFromPcmData,
} from './turn-based-voice-waveform'
import { useResponsiveVoiceWaveform } from './use-responsive-voice-waveform'
import {
  decodeVoiceAudio,
  isPcmVoiceAudioMimeType,
  requestVoiceMicrophone,
  VoiceCaptureUnavailableError,
} from './voice-audio'

interface RealtimeVoiceControlProps {
  apiBase: string
  disabled?: boolean
  onErrorChange?: (error: string | null) => void
  onMessagePersisted?: () => void
  onPrimaryActionChange?: (
    action: TrainingRoomPrimaryActionState | null
  ) => void
  onVoiceInputStateChange?: (active: boolean) => void
  profile: RealtimeProfile
  provider: string
  roomId: string
  sessionId: string
  showPrimaryAction?: boolean
}

const ACTIVE_STATUSES = new Set<RealtimeTrainingStatus>([
  'connecting',
  'listening',
  'preparing',
  'processing',
  'speaking',
])

function isPermissionError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
  )
}

export const RealtimeVoiceControl = forwardRef<
  TrainingRoomMediaControlHandle,
  RealtimeVoiceControlProps
>(function RealtimeVoiceControl(
  {
    apiBase,
    disabled = false,
    onErrorChange,
    onMessagePersisted,
    onPrimaryActionChange,
    onVoiceInputStateChange,
    profile,
    provider,
    roomId,
    sessionId,
    showPrimaryAction = true,
  },
  ref
) {
  const { i18n, t } = useTranslation()
  const accessToken = useAuthStore((state) => state.auth.accessToken)
  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inputContextRef = useRef<AudioContext | null>(null)
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const inputSilenceRef = useRef<GainNode | null>(null)
  const outputContextRef = useRef<AudioContext | null>(null)
  const activeOutputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const assistantOutputActiveRef = useRef(false)
  const nextOutputAtRef = useRef(0)
  const outputGenerationRef = useRef(0)
  const outputScheduleRef = useRef<Promise<void>>(Promise.resolve())
  const outputWaveformTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const stoppingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<RealtimeTrainingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)
  const [inputWaveform, setInputWaveform] =
    useState<readonly number[]>(QUIET_WAVEFORM)
  const [outputWaveform, setOutputWaveform] =
    useState<readonly number[]>(QUIET_WAVEFORM)
  const { waveformBarCountRef, waveformContainerRef } =
    useResponsiveVoiceWaveform((barCount) => {
      const quiet = quietWaveformLevels(barCount)
      setInputWaveform(quiet)
      setOutputWaveform(quiet)
    })
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const contract = realtimeAudioContract(profile, provider)

  const releaseCapture = useCallback(() => {
    inputProcessorRef.current?.disconnect()
    if (inputProcessorRef.current) {
      inputProcessorRef.current.onaudioprocess = null
    }
    inputProcessorRef.current = null
    inputSourceRef.current?.disconnect()
    inputSourceRef.current = null
    inputSilenceRef.current?.disconnect()
    inputSilenceRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void inputContextRef.current?.close().catch(() => undefined)
    inputContextRef.current = null
    setInputWaveform(quietWaveformLevels(waveformBarCountRef.current))
  }, [waveformBarCountRef])

  const interruptOutputPlayback = useCallback(() => {
    outputGenerationRef.current += 1
    assistantOutputActiveRef.current = false
    for (const source of activeOutputSourcesRef.current) {
      try {
        source.stop()
      } catch {
        // A source that already ended cannot be stopped again.
      }
      source.disconnect()
    }
    activeOutputSourcesRef.current.clear()
    const context = outputContextRef.current
    nextOutputAtRef.current = context ? context.currentTime : 0
    outputScheduleRef.current = Promise.resolve()
    if (outputWaveformTimerRef.current) {
      clearTimeout(outputWaveformTimerRef.current)
      outputWaveformTimerRef.current = null
    }
    setOutputWaveform(quietWaveformLevels(waveformBarCountRef.current))
  }, [waveformBarCountRef])

  const releaseRuntime = useCallback(() => {
    releaseCapture()
    interruptOutputPlayback()
    void outputContextRef.current?.close().catch(() => undefined)
    outputContextRef.current = null
    nextOutputAtRef.current = 0
    if (outputWaveformTimerRef.current) {
      clearTimeout(outputWaveformTimerRef.current)
      outputWaveformTimerRef.current = null
    }
    setOutputWaveform(quietWaveformLevels(waveformBarCountRef.current))
  }, [interruptOutputPlayback, releaseCapture, waveformBarCountRef])

  const closeRealtime = useCallback(
    (nextStatus: RealtimeTrainingStatus = 'closed') => {
      stoppingRef.current = true
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      if (stopDeadlineRef.current) clearTimeout(stopDeadlineRef.current)
      settleTimerRef.current = null
      stopDeadlineRef.current = null
      const socket = socketRef.current
      socketRef.current = null
      if (socket?.readyState === WebSocket.OPEN) {
        try {
          socket.send(
            JSON.stringify({ reason: 'user_stopped', type: 'session.close' })
          )
        } catch {
          // The server may already have closed after the final audio output.
        }
      }
      socket?.close()
      releaseRuntime()
      setIsFinishing(false)
      setStatus(nextStatus)
    },
    [releaseRuntime]
  )

  const scheduleSettledClose = useCallback(() => {
    if (!stoppingRef.current) return
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    const context = outputContextRef.current
    const remainingOutputMilliseconds = context
      ? Math.max(0, (nextOutputAtRef.current - context.currentTime) * 1000)
      : 0
    settleTimerRef.current = setTimeout(
      () => closeRealtime('closed'),
      Math.max(2000, Math.ceil(remainingOutputMilliseconds) + 250)
    )
  }, [closeRealtime])

  const finishRealtime = useCallback(() => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      closeRealtime('closed')
      return
    }
    stoppingRef.current = true
    setIsFinishing(true)
    releaseCapture()
    setStatus('processing')
    try {
      socket.send(JSON.stringify({ type: 'audio.commit' }))
    } catch {
      closeRealtime('closed')
      return
    }
    stopDeadlineRef.current = setTimeout(() => closeRealtime('closed'), 15000)
  }, [closeRealtime, releaseCapture])

  useEffect(() => () => closeRealtime('closed'), [closeRealtime])

  const playAudio = useCallback(
    async (event: RealtimeServerEvent, generation: number) => {
      const audio = realtimeEventAudio(event)
      if (!audio || audio.bytes.byteLength === 0) return
      if (generation !== outputGenerationRef.current) return
      if (
        provider.trim() === 'volcengine.doubao_realtime' &&
        !isPcmVoiceAudioMimeType(audio.mimeType)
      ) {
        throw new Error(
          localize(
            `Doubao realtime expected PCM audio but received ${audio.mimeType}.`,
            `豆包实时语音要求 PCM 音频，但收到了 ${audio.mimeType}。`
          )
        )
      }
      let context = outputContextRef.current
      if (!context || context.state === 'closed') {
        context = new AudioContext({ latencyHint: 'interactive' })
        outputContextRef.current = context
      }
      if (context.state === 'suspended') await context.resume()

      const decoded = await decodeVoiceAudio(context, audio)
      if (generation !== outputGenerationRef.current) return
      const { buffer } = decoded
      setOutputWaveform(
        waveformLevelsFromPcmData(
          decoded.waveformSamples,
          waveformBarCountRef.current,
          decoded.waveformScale
        )
      )

      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      activeOutputSourcesRef.current.add(source)
      assistantOutputActiveRef.current = true
      setStatus('speaking')
      const startAt = Math.max(context.currentTime, nextOutputAtRef.current)
      nextOutputAtRef.current = startAt + buffer.duration
      source.addEventListener(
        'ended',
        () => {
          activeOutputSourcesRef.current.delete(source)
          const isCurrentOutput = generation === outputGenerationRef.current
          if (isCurrentOutput && activeOutputSourcesRef.current.size === 0) {
            assistantOutputActiveRef.current = false
            setStatus((current) =>
              current === 'speaking' ? 'listening' : current
            )
          }
          if (isCurrentOutput) scheduleSettledClose()
        },
        { once: true }
      )
      source.start(startAt)
      if (outputWaveformTimerRef.current) {
        clearTimeout(outputWaveformTimerRef.current)
      }
      outputWaveformTimerRef.current = setTimeout(
        () =>
          setOutputWaveform(quietWaveformLevels(waveformBarCountRef.current)),
        Math.max(250, Math.ceil(buffer.duration * 1000))
      )
    },
    [localize, provider, scheduleSettledClose, waveformBarCountRef]
  )

  const handleEvent = useCallback(
    (event: RealtimeServerEvent) => {
      if (event.status) setStatus(event.status)
      const nextError = realtimeEventError(event)
      if (nextError) {
        setError(nextError)
        closeRealtime('error')
        return
      }
      if (
        event.type === 'interrupted' ||
        event.type === 'response.cancelled'
      ) {
        interruptOutputPlayback()
        setStatus('listening')
        return
      }
      if (event.type === 'assistant_speaking.started') {
        assistantOutputActiveRef.current = true
        setStatus('speaking')
      } else if (event.type === 'assistant_speaking.stopped') {
        assistantOutputActiveRef.current = false
        if (activeOutputSourcesRef.current.size === 0) setStatus('listening')
      }
      if (event.type === 'audio.output') {
        const generation = outputGenerationRef.current
        outputScheduleRef.current = outputScheduleRef.current
          .catch(() => undefined)
          .then(() => playAudio(event, generation))
          .catch((nextError) => {
            const message =
              nextError instanceof Error
                ? nextError.message
                : localize(
                    'Realtime audio output could not be played.',
                    '实时音频输出无法播放。'
                  )
            setError(message)
            closeRealtime('error')
          })
        return
      }
      if (
        event.type === 'transcript.done' ||
        event.type === 'transcript.persisted'
      ) {
        void outputScheduleRef.current.then(
          scheduleSettledClose,
          scheduleSettledClose
        )
        if (event.type === 'transcript.persisted') onMessagePersisted?.()
      }
    },
    [
      closeRealtime,
      interruptOutputPlayback,
      localize,
      onMessagePersisted,
      playAudio,
      scheduleSettledClose,
    ]
  )

  const startRealtime = useCallback(async () => {
    if (disabled || !accessToken || ACTIVE_STATUSES.has(status)) return
    setError(null)
    setStatus('connecting')
    setIsFinishing(false)
    stoppingRef.current = false

    try {
      const socketUrl = trainingRealtimeWebSocketUrl(apiBase, {
        profile,
        provider,
        roomId,
        sessionId,
      })
      const bearerProtocol = talkWiseBearerProtocol(accessToken)
      const stream = await requestVoiceMicrophone()
      streamRef.current = stream

      const inputContext = new AudioContext()
      inputContextRef.current = inputContext
      if (inputContext.state === 'suspended') await inputContext.resume()
      const source = inputContext.createMediaStreamSource(stream)
      const processor = inputContext.createScriptProcessor(4096, 1, 1)
      const silence = inputContext.createGain()
      silence.gain.value = 0
      source.connect(processor)
      processor.connect(silence)
      silence.connect(inputContext.destination)
      inputSourceRef.current = source
      inputProcessorRef.current = processor
      inputSilenceRef.current = silence

      const socket = new WebSocket(socketUrl, [
        TALKWISE_REALTIME_PROTOCOL,
        bearerProtocol,
      ])
      socketRef.current = socket
      socket.addEventListener('open', () => {
        if (socketRef.current !== socket) return
        setStatus('preparing')
        socket.send(
          JSON.stringify({
            roomId,
            sessionId,
            type: 'session.configure',
          })
        )
      })
      socket.addEventListener('message', (message) => {
        if (socketRef.current !== socket) return
        const event = decodeRealtimeServerEvent(message.data)
        if (event) handleEvent(event)
      })
      socket.addEventListener('error', () => {
        if (socketRef.current !== socket) return
        setError(
          localize(
            'The realtime training channel could not be opened.',
            '实时训练通道无法建立。'
          )
        )
        closeRealtime('error')
      })
      socket.addEventListener('close', (event) => {
        if (socketRef.current === socket) socketRef.current = null
        releaseRuntime()
        if (stoppingRef.current) return
        if (event.code === 1008) {
          setError(
            localize(
              'Realtime training access was rejected. Sign in again or check session ownership.',
              '实时训练访问被拒绝，请重新登录或检查会话权限。'
            )
          )
          setStatus('error')
          return
        }
        setStatus((current) => (current === 'error' ? current : 'closed'))
      })

      processor.onaudioprocess = (event) => {
        if (socket.readyState !== WebSocket.OPEN) return
        const inputSamples = event.inputBuffer.getChannelData(0)
        setInputWaveform(
          waveformLevelsFromPcmData(
            inputSamples,
            waveformBarCountRef.current
          )
        )
        const samples = downsamplePcm16(
          inputSamples,
          inputContext.sampleRate,
          contract.inputSampleRate
        )
        socket.send(
          JSON.stringify({
            audio: pcm16ToBase64(samples),
            mimeType: 'audio/pcm',
            type: 'audio.input',
          })
        )
      }
    } catch (nextError) {
      releaseRuntime()
      let message = localize(
        'Realtime training could not be started.',
        '实时训练无法启动。'
      )
      if (isPermissionError(nextError)) {
        message = localize(
          'Microphone permission was not granted.',
          '未获得麦克风权限。'
        )
      } else if (nextError instanceof VoiceCaptureUnavailableError) {
        message = localize(
          'Microphone capture is unavailable in this browser.',
          '当前浏览器无法采集麦克风。'
        )
      } else if (nextError instanceof Error) {
        message = nextError.message
      }
      setError(message)
      setStatus('error')
    }
  }, [
    accessToken,
    apiBase,
    contract.inputSampleRate,
    disabled,
    closeRealtime,
    localize,
    profile,
    provider,
    releaseRuntime,
    roomId,
    sessionId,
    status,
    handleEvent,
    waveformBarCountRef,
  ])

  useEffect(() => {
    onErrorChange?.(error)
  }, [error, onErrorChange])

  useEffect(() => {
    onVoiceInputStateChange?.(ACTIVE_STATUSES.has(status))
  }, [onVoiceInputStateChange, status])

  useEffect(() => {
    closeRealtime('idle')
    setError(null)
  }, [closeRealtime, roomId, sessionId])

  useEffect(() => {
    if (!disabled) return
    closeRealtime('closed')
    setError(null)
  }, [closeRealtime, disabled])

  const active = ACTIVE_STATUSES.has(status)
  const statusLabels: Record<RealtimeTrainingStatus, string> = {
    closed: localize('Stopped', '已停止'),
    connecting: localize('Connecting', '连接中'),
    error: localize('Needs attention', '需要处理'),
    idle: localize('Ready', '待启动'),
    listening: localize('Listening', '正在聆听'),
    preparing: localize('Preparing', '准备中'),
    processing: localize('Processing', '处理中'),
    speaking: localize('Speaking', '正在回应'),
  }
  const busy = status === 'connecting' || status === 'preparing' || isFinishing
  let actionIcon = <Mic />
  let actionLabel = localize('Start realtime voice', '开始实时语音')
  if (active) {
    actionIcon = <Square />
    actionLabel = localize('Stop realtime voice', '停止实时语音')
  }
  if (busy) {
    actionIcon = <LoaderCircle className='animate-spin' />
  }
  if (isFinishing) {
    actionLabel = localize('Finishing realtime voice', '正在结束实时语音')
  }
  let primaryActionIcon: TrainingRoomPrimaryActionState['icon'] = 'mic'
  if (busy) primaryActionIcon = 'loader'
  else if (active) primaryActionIcon = 'square'

  useImperativeHandle(
    ref,
    () => ({
      trigger() {
        if (active) finishRealtime()
        else if (!busy) void startRealtime()
      },
    }),
    [active, busy, finishRealtime, startRealtime]
  )

  useEffect(() => {
    onPrimaryActionChange?.({
      active,
      disabled: disabled || busy || !accessToken,
      icon: primaryActionIcon,
      label: actionLabel,
      title: error || actionLabel,
      tone: active || status === 'error' ? 'destructive' : 'default',
    })
  }, [
    accessToken,
    actionLabel,
    active,
    busy,
    disabled,
    error,
    onPrimaryActionChange,
    primaryActionIcon,
    status,
  ])

  useEffect(() => () => onPrimaryActionChange?.(null), [onPrimaryActionChange])

  const visibleWaveform =
    status === 'speaking' || outputWaveform.some((level) => level > 0.08)
      ? outputWaveform
      : inputWaveform
  const hasWaveform = visibleWaveform.some((level) => level > 0.08)

  return (
    <div className='flex min-w-0 flex-1 items-center gap-2'>
      <div
        aria-hidden={!hasWaveform}
        aria-label={localize('Realtime voice waveform', '实时语音声波')}
        className={cn(
          'flex h-7 min-w-24 flex-1 items-center justify-between gap-0.5 overflow-hidden px-1 transition-opacity',
          hasWaveform ? 'opacity-100' : 'opacity-0'
        )}
        data-testid='realtime-voice-waveform'
        ref={waveformContainerRef}
        role='img'
      >
        {visibleWaveform
          .map((level, index) => ({
            id: `realtime-waveform-bar-${index}`,
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
      {showPrimaryAction && (
        <Button
          aria-label={actionLabel}
          aria-pressed={active}
          disabled={
            disabled || status === 'connecting' || isFinishing || !accessToken
          }
          size='icon-sm'
          title={error || statusLabels[status]}
          type='button'
          variant={active || status === 'error' ? 'destructive' : 'ghost'}
          onClick={active ? finishRealtime : startRealtime}
        >
          {actionIcon}
          <span className='sr-only'>{actionLabel}</span>
        </Button>
      )}
    </div>
  )
})

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
  waveformLevelsFromPcmData,
} from './turn-based-voice-waveform'

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

function int16Samples(bytes: Uint8Array): Int16Array {
  const sampleCount = Math.floor(bytes.byteLength / 2)
  const samples = new Int16Array(sampleCount)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true)
  }
  return samples
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
  const nextOutputAtRef = useRef(0)
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
    setInputWaveform(QUIET_WAVEFORM)
  }, [])

  const releaseRuntime = useCallback(() => {
    releaseCapture()
    void outputContextRef.current?.close().catch(() => undefined)
    outputContextRef.current = null
    nextOutputAtRef.current = 0
    if (outputWaveformTimerRef.current) {
      clearTimeout(outputWaveformTimerRef.current)
      outputWaveformTimerRef.current = null
    }
    setOutputWaveform(QUIET_WAVEFORM)
  }, [releaseCapture])

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
    settleTimerRef.current = setTimeout(() => closeRealtime('closed'), 2000)
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
    async (event: RealtimeServerEvent) => {
      const audio = realtimeEventAudio(event)
      if (!audio || audio.bytes.byteLength === 0) return
      let context = outputContextRef.current
      if (!context || context.state === 'closed') {
        context = new AudioContext({ latencyHint: 'interactive' })
        outputContextRef.current = context
      }
      if (context.state === 'suspended') await context.resume()

      let buffer: AudioBuffer
      if (audio.mimeType.toLowerCase().includes('pcm')) {
        const samples = int16Samples(audio.bytes)
        setOutputWaveform(waveformLevelsFromPcmData(samples, undefined, 0x8000))
        buffer = context.createBuffer(
          Math.max(1, audio.channels),
          Math.floor(samples.length / Math.max(1, audio.channels)),
          audio.sampleRate
        )
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const output = buffer.getChannelData(channel)
          for (let index = 0; index < output.length; index += 1) {
            output[index] =
              samples[index * buffer.numberOfChannels + channel] / 0x8000
          }
        }
      } else {
        const encoded = audio.bytes.buffer.slice(
          audio.bytes.byteOffset,
          audio.bytes.byteOffset + audio.bytes.byteLength
        ) as ArrayBuffer
        buffer = await context.decodeAudioData(encoded)
        setOutputWaveform(
          waveformLevelsFromPcmData(buffer.getChannelData(0), undefined, 1)
        )
      }

      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      const startAt = Math.max(context.currentTime, nextOutputAtRef.current)
      nextOutputAtRef.current = startAt + buffer.duration
      source.addEventListener('ended', scheduleSettledClose, { once: true })
      source.start(startAt)
      if (outputWaveformTimerRef.current) {
        clearTimeout(outputWaveformTimerRef.current)
      }
      outputWaveformTimerRef.current = setTimeout(
        () => setOutputWaveform(QUIET_WAVEFORM),
        Math.max(250, Math.ceil(buffer.duration * 1000))
      )
    },
    [scheduleSettledClose]
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
      if (event.type === 'audio.output') {
        outputScheduleRef.current = outputScheduleRef.current
          .catch(() => undefined)
          .then(() => playAudio(event))
          .catch(() => {
            setError(
              localize(
                'Realtime audio output could not be played.',
                '实时音频输出无法播放。'
              )
            )
          })
        return
      }
      if (
        event.type === 'transcript.done' ||
        event.type === 'transcript.persisted'
      ) {
        scheduleSettledClose()
        if (event.type === 'transcript.persisted') onMessagePersisted?.()
      }
    },
    [
      closeRealtime,
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
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          localize(
            'Microphone capture is unavailable in this browser.',
            '当前浏览器无法采集麦克风。'
          )
        )
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
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
        setInputWaveform(
          waveformLevelsFromPcmData(event.inputBuffer.getChannelData(0))
        )
        const samples = downsamplePcm16(
          event.inputBuffer.getChannelData(0),
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
      icon: busy ? 'loader' : active ? 'square' : 'mic',
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
      {hasWaveform && (
        <div
          aria-label={localize(
            'Realtime voice waveform',
            '实时语音声波'
          )}
          className='flex h-7 min-w-24 flex-1 items-center gap-0.5 overflow-hidden px-1'
          data-testid='realtime-voice-waveform'
          role='img'
        >
          {visibleWaveform.map((level, index) => (
            <span
              aria-hidden='true'
              className='bg-primary/70 w-0.5 shrink-0 rounded-full transition-[height] duration-75'
              key={`realtime-${index}`}
              style={{ height: `${Math.max(18, Math.round(level * 100))}%` }}
            />
          ))}
        </div>
      )}
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

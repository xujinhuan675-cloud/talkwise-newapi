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
import { CircleAlert, Mic, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import {
  decodeRealtimeServerEvent,
  downsamplePcm16,
  pcm16ToBase64,
  realtimeAudioContract,
  realtimeEventAudio,
  realtimeEventError,
  realtimeEventText,
  TALKWISE_REALTIME_PROTOCOL,
  talkWiseBearerProtocol,
  trainingRealtimeWebSocketUrl,
  type RealtimeProfile,
  type RealtimeServerEvent,
  type RealtimeTrainingStatus,
} from './realtime-client'

interface RealtimeTrainingPanelProps {
  apiBase: string
  profile: RealtimeProfile
  roomId: string
  sessionId: string
}

interface TranscriptItem {
  id: number
  text: string
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

function statusVariant(
  status: RealtimeTrainingStatus
): 'destructive' | 'outline' | 'secondary' {
  if (status === 'error') return 'destructive'
  if (ACTIVE_STATUSES.has(status)) return 'secondary'
  return 'outline'
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

export function RealtimeTrainingPanel({
  apiBase,
  profile,
  roomId,
  sessionId,
}: RealtimeTrainingPanelProps) {
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
  const transcriptIdRef = useRef(0)
  const stoppingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<RealtimeTrainingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isFinishing, setIsFinishing] = useState(false)
  const [preview, setPreview] = useState('')
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([])
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const contract = realtimeAudioContract(profile)

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
  }, [])

  const releaseRuntime = useCallback(() => {
    releaseCapture()
    void outputContextRef.current?.close().catch(() => undefined)
    outputContextRef.current = null
    nextOutputAtRef.current = 0
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

  const playAudio = useCallback(async (event: RealtimeServerEvent) => {
    const audio = realtimeEventAudio(event)
    if (!audio || audio.bytes.byteLength === 0) return
    if (!audio.mimeType.toLowerCase().includes('pcm')) {
      const audioBuffer = audio.bytes.buffer.slice(
        audio.bytes.byteOffset,
        audio.bytes.byteOffset + audio.bytes.byteLength
      ) as ArrayBuffer
      const objectUrl = URL.createObjectURL(
        new Blob([audioBuffer], { type: audio.mimeType })
      )
      const element = new Audio(objectUrl)
      try {
        await element.play()
        await new Promise<void>((resolve, reject) => {
          element.addEventListener('ended', () => resolve(), { once: true })
          element.addEventListener(
            'error',
            () => reject(new Error('Realtime audio playback failed.')),
            { once: true }
          )
        })
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
      return
    }

    let context = outputContextRef.current
    if (!context || context.state === 'closed') {
      context = new AudioContext()
      outputContextRef.current = context
    }
    if (context.state === 'suspended') await context.resume()
    const samples = int16Samples(audio.bytes)
    const buffer = context.createBuffer(
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
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime, nextOutputAtRef.current)
    nextOutputAtRef.current = startAt + buffer.duration
    await new Promise<void>((resolve) => {
      source.addEventListener('ended', () => resolve(), { once: true })
      source.start(startAt)
    })
  }, [])

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
        void playAudio(event)
          .then(scheduleSettledClose)
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
      const text = realtimeEventText(event)
      if (!text) return
      if (event.type === 'transcript.delta') {
        setPreview(text)
        return
      }
      if (
        event.type === 'transcript.done' ||
        event.type === 'transcript.persisted'
      ) {
        scheduleSettledClose()
        setPreview('')
        setTranscripts((current) => {
          if (current.at(-1)?.text === text) return current
          transcriptIdRef.current += 1
          return [...current, { id: transcriptIdRef.current, text }].slice(-8)
        })
      }
    },
    [closeRealtime, localize, playAudio, scheduleSettledClose]
  )

  const startRealtime = useCallback(async () => {
    if (!accessToken || ACTIVE_STATUSES.has(status)) return
    setError(null)
    setPreview('')
    setTranscripts([])
    setStatus('connecting')
    setIsFinishing(false)
    stoppingRef.current = false

    try {
      const socketUrl = trainingRealtimeWebSocketUrl(apiBase, {
        profile,
        roomId,
        sessionId,
      })
      const bearerProtocol = talkWiseBearerProtocol(accessToken)
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone capture is unavailable in this browser.')
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
    closeRealtime,
    localize,
    profile,
    releaseRuntime,
    roomId,
    sessionId,
    status,
    handleEvent,
  ])

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
  let actionLabel = localize('Start', '开始')
  if (active) actionLabel = localize('Stop', '停止')
  if (isFinishing) actionLabel = localize('Finishing', '收尾中')

  return (
    <section className='border-border border-t pt-4' aria-live='polite'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='text-sm font-semibold'>
              {localize('Realtime voice', '实时语音')}
            </h2>
            <Badge variant={statusVariant(status)}>
              {statusLabels[status]}
            </Badge>
            <Badge variant='outline'>
              {contract.latencyProfile === 'true_realtime'
                ? localize('True realtime', '真实时')
                : localize('Near realtime', '近实时')}
            </Badge>
          </div>
          <p className='text-muted-foreground mt-1 text-xs'>
            {preview ||
              transcripts.at(-1)?.text ||
              localize('No transcript yet', '尚无转录')}
          </p>
        </div>
        <Button
          type='button'
          variant={active ? 'destructive' : 'default'}
          size='sm'
          onClick={active ? finishRealtime : startRealtime}
          disabled={!accessToken || status === 'connecting' || isFinishing}
        >
          {active ? <Square /> : <Mic />}
          {actionLabel}
        </Button>
      </div>

      {error && (
        <Alert variant='destructive' className='mt-3'>
          <CircleAlert />
          <AlertTitle>
            {localize('Realtime unavailable', '实时能力不可用')}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {transcripts.length > 0 && (
        <ol className='mt-3 max-h-40 space-y-2 overflow-y-auto text-sm'>
          {transcripts.map((item) => (
            <li key={item.id} className='border-l-2 pl-3'>
              {item.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

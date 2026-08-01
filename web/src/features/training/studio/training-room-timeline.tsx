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
  Activity,
  CircleAlert,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  loadTrainingRoomMessages,
  streamTrainingRoomEvents,
  trainingRoomAudioChunk,
  type TrainingRoomAudioChunk,
  type TrainingRoomEvent,
  type TrainingRoomMessage,
} from './training-room-client'

interface TrainingRoomTimelineProps {
  enableAudioOutput?: boolean
  refreshVersion?: number
  roomId: string
  sessionId: string
}

function nestedText(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (!error || typeof error !== 'object') return fallback
  const response = (error as Record<string, unknown>).response
  const data =
    response && typeof response === 'object'
      ? (response as Record<string, unknown>).data
      : null
  return nestedText(data, 'detail') || nestedText(data, 'message') || fallback
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function TrainingRoomTimeline({
  enableAudioOutput = false,
  refreshVersion = 0,
  roomId,
  sessionId,
}: TrainingRoomTimelineProps) {
  const { i18n, t } = useTranslation()
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const audioResolveRef = useRef<(() => void) | null>(null)
  const audioQueueRef = useRef<Promise<void>>(Promise.resolve())
  const audioGenerationRef = useRef(0)
  const playedAudioRef = useRef(new Set<string>())
  const [messages, setMessages] = useState<TrainingRoomMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(enableAudioOutput)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [audioWarning, setAudioWarning] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [streamWarning, setStreamWarning] = useState<string | null>(null)
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )

  const loadMessages = useCallback(
    async (refreshing = false) => {
      if (refreshing) setIsRefreshing(true)
      try {
        const nextMessages = await loadTrainingRoomMessages(roomId, sessionId)
        setMessages(nextMessages)
        setLoadError(null)
      } catch (error) {
        setLoadError(
          errorMessage(
            error,
            localize('Unable to load the training room.', '无法加载训练房间。')
          )
        )
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [localize, roomId, sessionId]
  )

  const stopAudio = useCallback(() => {
    audioGenerationRef.current += 1
    audioElementRef.current?.pause()
    audioElementRef.current = null
    audioResolveRef.current?.()
    audioResolveRef.current = null
    audioQueueRef.current = Promise.resolve()
    setIsAudioPlaying(false)
  }, [])

  const playAudioChunk = useCallback(
    async (chunk: TrainingRoomAudioChunk, generation: number) => {
      if (generation !== audioGenerationRef.current) return
      let bytes: Uint8Array
      try {
        const binary = globalThis.atob(chunk.data)
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      } catch {
        throw new Error(
          localize(
            'A voice reply contained invalid audio data.',
            '语音回复包含无效的音频数据。'
          )
        )
      }
      if (bytes.byteLength === 0) return

      const audioBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
      const objectUrl = URL.createObjectURL(
        new Blob([audioBuffer], { type: chunk.mimeType })
      )
      const audio = new Audio(objectUrl)
      audioElementRef.current = audio
      setIsAudioPlaying(true)
      try {
        await new Promise<void>((resolve, reject) => {
          audioResolveRef.current = resolve
          audio.addEventListener('ended', () => resolve(), { once: true })
          audio.addEventListener(
            'error',
            () => reject(new Error('Voice reply playback failed.')),
            { once: true }
          )
          void audio.play().catch(reject)
        })
      } finally {
        if (audioElementRef.current === audio) audioElementRef.current = null
        audioResolveRef.current = null
        URL.revokeObjectURL(objectUrl)
        setIsAudioPlaying(false)
      }
    },
    [localize]
  )

  const enqueueAudio = useCallback(
    (chunk: TrainingRoomAudioChunk) => {
      const key =
        chunk.replyId != null && chunk.sentenceIndex != null
          ? `${chunk.replyId}:${chunk.sentenceIndex}`
          : null
      if (key && playedAudioRef.current.has(key)) return
      if (key) playedAudioRef.current.add(key)
      const generation = audioGenerationRef.current
      audioQueueRef.current = audioQueueRef.current
        .catch(() => undefined)
        .then(() => playAudioChunk(chunk, generation))
        .catch((error) => {
          setAudioWarning(
            errorMessage(
              error,
              localize(
                'Voice reply playback is unavailable.',
                '语音回复暂时无法播放。'
              )
            )
          )
        })
    },
    [localize, playAudioChunk]
  )

  useEffect(() => {
    setMessages([])
    setIsLoading(true)
    setLoadError(null)
    void loadMessages()
  }, [loadMessages, refreshVersion])

  useEffect(() => {
    const controller = new AbortController()
    setStreamWarning(null)
    const onEvent = (event: TrainingRoomEvent) => {
      const audioChunk = trainingRoomAudioChunk(event)
      if (audioChunk && enableAudioOutput && isAudioEnabled) {
        enqueueAudio(audioChunk)
        return
      }
      if (event.type === 'typing') {
        setIsReplying(nestedText(event.data, 'status') === 'start')
        return
      }
      if (event.type === 'streaming_start') setIsReplying(true)
      if (event.type === 'message' || event.type === 'round_end') {
        setIsReplying(false)
        void loadMessages(true)
      }
    }

    void streamTrainingRoomEvents(roomId, sessionId, {
      onEvent,
      signal: controller.signal,
    }).catch((error) => {
      if (controller.signal.aborted || isAbort(error)) return
      setStreamWarning(
        errorMessage(
          error,
          localize(
            'Live room updates are temporarily unavailable.',
            '房间实时更新暂时不可用。'
          )
        )
      )
    })

    return () => controller.abort()
  }, [
    enableAudioOutput,
    enqueueAudio,
    isAudioEnabled,
    loadMessages,
    localize,
    roomId,
    sessionId,
  ])

  useEffect(() => {
    setIsAudioEnabled(enableAudioOutput)
    setAudioWarning(null)
    playedAudioRef.current.clear()
    stopAudio()
  }, [enableAudioOutput, roomId, sessionId, stopAudio])

  useEffect(() => () => stopAudio(), [stopAudio])

  const emotionCount = useMemo(
    () => messages.filter((message) => message.emotionScore != null).length,
    [messages]
  )

  const senderLabel = (message: TrainingRoomMessage): string => {
    if (message.senderType === 'user') return localize('You', '你')
    if (message.senderType === 'persona') {
      return localize('Counterpart', '对话对象')
    }
    return localize('System', '系统')
  }

  return (
    <section className='border-border border-t pt-4' aria-live='polite'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 flex-wrap items-center gap-2'>
          <MessageSquareText className='text-muted-foreground size-4' />
          <h2 className='text-sm font-semibold'>
            {localize('Training room', '训练房间')}
          </h2>
          <Badge variant='outline'>
            {localize(
              `${messages.length} messages`,
              `${messages.length} 条消息`
            )}
          </Badge>
          {emotionCount > 0 && (
            <Badge variant='secondary'>
              <Activity />
              {localize(
                `${emotionCount} emotion signals`,
                `${emotionCount} 个情绪信号`
              )}
            </Badge>
          )}
          {isReplying && (
            <Badge variant='secondary'>
              <LoaderCircle className='animate-spin' />
              {localize('Counterpart responding', '对话对象正在回应')}
            </Badge>
          )}
          {isAudioPlaying && (
            <Badge variant='secondary'>
              <Volume2 />
              {localize('Playing reply', '正在播放回复')}
            </Badge>
          )}
        </div>
        <div className='flex items-center gap-1'>
          {enableAudioOutput && (
            <Button
              type='button'
              size='icon-sm'
              variant='ghost'
              title={
                isAudioEnabled
                  ? localize('Mute voice replies', '静音语音回复')
                  : localize('Play voice replies', '播放语音回复')
              }
              aria-label={
                isAudioEnabled
                  ? localize('Mute voice replies', '静音语音回复')
                  : localize('Play voice replies', '播放语音回复')
              }
              onClick={() => {
                if (isAudioEnabled) stopAudio()
                setIsAudioEnabled((current) => !current)
                setAudioWarning(null)
              }}
            >
              {isAudioEnabled ? <Volume2 /> : <VolumeX />}
            </Button>
          )}
          <Button
            type='button'
            size='icon-sm'
            variant='ghost'
            title={localize('Refresh room', '刷新房间')}
            aria-label={localize('Refresh room', '刷新房间')}
            disabled={isRefreshing}
            onClick={() => void loadMessages(true)}
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </div>

      {loadError && (
        <Alert variant='destructive' className='mt-3'>
          <CircleAlert />
          <AlertTitle>{localize('Room unavailable', '房间不可用')}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {streamWarning && !loadError && (
        <Alert className='mt-3'>
          <CircleAlert />
          <AlertTitle>
            {localize('Live updates paused', '实时更新已暂停')}
          </AlertTitle>
          <AlertDescription>{streamWarning}</AlertDescription>
        </Alert>
      )}

      {audioWarning && !loadError && (
        <Alert className='mt-3'>
          <CircleAlert />
          <AlertTitle>
            {localize('Voice playback paused', '语音播放已暂停')}
          </AlertTitle>
          <AlertDescription>{audioWarning}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className='mt-3 space-y-2'>
          <Skeleton className='h-14 w-full' />
          <Skeleton className='h-14 w-4/5' />
        </div>
      )}

      {!isLoading && messages.length === 0 && !loadError && (
        <div className='text-muted-foreground mt-3 border-y py-6 text-center text-sm'>
          {localize('No persisted messages yet.', '尚无已保存的消息。')}
        </div>
      )}

      {!isLoading && messages.length > 0 && (
        <ol className='mt-3 max-h-96 divide-y overflow-y-auto'>
          {messages.map((message) => (
            <li key={message.id} className='py-3 first:pt-0'>
              <div className='flex flex-wrap items-center gap-2 text-xs'>
                <span className='font-medium'>{senderLabel(message)}</span>
                {message.senderId && message.senderType === 'persona' && (
                  <span className='text-muted-foreground'>
                    {message.senderId}
                  </span>
                )}
                {message.videoAnswer && (
                  <Badge variant='outline'>
                    <Video />
                    {localize('Video answer', '视频回答')}
                  </Badge>
                )}
                {message.emotionScore != null && (
                  <Badge variant='outline'>
                    <Activity />
                    {message.emotionLabel || localize('Emotion', '情绪')}{' '}
                    {message.emotionScore > 0 ? '+' : ''}
                    {message.emotionScore}
                  </Badge>
                )}
              </div>
              <p className='mt-1 text-sm break-words whitespace-pre-wrap'>
                {message.content ||
                  (message.videoAnswer
                    ? localize('Video answer submitted.', '视频回答已提交。')
                    : localize('No message content.', '无消息内容。'))}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

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
import { Activity, CircleAlert, Video, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlaygroundChat } from '@/features/playground/components/chat/playground-chat'
import { cn } from '@/lib/utils'

import type { TrainingMessageParticipant } from '../conversation-workspace/participant-identity'
import {
  findTrainingOpeningMessage,
  hasPlayedTrainingOpening,
  loadTrainingRoomAudioEnabled,
  markTrainingOpeningPlayed,
  saveTrainingRoomAudioEnabled,
  trainingOpeningSpeechLanguage,
} from './training-room-audio-preference'
import {
  loadTrainingRoomMessages,
  streamTrainingRoomEvents,
  trainingRoomAudioChunk,
  type TrainingRoomAudioChunk,
  type TrainingRoomEvent,
  type TrainingRoomMessage,
} from './training-room-client'
import { trainingRoomPlaygroundMessages } from './training-room-message-adapter'

interface TrainingRoomTimelineProps {
  assistantParticipant?: TrainingMessageParticipant
  className?: string
  enableAudioOutput?: boolean
  headerActionsTarget?: HTMLDivElement | null
  onLoadingChange?: (loading: boolean) => void
  onMessagesChange?: (messages: TrainingRoomMessage[]) => void
  onReplyingChange?: (replying: boolean) => void
  refreshVersion?: number
  roomId: string
  sessionId: string
  userParticipant?: TrainingMessageParticipant
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
  assistantParticipant,
  className,
  enableAudioOutput = false,
  headerActionsTarget,
  onLoadingChange,
  onMessagesChange,
  onReplyingChange,
  refreshVersion = 0,
  roomId,
  sessionId,
  userParticipant,
}: TrainingRoomTimelineProps) {
  const { i18n, t } = useTranslation()
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const audioResolveRef = useRef<(() => void) | null>(null)
  const audioQueueRef = useRef<Promise<void>>(Promise.resolve())
  const audioGenerationRef = useRef(0)
  const playedAudioRef = useRef(new Set<string>())
  const openingSpeechRef = useRef<SpeechSynthesisUtterance | null>(null)
  const openingPlaybackAttemptRef = useRef<string | null>(null)
  const [messages, setMessages] = useState<TrainingRoomMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isReplying, setIsReplying] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(() =>
    loadTrainingRoomAudioEnabled(
      typeof window === 'undefined' ? null : window.localStorage,
      enableAudioOutput
    )
  )
  const [audioWarning, setAudioWarning] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [streamWarning, setStreamWarning] = useState<string | null>(null)
  const updateReplying = useCallback(
    (replying: boolean) => {
      setIsReplying(replying)
      onReplyingChange?.(replying)
    },
    [onReplyingChange]
  )
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )

  const loadMessages = useCallback(async () => {
    try {
      const nextMessages = await loadTrainingRoomMessages(roomId, sessionId)
      setMessages(nextMessages)
      onMessagesChange?.(nextMessages)
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
      onLoadingChange?.(false)
    }
  }, [localize, onLoadingChange, onMessagesChange, roomId, sessionId])

  const stopAudio = useCallback(() => {
    audioGenerationRef.current += 1
    if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      openingSpeechRef.current
    ) {
      window.speechSynthesis.cancel()
      openingSpeechRef.current = null
    }
    audioElementRef.current?.pause()
    audioElementRef.current = null
    audioResolveRef.current?.()
    audioResolveRef.current = null
    audioQueueRef.current = Promise.resolve()
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
    onLoadingChange?.(true)
    void loadMessages()
  }, [loadMessages, onLoadingChange, refreshVersion])

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
        updateReplying(nestedText(event.data, 'status') === 'start')
        return
      }
      if (event.type === 'streaming_start') updateReplying(true)
      if (event.type === 'message' || event.type === 'round_end') {
        updateReplying(false)
        void loadMessages()
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
    updateReplying,
    roomId,
    sessionId,
  ])

  useEffect(() => {
    setIsAudioEnabled(
      loadTrainingRoomAudioEnabled(
        typeof window === 'undefined' ? null : window.localStorage,
        enableAudioOutput
      )
    )
    setAudioWarning(null)
    playedAudioRef.current.clear()
    openingPlaybackAttemptRef.current = null
    stopAudio()
  }, [enableAudioOutput, roomId, sessionId, stopAudio])

  useEffect(() => () => stopAudio(), [stopAudio])

  useEffect(() => {
    if (!enableAudioOutput || !isAudioEnabled || isLoading) return
    const opening = findTrainingOpeningMessage(messages)
    if (!opening) return

    const playbackId = `${sessionId}:${opening.id}`
    if (openingPlaybackAttemptRef.current === playbackId) return
    const sessionStorage =
      typeof window === 'undefined' ? null : window.sessionStorage
    if (hasPlayedTrainingOpening(sessionStorage, sessionId, opening.id)) return
    openingPlaybackAttemptRef.current = playbackId

    if (
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      setAudioWarning(
        localize(
          'Opening voice playback is unavailable in this browser.',
          '当前浏览器无法播放开场语音。'
        )
      )
      return
    }

    let cancelled = false
    const utterance = new SpeechSynthesisUtterance(opening.content)
    utterance.lang = trainingOpeningSpeechLanguage(
      opening.content,
      i18n.language
    )
    const finish = () => {
      if (openingSpeechRef.current === utterance) {
        openingSpeechRef.current = null
      }
    }
    utterance.addEventListener('start', () => {
      if (cancelled) return
      markTrainingOpeningPlayed(sessionStorage, sessionId, opening.id)
    })
    utterance.addEventListener('end', finish)
    utterance.addEventListener('error', (event) => {
      finish()
      if (
        !cancelled &&
        event.error !== 'canceled' &&
        event.error !== 'interrupted'
      ) {
        setAudioWarning(
          localize(
            'Opening voice playback is unavailable.',
            '开场语音暂时无法播放。'
          )
        )
      }
    })
    openingSpeechRef.current = utterance
    window.speechSynthesis.speak(utterance)

    return () => {
      cancelled = true
      if (openingSpeechRef.current === utterance) {
        window.speechSynthesis.cancel()
        openingSpeechRef.current = null
      }
    }
  }, [
    enableAudioOutput,
    i18n.language,
    isAudioEnabled,
    isLoading,
    localize,
    messages,
    sessionId,
  ])

  const playgroundMessages = useMemo(
    () =>
      trainingRoomPlaygroundMessages(messages, (isVideoAnswer) =>
        isVideoAnswer
          ? localize('Video answer submitted.', '视频回答已提交。')
          : localize('No message content.', '无消息内容。')
      ),
    [localize, messages]
  )
  const roomMessagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages]
  )

  return (
    <section
      className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}
      aria-live='polite'
    >
      {headerActionsTarget &&
        createPortal(
          enableAudioOutput ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
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
                setIsAudioEnabled((current) => {
                  const next = !current
                  saveTrainingRoomAudioEnabled(
                    typeof window === 'undefined' ? null : window.localStorage,
                    next
                  )
                  return next
                })
                setAudioWarning(null)
              }}
            >
              {isAudioEnabled ? <Volume2 /> : <VolumeX />}
              <span className='hidden sm:inline'>
                {isAudioEnabled
                  ? localize('Mute', '静音')
                  : localize('Play sound', '播放声音')}
              </span>
              <span className='sr-only sm:hidden'>
                {isAudioEnabled
                  ? localize('Mute', '静音')
                  : localize('Play sound', '播放声音')}
              </span>
            </Button>
          ) : null,
          headerActionsTarget
        )}

      {loadError && (
        <Alert variant='destructive' className='mx-3 mt-3 shrink-0 sm:mx-4'>
          <CircleAlert />
          <AlertTitle>{localize('Room unavailable', '房间不可用')}</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {streamWarning && !loadError && (
        <Alert className='mx-3 mt-3 shrink-0 sm:mx-4'>
          <CircleAlert />
          <AlertTitle>
            {localize('Live updates paused', '实时更新已暂停')}
          </AlertTitle>
          <AlertDescription>{streamWarning}</AlertDescription>
        </Alert>
      )}

      {audioWarning && !loadError && (
        <Alert className='mx-3 mt-3 shrink-0 sm:mx-4'>
          <CircleAlert />
          <AlertTitle>
            {localize('Voice playback paused', '语音播放已暂停')}
          </AlertTitle>
          <AlertDescription>{audioWarning}</AlertDescription>
        </Alert>
      )}

      <div className='relative min-h-0 flex-1'>
        <PlaygroundChat
          assistantParticipant={assistantParticipant}
          contentClassName='max-w-none'
          isGenerating={isReplying}
          isLoadingMessages={isLoading}
          messages={playgroundMessages}
          renderMessageFooter={(message) => {
            const roomMessage = roomMessagesById.get(message.key)
            if (
              !roomMessage?.videoAnswer &&
              roomMessage?.emotionScore == null
            ) {
              return null
            }
            return (
              <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                {roomMessage.videoAnswer && (
                  <Badge variant='outline'>
                    <Video />
                    {localize('Video answer', '视频回答')}
                  </Badge>
                )}
                {roomMessage.emotionScore != null && (
                  <Badge variant='outline'>
                    <Activity />
                    {roomMessage.emotionLabel ||
                      localize('Emotion', '情绪')}{' '}
                    {roomMessage.emotionScore > 0 ? '+' : ''}
                    {roomMessage.emotionScore}
                  </Badge>
                )}
              </div>
            )
          }}
          userParticipant={userParticipant}
        />
        {!isLoading && messages.length === 0 && !loadError && (
          <div className='text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-sm'>
            {localize('No persisted messages yet.', '尚无已保存的消息。')}
          </div>
        )}
      </div>
    </section>
  )
}

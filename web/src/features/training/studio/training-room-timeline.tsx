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
  Pause,
  Video,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PlaygroundChat } from '@/features/playground/components/chat/playground-chat'
import type { MessageActionItem } from '@/features/playground/components/message/message-actions'
import type { Message } from '@/features/playground/types'
import { cn } from '@/lib/utils'

import type { TrainingMessageParticipant } from '../conversation-workspace/participant-identity'
import { trainingEmotionDisplayLabel } from '../training-display-labels'
import {
  findTrainingOpeningMessage,
  hasPlayedTrainingOpening,
  loadTrainingRoomAudioEnabled,
  markTrainingOpeningPlayed,
  saveTrainingRoomAudioEnabled,
} from './training-room-audio-preference'
import {
  loadTrainingRoomMessages,
  loadTrainingRoomMessageAudioManifest,
  loadTrainingRoomMessageAudioSegment,
  synthesizeTrainingRoomMessageAudio,
  streamTrainingRoomEvents,
  trainingRoomAudioChunk,
  type TrainingRoomAudioChunk,
  type TrainingRoomEvent,
  type TrainingRoomMessage,
} from './training-room-client'
import {
  trainingRoomPlaygroundMessages,
  trainingRoomPlaygroundMessagesWithTranscriptPreview,
} from './training-room-message-adapter'

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
  sessionActive?: boolean
  sessionId: string
  transcriptPreview?: string | null
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
  if (error && typeof error === 'object') {
    const response = (error as Record<string, unknown>).response
    const data =
      response && typeof response === 'object'
        ? (response as Record<string, unknown>).data
        : null
    const responseMessage =
      nestedText(data, 'detail') || nestedText(data, 'message')
    if (responseMessage) return responseMessage
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
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
  sessionActive = true,
  sessionId,
  transcriptPreview = null,
  userParticipant,
}: TrainingRoomTimelineProps) {
  const { i18n, t } = useTranslation()
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const audioResolveRef = useRef<(() => void) | null>(null)
  const audioQueueRef = useRef<Promise<void>>(Promise.resolve())
  const audioGenerationRef = useRef(0)
  const playedAudioRef = useRef(new Set<string>())
  const openingPlaybackAttemptRef = useRef<string | null>(null)
  const replayAbortRef = useRef<AbortController | null>(null)
  const replayAudioRef = useRef<HTMLAudioElement | null>(null)
  const replayGenerationRef = useRef(0)
  const replayObjectUrlRef = useRef<string | null>(null)
  const replayResolveRef = useRef<(() => void) | null>(null)
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
  const [replayState, setReplayState] = useState<{
    messageId: string | null
    status: 'error' | 'idle' | 'loading' | 'paused' | 'playing'
  }>({ messageId: null, status: 'idle' })
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
    audioElementRef.current?.pause()
    audioElementRef.current = null
    audioResolveRef.current?.()
    audioResolveRef.current = null
    audioQueueRef.current = Promise.resolve()
  }, [])

  const stopReplay = useCallback((resetState = true) => {
    replayGenerationRef.current += 1
    replayAbortRef.current?.abort()
    replayAbortRef.current = null
    replayAudioRef.current?.pause()
    replayAudioRef.current = null
    replayResolveRef.current?.()
    replayResolveRef.current = null
    if (replayObjectUrlRef.current) {
      URL.revokeObjectURL(replayObjectUrlRef.current)
      replayObjectUrlRef.current = null
    }
    if (resetState) setReplayState({ messageId: null, status: 'idle' })
  }, [])

  const playReplaySegment = useCallback(
    async (
      messageId: string,
      segmentIndex: number,
      mimeType: string,
      generation: number,
      signal: AbortSignal
    ) => {
      const bytes = await loadTrainingRoomMessageAudioSegment(
        roomId,
        sessionId,
        messageId,
        segmentIndex,
        signal
      )
      if (generation !== replayGenerationRef.current || signal.aborted) return
      const objectUrl = URL.createObjectURL(
        new Blob([bytes], { type: mimeType })
      )
      replayObjectUrlRef.current = objectUrl
      const audio = new Audio(objectUrl)
      replayAudioRef.current = audio
      setReplayState({ messageId, status: 'playing' })
      try {
        await new Promise<void>((resolve, reject) => {
          replayResolveRef.current = resolve
          audio.addEventListener('ended', () => resolve(), { once: true })
          audio.addEventListener(
            'error',
            () => reject(new Error('AI audio playback failed.')),
            { once: true }
          )
          void audio.play().catch(reject)
        })
      } finally {
        if (replayAudioRef.current === audio) replayAudioRef.current = null
        replayResolveRef.current = null
        if (replayObjectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl)
          replayObjectUrlRef.current = null
        }
      }
    },
    [roomId, sessionId]
  )

  const startReplay = useCallback(
    async (
      messageId: string,
      synthesizeMissing = false,
      notifyResynthesis = true
    ): Promise<boolean> => {
      stopAudio()
      stopReplay(false)
      const generation = replayGenerationRef.current
      const controller = new AbortController()
      let timedOut = false
      const timeoutId = globalThis.setTimeout(() => {
        timedOut = true
        if (replayAbortRef.current === controller) {
          replayAudioRef.current?.pause()
          replayResolveRef.current?.()
        }
        controller.abort()
      }, 30_000)
      replayAbortRef.current = controller
      setReplayState({ messageId, status: 'loading' })
      try {
        const manifest = synthesizeMissing
          ? await synthesizeTrainingRoomMessageAudio(
              roomId,
              sessionId,
              messageId,
              controller.signal
            )
          : await loadTrainingRoomMessageAudioManifest(
              roomId,
              sessionId,
              messageId,
              controller.signal
            )
        if (synthesizeMissing) {
          if (notifyResynthesis) {
            toast.info(
              localize(
                'Historical audio was recreated with the current voice configuration; it is not the original playback.',
                '历史音频已按当前语音配置重新合成并保存，不是此前播放的原始音频。'
              )
            )
          }
          void loadMessages()
        }
        for (const segment of manifest.segments) {
          if (
            controller.signal.aborted ||
            generation !== replayGenerationRef.current
          ) {
            return false
          }
          setReplayState({ messageId, status: 'loading' })
          await playReplaySegment(
            messageId,
            segment.index,
            segment.mimeType,
            generation,
            controller.signal
          )
          if (
            controller.signal.aborted ||
            generation !== replayGenerationRef.current
          ) {
            if (generation === replayGenerationRef.current) {
              setReplayState({ messageId: null, status: 'idle' })
            }
            return false
          }
        }
        if (generation !== replayGenerationRef.current) return false
        setReplayState({ messageId: null, status: 'idle' })
        return true
      } catch (error) {
        if (generation !== replayGenerationRef.current) return false
        if (controller.signal.aborted || isAbort(error)) {
          if (!timedOut) setReplayState({ messageId: null, status: 'idle' })
          return false
        }
        setReplayState({ messageId, status: 'error' })
        toast.error(
          errorMessage(
            error,
            localize(
              'AI audio could not be played.',
              'AI \u8bed\u97f3\u65e0\u6cd5\u64ad\u653e\u3002'
            )
          )
        )
        return false
      } finally {
        globalThis.clearTimeout(timeoutId)
        if (replayAbortRef.current === controller) replayAbortRef.current = null
      }
    },
    [
      loadMessages,
      localize,
      playReplaySegment,
      roomId,
      sessionId,
      stopAudio,
      stopReplay,
    ]
  )

  const toggleReplay = useCallback(
    (messageId: string, synthesizeMissing = false) => {
      if (replayState.messageId === messageId) {
        if (replayState.status === 'playing') {
          replayAudioRef.current?.pause()
          setReplayState({ messageId, status: 'paused' })
          return
        }
        if (replayState.status === 'paused' && replayAudioRef.current) {
          setReplayState({ messageId, status: 'loading' })
          void replayAudioRef.current
            .play()
            .then(() => setReplayState({ messageId, status: 'playing' }))
            .catch((error) => {
              setReplayState({ messageId, status: 'error' })
              toast.error(
                errorMessage(
                  error,
                  localize(
                    'AI audio could not resume.',
                    'AI \u8bed\u97f3\u65e0\u6cd5\u7ee7\u7eed\u64ad\u653e\u3002'
                  )
                )
              )
            })
          return
        }
        if (replayState.status === 'loading') return
      }
      void startReplay(messageId, synthesizeMissing)
    },
    [localize, replayState, startReplay]
  )

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
      stopReplay()
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
    [localize, playAudioChunk, stopReplay]
  )

  useEffect(() => {
    setMessages([])
    setIsLoading(true)
    setLoadError(null)
    onLoadingChange?.(true)
    void loadMessages()
  }, [loadMessages, onLoadingChange, refreshVersion])

  useEffect(() => {
    if (!sessionActive) {
      setStreamWarning(null)
      updateReplying(false)
      return
    }
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
    sessionActive,
    sessionId,
  ])

  useEffect(() => {
    if (!sessionActive) {
      stopAudio()
      stopReplay()
      updateReplying(false)
    }
  }, [sessionActive, stopAudio, stopReplay, updateReplying])

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
    stopReplay()
  }, [enableAudioOutput, roomId, sessionId, stopAudio, stopReplay])

  useEffect(
    () => () => {
      stopAudio()
      stopReplay(false)
    },
    [stopAudio, stopReplay]
  )

  useEffect(() => {
    if (!sessionActive || !enableAudioOutput || !isAudioEnabled || isLoading) {
      return
    }
    const opening = findTrainingOpeningMessage(messages)
    if (!opening) return
    const shouldSynthesize = opening.audioReplay?.available !== true
    if (!opening.audioReplay && !opening.audioSynthesisAvailable) return

    const playbackId = `${sessionId}:${opening.id}`
    if (openingPlaybackAttemptRef.current === playbackId) return
    const sessionStorage =
      typeof window === 'undefined' ? null : window.sessionStorage
    if (hasPlayedTrainingOpening(sessionStorage, sessionId, opening.id)) return
    openingPlaybackAttemptRef.current = playbackId

    void startReplay(opening.id, shouldSynthesize, false).then((played) => {
      if (played) {
        markTrainingOpeningPlayed(sessionStorage, sessionId, opening.id)
      }
    })
  }, [
    enableAudioOutput,
    isAudioEnabled,
    isLoading,
    messages,
    sessionActive,
    sessionId,
    startReplay,
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
  const displayedMessages = useMemo(
    () =>
      trainingRoomPlaygroundMessagesWithTranscriptPreview(
        playgroundMessages,
        transcriptPreview
      ),
    [playgroundMessages, transcriptPreview]
  )
  const roomMessagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages]
  )
  const getMessageActions = useCallback(
    (message: Message): readonly MessageActionItem[] => {
      const roomMessage = roomMessagesById.get(message.key)
      if (
        roomMessage?.senderType !== 'persona' ||
        (roomMessage.audioReplay?.available !== true &&
          roomMessage.audioSynthesisAvailable !== true)
      ) {
        return []
      }
      const isActive = replayState.messageId === message.key
      const status = isActive ? replayState.status : 'idle'
      const synthesizeMissing = roomMessage.audioSynthesisAvailable === true
      const isOriginal = roomMessage.audioReplay?.original === true
      if (status === 'loading') {
        return [
          {
            disabled: true,
            icon: LoaderCircle,
            iconClassName: 'animate-spin',
            label: localize(
              synthesizeMissing
                ? 'Recreating historical AI audio with the current voice'
                : 'Loading AI audio',
              synthesizeMissing
                ? '正在按当前语音配置补建历史 AI 语音（非原始音频）'
                : '正在加载 AI 语音'
            ),
            onClick: () => undefined,
          },
        ]
      }
      if (status === 'playing') {
        return [
          {
            icon: Pause,
            label: localize('Pause AI audio', '暂停 AI 语音'),
            onClick: () => toggleReplay(message.key, synthesizeMissing),
          },
        ]
      }
      let label: string
      if (synthesizeMissing) {
        label = localize(
          'Recreate and play with the current voice (not original audio)',
          '按当前语音配置重新合成并播放（非原始音频）'
        )
      } else if (isOriginal) {
        label = localize('Replay original AI audio', '重新播放原始 AI 语音')
      } else {
        label = localize(
          'Play recreated AI audio (not original audio)',
          '播放补建的 AI 语音（非原始音频）'
        )
      }
      if (status === 'paused') {
        label = localize('Resume AI audio', '继续播放 AI 语音')
      } else if (status === 'error') {
        label = localize('Retry AI audio', '重试 AI 语音')
      }
      return [
        {
          className: status === 'error' ? 'text-destructive' : '',
          icon: Volume2,
          label,
          onClick: () => toggleReplay(message.key, synthesizeMissing),
        },
      ]
    },
    [localize, replayState, roomMessagesById, toggleReplay]
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

      <div className='relative flex min-h-0 flex-1 flex-col overflow-hidden'>
        <PlaygroundChat
          assistantParticipant={assistantParticipant}
          contentClassName='max-w-none'
          isGenerating={isReplying}
          isLoadingMessages={isLoading}
          getMessageActions={getMessageActions}
          messages={displayedMessages}
          renderMessageHeader={(message) => {
            const roomMessage = roomMessagesById.get(message.key)
            const emotionLabel = trainingEmotionDisplayLabel(
              roomMessage?.emotionLabel,
              roomMessage?.emotionScore,
              i18n.resolvedLanguage ?? i18n.language
            )
            if (roomMessage?.emotionScore == null && !emotionLabel) {
              return null
            }
            return (
              <div
                className={cn(
                  'mb-1.5 flex flex-wrap items-center gap-1.5',
                  message.from === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <Badge variant='outline'>
                  <Activity />
                  {emotionLabel || localize('Emotion', '情绪')}
                </Badge>
              </div>
            )
          }}
          renderMessageFooter={(message) => {
            const roomMessage = roomMessagesById.get(message.key)
            if (!roomMessage?.videoAnswer) return null
            return (
              <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                <Badge variant='outline'>
                  <Video />
                  {localize('Video answer', '视频回答')}
                </Badge>
              </div>
            )
          }}
          showSourceAction={false}
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

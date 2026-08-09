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
  Camera,
  Check,
  Flag,
  LoaderCircle,
  Mic,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlaygroundInput } from '@/features/playground/components/input/playground-input'
import {
  usePlaygroundOptions,
  usePlaygroundState,
} from '@/features/playground/hooks'
import { useAuthStore } from '@/stores/auth-store'

import type { TrainingConversationSessionContext } from '../conversation-workspace/api'
import {
  loadTrainingInsightsExpanded,
  saveTrainingInsightsExpanded,
} from '../conversation-workspace/insights-preference'
import {
  trainingCounterpartParticipant,
  trainingUserParticipant,
} from '../conversation-workspace/participant-identity'
import { TrainingConversationComposer } from '../conversation-workspace/training-conversation-composer'
import { TrainingConversationHeaderActions } from '../conversation-workspace/training-conversation-header-actions'
import { TrainingConversationInsights } from '../conversation-workspace/training-conversation-insights'
import type { TrainingConversationSession } from '../conversations/api'
import { RealtimeVoiceControl } from './realtime-training-panel'
import {
  completeTrainingRoomSession,
  sendTrainingRoomMessage,
  type TrainingRoomCompletionResult,
  type TrainingRoomMessage,
} from './training-room-client'
import { notifyTrainingRoomError } from './training-room-error-notification'
import type {
  TrainingRoomMediaControlHandle,
  TrainingRoomPrimaryActionIcon,
  TrainingRoomPrimaryActionState,
} from './training-room-media-control'
import { trainingRoomConversationMessages } from './training-room-message-adapter'
import { TrainingRoomTimeline } from './training-room-timeline'
import { TurnBasedVoicePanel } from './turn-based-voice-panel'
import { VideoAnswerPanel } from './video-answer-panel'

type RoomMode = 'voice' | 'video'

const ROOM_INPUT_CAPABILITIES = {
  attachments: false,
  search: false,
  parameters: false,
  clearMessages: false,
} as const

interface TrainingRoomConversationSurfaceProps {
  readonly apiBase: string
  readonly feedbackMode: TrainingConversationSession['feedbackMode']
  readonly headerActionsTarget?: HTMLDivElement | null
  readonly mode: RoomMode
  readonly interactionMode: TrainingConversationSession['interactionMode']
  readonly onCompletionConfirmed?: (
    result: TrainingRoomCompletionResult
  ) => void | Promise<void>
  readonly realtimeProfile: TrainingConversationSession['realtimeProfile']
  readonly realtimeProvider: string | null
  readonly roomId: string
  readonly trainingSession: TrainingConversationSessionContext
}

function TrainingRoomActionIcon({
  icon,
}: {
  readonly icon: TrainingRoomPrimaryActionIcon
}) {
  if (icon === 'camera') return <Camera />
  if (icon === 'check') return <Check />
  if (icon === 'loader') return <LoaderCircle className='animate-spin' />
  if (icon === 'mic') return <Mic />
  if (icon === 'play') return <Play />
  if (icon === 'rotate') return <RotateCcw />
  if (icon === 'square') return <Square />
  return <Send />
}

export function TrainingRoomConversationSurface({
  apiBase,
  feedbackMode,
  headerActionsTarget,
  interactionMode,
  mode,
  onCompletionConfirmed,
  realtimeProfile,
  realtimeProvider,
  roomId,
  trainingSession,
}: TrainingRoomConversationSurfaceProps) {
  const currentUser = useAuthStore((state) => state.auth.user)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [roomMessages, setRoomMessages] = useState<TrainingRoomMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isReplying, setIsReplying] = useState(false)
  const [isSendingText, setIsSendingText] = useState(false)
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false)
  const mediaControlRef = useRef<TrainingRoomMediaControlHandle | null>(null)
  const [mediaAction, setMediaAction] =
    useState<TrainingRoomPrimaryActionState | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [completionIntent, setCompletionIntent] = useState<
    'direct' | 'report' | null
  >(null)
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false)
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(false)
  const [isMobileInsightsOpen, setIsMobileInsightsOpen] = useState(false)
  const [isInsightsExpanded, setIsInsightsExpanded] = useState(() =>
    loadTrainingInsightsExpanded(
      typeof window === 'undefined' ? null : window.localStorage
    )
  )
  const { i18n, t } = useTranslation()
  const assistantParticipant = useMemo(
    () =>
      trainingCounterpartParticipant({
        metadata: trainingSession.metadata,
        title: trainingSession.title ?? '',
      }),
    [trainingSession.metadata, trainingSession.title]
  )
  const userParticipant = useMemo(
    () => trainingUserParticipant(currentUser),
    [currentUser]
  )
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const {
    config,
    groups,
    models,
    parameterEnabled,
    updateConfig,
    updateParameterEnabled,
    setGroups,
    setModels,
  } = usePlaygroundState()
  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    modelEndpointType: 'openai',
    preferredModel:
      typeof trainingSession.metadata?.llmModel === 'string'
        ? trainingSession.metadata.llmModel
        : 'doubao-seed-2-0-pro-260215',
    setGroups,
    setModels,
    updateConfig,
  })
  const insightMessages = useMemo(
    () =>
      trainingRoomConversationMessages(roomMessages, (isVideoAnswer) =>
        isVideoAnswer
          ? localize('Video answer submitted.', '视频回答已提交。')
          : localize('No message content.', '无消息内容。')
      ),
    [localize, roomMessages]
  )
  const selectedTailId = insightMessages.at(-1)?.publicId ?? null
  const refreshMessages = useCallback(() => {
    setRefreshVersion((current) => current + 1)
  }, [])
  const notifyComposerError = useCallback(
    (error: string | null) => {
      notifyTrainingRoomError(error, localize)
    },
    [localize]
  )

  const handleSendText = useCallback(
    async (content: string) => {
      if (
        trainingSession.status !== 'active' ||
        isSendingText ||
        isVoiceInputActive
      ) {
        return
      }
      setIsSendingText(true)
      try {
        await sendTrainingRoomMessage(roomId, trainingSession.sessionId, {
          content,
          metadata: {
            llm: { model: config.model },
            source: 'shared_training_composer',
            interactionMode,
            trainingMode: mode,
            trainingSessionId: trainingSession.sessionId,
            trainingVoiceId: trainingSession.metadata?.trainingVoiceId,
            trainingVoiceSpeed: trainingSession.metadata?.trainingVoiceSpeed,
            trainingVoiceLoudness:
              trainingSession.metadata?.trainingVoiceLoudness,
            trainingVoiceEmotion:
              trainingSession.metadata?.trainingVoiceEmotion,
            trainingVoiceEmotionScale:
              trainingSession.metadata?.trainingVoiceEmotionScale,
            trainingVoiceStyle: trainingSession.metadata?.trainingVoiceStyle,
          },
        })
        refreshMessages()
      } catch (error) {
        notifyComposerError(
          error instanceof Error
            ? error.message
            : localize('Message could not be sent.', '消息发送失败，请重试。')
        )
      } finally {
        setIsSendingText(false)
      }
    },
    [
      config.model,
      interactionMode,
      isSendingText,
      isVoiceInputActive,
      localize,
      mode,
      notifyComposerError,
      refreshMessages,
      roomId,
      trainingSession,
    ]
  )

  const handleCompleteTraining = useCallback(
    async (generateReport: boolean) => {
      if (trainingSession.status !== 'active' || completionIntent) return
      setCompletionIntent(generateReport ? 'report' : 'direct')
      setCompletionError(null)
      try {
        const result = await completeTrainingRoomSession(
          apiBase,
          trainingSession.sessionId,
          generateReport
        )
        await onCompletionConfirmed?.(result)
        setIsCompletionDialogOpen(false)
      } catch (error) {
        setCompletionError(
          error instanceof Error
            ? error.message
            : localize('Unable to finish training.', '无法结束本次训练。')
        )
      } finally {
        setCompletionIntent(null)
      }
    },
    [
      apiBase,
      completionIntent,
      localize,
      onCompletionConfirmed,
      trainingSession.sessionId,
      trainingSession.status,
    ]
  )

  useEffect(() => {
    setIsVoiceInputActive(false)
    setIsVideoPanelOpen(false)
  }, [interactionMode, mode, roomId, trainingSession.sessionId])

  useEffect(() => {
    saveTrainingInsightsExpanded(
      typeof window === 'undefined' ? null : window.localStorage,
      isInsightsExpanded
    )
  }, [isInsightsExpanded])

  const renderModeSupport = () => {
    if (mode === 'voice' && interactionMode === 'turn_based') {
      return (
        <TurnBasedVoicePanel
          apiBase={apiBase}
          disabled={trainingSession.status !== 'active'}
          model={config.model}
          onErrorChange={notifyComposerError}
          onMessagePersisted={refreshMessages}
          onPrimaryActionChange={setMediaAction}
          onVoiceInputStateChange={setIsVoiceInputActive}
          roomId={roomId}
          sessionId={trainingSession.sessionId}
          ref={mediaControlRef}
          showPrimaryAction={false}
          voiceMetadata={trainingSession.metadata}
        />
      )
    }
    if (mode === 'voice' && interactionMode === 'realtime') {
      return (
        <RealtimeVoiceControl
          apiBase={apiBase}
          disabled={trainingSession.status !== 'active'}
          onErrorChange={notifyComposerError}
          onMessagePersisted={refreshMessages}
          onPrimaryActionChange={setMediaAction}
          onVoiceInputStateChange={setIsVoiceInputActive}
          profile={realtimeProfile}
          provider={realtimeProvider || 'configured'}
          roomId={roomId}
          sessionId={trainingSession.sessionId}
          ref={mediaControlRef}
          showPrimaryAction={false}
        />
      )
    }
    if (mode === 'video') return null
    return (
      <Button
        aria-label={localize('Open camera controls', '打开摄像头控制')}
        aria-pressed={isVideoPanelOpen}
        disabled={trainingSession.status !== 'active'}
        size='icon-sm'
        type='button'
        variant={isVideoPanelOpen ? 'secondary' : 'ghost'}
        onClick={() => setIsVideoPanelOpen((current) => !current)}
      >
        <Video />
      </Button>
    )
  }

  const fallbackMediaAction: TrainingRoomPrimaryActionState = {
    active: false,
    disabled: true,
    icon: mode === 'video' ? 'camera' : 'mic',
    label:
      mode === 'video'
        ? localize('Enable camera', '开启摄像头')
        : localize('Voice input', '语音输入'),
    title: localize('Preparing media controls', '正在准备媒体控制'),
    tone: 'default',
  }
  const resolvedMediaAction = mediaAction ?? fallbackMediaAction
  const primaryAction = {
    active: resolvedMediaAction.active,
    disabled: resolvedMediaAction.disabled,
    icon: <TrainingRoomActionIcon icon={resolvedMediaAction.icon} />,
    label: resolvedMediaAction.label,
    onClick: () => mediaControlRef.current?.trigger(),
    title: resolvedMediaAction.title,
    tone: resolvedMediaAction.tone,
  } as const

  return (
    <div className='flex min-h-0 flex-1 overflow-hidden'>
      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <TrainingConversationHeaderActions
          desktopExpanded={isInsightsExpanded}
          onDesktopExpandedChange={setIsInsightsExpanded}
          onMobileOpenChange={setIsMobileInsightsOpen}
          target={headerActionsTarget}
        >
          {trainingSession.status === 'active' && (
            <Button
              disabled={completionIntent !== null}
              size='sm'
              variant='destructive'
              onClick={() => {
                setCompletionError(null)
                setIsCompletionDialogOpen(true)
              }}
            >
              <Flag />
              <span className='hidden sm:inline'>
                {localize('Finish training', '结束训练')}
              </span>
              <span className='sr-only sm:hidden'>
                {localize('Finish training', '结束训练')}
              </span>
            </Button>
          )}
          {trainingSession.status === 'completed' && (
            <Button
              aria-label={localize('Training completed', '训练已结束')}
              disabled
              size='sm'
              variant='outline'
            >
              <Check />
              <span className='hidden sm:inline'>
                {localize('Completed', '已结束')}
              </span>
              <span className='sr-only sm:hidden'>
                {localize('Completed', '已结束')}
              </span>
            </Button>
          )}
        </TrainingConversationHeaderActions>
        <TrainingRoomTimeline
          assistantParticipant={assistantParticipant}
          enableAudioOutput={mode === 'voice'}
          sessionActive={trainingSession.status === 'active'}
          onLoadingChange={setIsLoadingMessages}
          onMessagesChange={setRoomMessages}
          onReplyingChange={setIsReplying}
          headerActionsTarget={headerActionsTarget}
          refreshVersion={refreshVersion}
          roomId={roomId}
          sessionId={trainingSession.sessionId}
          userParticipant={userParticipant}
        />
        <TrainingConversationComposer>
          <PlaygroundInput
            capabilities={ROOM_INPUT_CAPABILITIES}
            compact
            config={config}
            disabled={trainingSession.status !== 'active'}
            disableTextInput
            groups={groups}
            groupValue={config.group}
            hasMessages={roomMessages.length > 0}
            isGenerating={isReplying}
            isModelLoading={isLoadingModels}
            modelValue={config.model}
            models={models}
            onConfigChange={updateConfig}
            onGroupChange={(value) => updateConfig('group', value)}
            onModelChange={(value) => updateConfig('model', value)}
            onParameterEnabledChange={updateParameterEnabled}
            onSubmit={handleSendText}
            parameterEnabled={parameterEnabled}
            extraActions={renderModeSupport()}
            hideModelSelector
            primaryAction={primaryAction}
            selectorPlacement='start'
          />
          {mode === 'video' && (
            <div className='mt-3 [&>section]:border-t-0'>
              <VideoAnswerPanel
                apiBase={apiBase}
                disabled={trainingSession.status !== 'active'}
                feedbackMode={feedbackMode}
                onPrimaryActionChange={setMediaAction}
                onPersisted={refreshMessages}
                ref={mediaControlRef}
                roomId={roomId}
                sessionId={trainingSession.sessionId}
                showPrimaryAction={false}
              />
            </div>
          )}
        </TrainingConversationComposer>
      </div>
      <TrainingConversationInsights
        desktopExpanded={isInsightsExpanded}
        isGenerating={isReplying}
        isLoadingConversation={isLoadingMessages}
        messages={insightMessages}
        mobileOpen={isMobileInsightsOpen}
        runtime='legacy_room'
        selectedTailId={selectedTailId}
        trainingApiBase={apiBase}
        trainingSession={trainingSession}
        onDesktopExpandedChange={setIsInsightsExpanded}
        onMobileOpenChange={setIsMobileInsightsOpen}
      />
      <Dialog
        open={isCompletionDialogOpen}
        onOpenChange={(open) => {
          if (completionIntent === null) setIsCompletionDialogOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {localize('Finish this training?', '结束本次训练？')}
            </DialogTitle>
            <DialogDescription>
              {localize(
                'Choose whether to generate a review or end the session directly.',
                '你可以结束并生成复盘，也可以直接结束本次训练。'
              )}
            </DialogDescription>
          </DialogHeader>
          {completionError && (
            <Alert variant='destructive'>
              <ShieldAlert />
              <AlertTitle>
                {localize('Unable to finish training', '无法结束训练')}
              </AlertTitle>
              <AlertDescription>{completionError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              disabled={completionIntent !== null}
              variant='outline'
              onClick={() => void handleCompleteTraining(false)}
            >
              {completionIntent === 'direct' ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Flag />
              )}
              {localize('End without review', '直接结束')}
            </Button>
            <Button
              disabled={completionIntent !== null}
              onClick={() => void handleCompleteTraining(true)}
            >
              {completionIntent === 'report' ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Flag />
              )}
              {localize('End and generate review', '结束并生成复盘')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

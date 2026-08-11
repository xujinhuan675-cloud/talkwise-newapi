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
import { useNavigate } from '@tanstack/react-router'
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
import { toast } from 'sonner'

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

import { trainingCompletionExitDestination } from '../completion-navigation'
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
import {
  TrainingDrillCorrectionGate,
  useTrainingDrillCorrection,
} from '../conversation-workspace/training-turn-correction'
import type { TrainingConversationSession } from '../conversations/api'
import { trainingFeedbackCompletionDescription } from '../training-feedback'
import {
  resolveTrainingProgress,
  trainingProgressIsInputLocked,
} from '../training-plan'
import { TrainingProgressIndicator } from '../training-progress'
import { RealtimeVoiceControl } from './realtime-training-panel'
import {
  completeTrainingRoomSession,
  LOW_LATENCY_REALTIME_REPLY_MODEL,
  sendTrainingRoomMessage,
  trainingRoomReplyModel,
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
  readonly onProgressChanged?: () => void | Promise<void>
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
  onProgressChanged,
  realtimeProfile,
  realtimeProvider,
  roomId,
  trainingSession,
}: TrainingRoomConversationSurfaceProps) {
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.auth.user)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [roomMessages, setRoomMessages] = useState<TrainingRoomMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isReplying, setIsReplying] = useState(false)
  const [isSendingText, setIsSendingText] = useState(false)
  const [pendingDrillReply, setPendingDrillReply] = useState<{
    readonly baselinePersonaMessageId: string | null
  } | null>(null)
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false)
  const [transcriptPreview, setTranscriptPreview] = useState<string | null>(
    null
  )
  const mediaControlRef = useRef<TrainingRoomMediaControlHandle | null>(null)
  const hardLimitPromptRef = useRef<string | null>(null)
  const [mediaAction, setMediaAction] =
    useState<TrainingRoomPrimaryActionState | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [completionIntent, setCompletionIntent] = useState<
    'direct' | 'report' | null
  >(null)
  const completionFeedbackDescription =
    trainingFeedbackCompletionDescription(feedbackMode)
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
    analyze: analyzeDrillDraft,
    clear: clearDrillCorrection,
    state: drillCorrectionState,
  } = useTrainingDrillCorrection({
    enabled: feedbackMode === 'drill',
    trainingApiBase: apiBase,
    trainingSession,
  })
  const drillDraftSourceRef = useRef<'realtime' | 'text' | 'turn_based' | null>(
    null
  )
  const sendInFlightRef = useRef(false)
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
    preferredModel: trainingRoomReplyModel(
      interactionMode,
      typeof trainingSession.metadata?.llmModel === 'string'
        ? trainingSession.metadata.llmModel
        : LOW_LATENCY_REALTIME_REPLY_MODEL
    ),
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
  const localLearnerTurnCount = roomMessages.filter(
    (message) => message.senderType === 'user'
  ).length
  const trainingProgress = useMemo(
    () =>
      resolveTrainingProgress(trainingSession.metadata, localLearnerTurnCount),
    [localLearnerTurnCount, trainingSession.metadata]
  )
  const trainingProgressInputLocked =
    trainingProgressIsInputLocked(trainingProgress)
  const baseTrainingInputLocked =
    trainingSession.status !== 'active' || trainingProgressInputLocked
  const trainingInputLocked =
    baseTrainingInputLocked || isSendingText || isReplying
  const selectedTailId = insightMessages.at(-1)?.publicId ?? null
  const latestPersonaMessageId =
    roomMessages
      .filter((message) => message.senderType === 'persona')
      .at(-1)?.id ?? null
  const realtimeDrillCapturePaused =
    feedbackMode === 'drill' &&
    (drillCorrectionState.status !== 'idle' ||
      pendingDrillReply !== null ||
      isSendingText ||
      isReplying)
  const refreshMessages = useCallback(() => {
    setRefreshVersion((current) => current + 1)
  }, [])
  const handleMessagePersisted = useCallback(() => {
    refreshMessages()
    void onProgressChanged?.()
  }, [onProgressChanged, refreshMessages])
  const notifyComposerError = useCallback(
    (error: string | null) => {
      notifyTrainingRoomError(error, localize)
    },
    [localize]
  )

  const sendAcceptedRoomMessage = useCallback(
    async (content: string, clientRequestId?: string): Promise<boolean> => {
      if (baseTrainingInputLocked || sendInFlightRef.current) {
        return false
      }
      sendInFlightRef.current = true
      setIsSendingText(true)
      try {
        await sendTrainingRoomMessage(roomId, trainingSession.sessionId, {
          content,
          metadata: {
            llm: {
              model: trainingRoomReplyModel(interactionMode, config.model),
            },
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
            ...(clientRequestId ? { clientRequestId } : {}),
          },
        })
        handleMessagePersisted()
        return true
      } catch (error) {
        notifyComposerError(
          error instanceof Error
            ? error.message
            : localize('Message could not be sent.', '消息发送失败，请重试。')
        )
        return false
      } finally {
        sendInFlightRef.current = false
        setIsSendingText(false)
      }
    },
    [
      config.model,
      interactionMode,
      localize,
      mode,
      notifyComposerError,
      handleMessagePersisted,
      roomId,
      trainingSession,
      baseTrainingInputLocked,
    ]
  )

  const beginDrillDraft = useCallback(
    (content: string, source: 'realtime' | 'text' | 'turn_based') => {
      drillDraftSourceRef.current = source
      void analyzeDrillDraft(content, insightMessages)
    },
    [analyzeDrillDraft, insightMessages]
  )

  const handleSendText = useCallback(
    (content: string) => {
      if (trainingInputLocked || isVoiceInputActive) return
      if (feedbackMode === 'drill') {
        beginDrillDraft(content, 'text')
        return
      }
      void sendAcceptedRoomMessage(content)
    },
    [
      beginDrillDraft,
      feedbackMode,
      isVoiceInputActive,
      sendAcceptedRoomMessage,
      trainingInputLocked,
    ]
  )

  const handleAcceptDrillDraft = useCallback(async () => {
    if (
      drillCorrectionState.status === 'idle' ||
      baseTrainingInputLocked ||
      sendInFlightRef.current
    ) {
      return
    }
    const content = drillCorrectionState.draftText
    setPendingDrillReply({
      baselinePersonaMessageId: latestPersonaMessageId,
    })
    const sent = await sendAcceptedRoomMessage(
      content,
      `training-drill:${trainingSession.sessionId}:${drillCorrectionState.draftId}`
    )
    if (!sent) {
      setPendingDrillReply(null)
      return
    }
    drillDraftSourceRef.current = null
    clearDrillCorrection()
  }, [
    baseTrainingInputLocked,
    clearDrillCorrection,
    drillCorrectionState,
    latestPersonaMessageId,
    sendAcceptedRoomMessage,
    trainingSession.sessionId,
  ])

  const handleRetryDrillDraft = useCallback(() => {
    const source = drillDraftSourceRef.current
    drillDraftSourceRef.current = null
    setPendingDrillReply(null)
    clearDrillCorrection()
    if (source === 'turn_based') {
      window.setTimeout(() => mediaControlRef.current?.trigger(), 0)
    }
  }, [clearDrillCorrection])

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
        try {
          await onCompletionConfirmed?.(result)
        } catch {
          toast.error(
            localize(
              'Training finished, but the latest session state could not be refreshed.',
              '训练已结束，但暂时无法刷新最新会话状态。'
            )
          )
        }
        const destination = trainingCompletionExitDestination(
          generateReport,
          result.sessionId
        )
        if (destination.kind === 'review') {
          await navigate({
            to: destination.to,
            params: destination.params,
          })
        } else {
          await navigate({ to: destination.to })
        }
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
      navigate,
      onCompletionConfirmed,
      trainingSession.sessionId,
      trainingSession.status,
    ]
  )

  useEffect(() => {
    hardLimitPromptRef.current = null
    setIsVoiceInputActive(false)
    setTranscriptPreview(null)
    setPendingDrillReply(null)
    setIsVideoPanelOpen(false)
    drillDraftSourceRef.current = null
  }, [interactionMode, mode, roomId, trainingSession.sessionId])

  useEffect(() => {
    if (
      pendingDrillReply !== null &&
      latestPersonaMessageId !== null &&
      latestPersonaMessageId !== pendingDrillReply.baselinePersonaMessageId
    ) {
      setPendingDrillReply(null)
    }
  }, [latestPersonaMessageId, pendingDrillReply])

  useEffect(() => {
    if (
      trainingSession.status !== 'active' ||
      trainingProgress?.state !== 'hard_limit_reached'
    ) {
      return
    }
    const promptKey = `${trainingSession.sessionId}:${trainingProgress.learnerTurnCount}`
    if (hardLimitPromptRef.current === promptKey) return
    hardLimitPromptRef.current = promptKey
    setCompletionError(null)
    setIsCompletionDialogOpen(true)
  }, [trainingProgress, trainingSession.sessionId, trainingSession.status])

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
          disabled={trainingInputLocked}
          drillMode={feedbackMode === 'drill'}
          model={config.model}
          onDrillDraft={(text) => beginDrillDraft(text, 'turn_based')}
          onErrorChange={notifyComposerError}
          onMessagePersisted={handleMessagePersisted}
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
          capturePaused={realtimeDrillCapturePaused}
          disabled={baseTrainingInputLocked}
          drillMode={feedbackMode === 'drill'}
          onErrorChange={notifyComposerError}
          onDrillDraft={(text) => beginDrillDraft(text, 'realtime')}
          onMessagePersisted={handleMessagePersisted}
          onTranscriptPreviewChange={setTranscriptPreview}
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
        disabled={trainingInputLocked}
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
        {trainingProgress && (
          <TrainingProgressIndicator
            localize={localize}
            progress={trainingProgress}
          />
        )}
        <TrainingRoomTimeline
          assistantParticipant={assistantParticipant}
          enableAudioOutput={mode === 'voice'}
          sessionActive={trainingSession.status === 'active'}
          onLoadingChange={setIsLoadingMessages}
          onMessagesChange={setRoomMessages}
          onReplyingChange={setIsReplying}
          transcriptPreview={transcriptPreview}
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
            disabled={trainingInputLocked}
            disableTextInput={feedbackMode !== 'drill'}
            groups={groups}
            groupValue={config.group}
            hasMessages={roomMessages.length > 0}
            isGenerating={isReplying}
            isModelLoading={isLoadingModels}
            leadingContent={
              feedbackMode === 'drill' ? (
                <TrainingDrillCorrectionGate
                  disabled={isSendingText}
                  state={drillCorrectionState}
                  language={i18n.resolvedLanguage ?? i18n.language}
                  localize={localize}
                  onAccept={handleAcceptDrillDraft}
                  onRetry={handleRetryDrillDraft}
                />
              ) : null
            }
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
                disabled={trainingInputLocked}
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
        feedbackMode={feedbackMode}
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
                `${completionFeedbackDescription.english} Choose whether to generate it now or end without a review.`,
                `${completionFeedbackDescription.chinese} 你可以现在生成复盘，也可以不生成复盘直接结束。`
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
              {completionIntent === 'direct'
                ? localize('Ending...', '正在结束…')
                : localize('End without review', '直接结束')}
            </Button>
            <Button
              disabled={completionIntent !== null}
              onClick={() => void handleCompleteTraining(true)}
            >
              {completionIntent === 'report'
                ? localize('Ending...', '正在结束…')
                : localize('End and review', '结束并复盘')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

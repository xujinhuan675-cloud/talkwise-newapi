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
import { Flag, LoaderCircle, Radio, ShieldAlert, Video } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { RealtimeTrainingPanel } from './realtime-training-panel'
import {
  completeTrainingRoomSession,
  sendTrainingRoomMessage,
  type TrainingRoomCompletionResult,
  type TrainingRoomMessage,
} from './training-room-client'
import { trainingRoomConversationMessages } from './training-room-message-adapter'
import { TrainingRoomTimeline } from './training-room-timeline'
import { TurnBasedVoicePanel } from './turn-based-voice-panel'
import { VideoAnswerPanel } from './video-answer-panel'

type RoomMode = Exclude<TrainingConversationSession['mode'], 'text'>

const ROOM_INPUT_CAPABILITIES = {
  attachments: false,
  search: false,
  parameters: false,
  clearMessages: false,
} as const

type RoomModePanel = Exclude<RoomMode, 'voice'> | null

interface TrainingRoomConversationSurfaceProps {
  readonly apiBase: string
  readonly feedbackMode: TrainingConversationSession['feedbackMode']
  readonly headerActionsTarget?: HTMLDivElement | null
  readonly mode: RoomMode
  readonly onCompletionConfirmed?: (
    result: TrainingRoomCompletionResult
  ) => void | Promise<void>
  readonly realtimeProfile: TrainingConversationSession['realtimeProfile']
  readonly realtimeProvider: string | null
  readonly roomId: string
  readonly trainingSession: TrainingConversationSessionContext
}

export function TrainingRoomConversationSurface({
  apiBase,
  feedbackMode,
  headerActionsTarget,
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
  const [sendError, setSendError] = useState<string | null>(null)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [completionIntent, setCompletionIntent] = useState<
    'direct' | 'report' | null
  >(null)
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false)
  const [openModePanel, setOpenModePanel] = useState<RoomModePanel>(null)
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
    preferredModel: 'doubao-seed-2-0-pro-260215',
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
  let modeActionEnglish = 'Open realtime voice controls'
  let modeActionChinese = '打开实时语音控制'
  if (mode === 'video') {
    modeActionEnglish = 'Open camera controls'
    modeActionChinese = '打开摄像头控制'
  }
  const refreshMessages = useCallback(() => {
    setRefreshVersion((current) => current + 1)
  }, [])

  const handleSendText = useCallback(
    async (content: string) => {
      if (trainingSession.status !== 'active' || isSendingText) return
      setIsSendingText(true)
      setSendError(null)
      try {
        await sendTrainingRoomMessage(roomId, trainingSession.sessionId, {
          content,
          metadata: {
            interactionMode: 'turn_based',
            source: 'shared_training_composer',
            trainingMode: mode,
            trainingSessionId: trainingSession.sessionId,
          },
        })
        refreshMessages()
      } catch (error) {
        setSendError(
          error instanceof Error
            ? error.message
            : localize('Message could not be sent.', '消息发送失败，请重试。')
        )
      } finally {
        setIsSendingText(false)
      }
    },
    [isSendingText, localize, mode, refreshMessages, roomId, trainingSession]
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
    setOpenModePanel(null)
    setSendError(null)
  }, [mode, roomId, trainingSession.sessionId])

  useEffect(() => {
    saveTrainingInsightsExpanded(
      typeof window === 'undefined' ? null : window.localStorage,
      isInsightsExpanded
    )
  }, [isInsightsExpanded])

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
        </TrainingConversationHeaderActions>
        <TrainingRoomTimeline
          assistantParticipant={assistantParticipant}
          enableAudioOutput={mode === 'voice'}
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
            disabled={
              trainingSession.status !== 'active' || isSendingText || isReplying
            }
            groups={groups}
            groupValue={config.group}
            hasMessages={roomMessages.length > 0}
            isGenerating={isReplying || isSendingText}
            isModelLoading={isLoadingModels}
            modelValue={config.model}
            models={models}
            onConfigChange={updateConfig}
            onGroupChange={(value) => updateConfig('group', value)}
            onModelChange={(value) => updateConfig('model', value)}
            onParameterEnabledChange={updateParameterEnabled}
            onSubmit={handleSendText}
            parameterEnabled={parameterEnabled}
            extraActions={
              mode === 'voice' ? (
                <TurnBasedVoicePanel
                  apiBase={apiBase}
                  disabled={trainingSession.status !== 'active'}
                  onMessagePersisted={refreshMessages}
                  roomId={roomId}
                  sessionId={trainingSession.sessionId}
                />
              ) : (
                <Button
                  aria-label={localize(modeActionEnglish, modeActionChinese)}
                  aria-pressed={openModePanel === mode}
                  disabled={trainingSession.status !== 'active'}
                  size='icon-sm'
                  type='button'
                  variant={openModePanel === mode ? 'secondary' : 'ghost'}
                  onClick={() =>
                    setOpenModePanel((current) =>
                      current === mode ? null : mode
                    )
                  }
                >
                  {mode === 'video' && <Video />}
                  {mode === 'realtime' && <Radio />}
                </Button>
              )
            }
          />
          {sendError && (
            <Alert className='mt-3' variant='destructive'>
              <AlertDescription>{sendError}</AlertDescription>
            </Alert>
          )}
          {openModePanel && (
            <div className='mt-3 [&>section]:border-t-0'>
              {mode === 'video' && (
                <VideoAnswerPanel
                  apiBase={apiBase}
                  disabled={trainingSession.status !== 'active'}
                  feedbackMode={feedbackMode}
                  onPersisted={refreshMessages}
                  roomId={roomId}
                  sessionId={trainingSession.sessionId}
                />
              )}
              {mode === 'realtime' && (
                <RealtimeTrainingPanel
                  apiBase={apiBase}
                  profile={realtimeProfile}
                  provider={realtimeProvider || 'configured'}
                  roomId={roomId}
                  sessionId={trainingSession.sessionId}
                />
              )}
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
              onClick={() => setIsCompletionDialogOpen(false)}
            >
              {localize('Cancel', '取消')}
            </Button>
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

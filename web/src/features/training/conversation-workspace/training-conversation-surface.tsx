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
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Flag,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  Branch,
  BranchMessages,
  BranchNext,
  BranchPage,
  BranchPrevious,
  BranchSelector,
} from '@/components/ai-elements/branch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlaygroundChat } from '@/features/playground/components/chat/playground-chat'
import { PlaygroundInput } from '@/features/playground/components/input/playground-input'
import {
  usePlaygroundOptions,
  usePlaygroundState,
} from '@/features/playground/hooks'
import {
  completeAssistantMessage,
  createLoadingAssistantMessage,
  createUserMessage,
  processStreamingContent,
} from '@/features/playground/lib'
import type { Message } from '@/features/playground/types'
import { useAuthStore } from '@/stores/auth-store'

import { resolveBattlePrepPlan } from '../training-plan'
import {
  completeTrainingConversationSession,
  editTrainingConversationMessage,
  forkTrainingSessionConversation,
  loadTrainingConversationMessages,
  loadTrainingConversationReportSummary,
  selectTrainingConversationBranch as authorizeTrainingConversationBranch,
  sendTrainingConversationMessage,
  TrainingConversationApiError,
  type TrainingConversationCompletionResult,
  type TrainingConversationMessage,
  type TrainingConversationReportSummary,
  type TrainingConversationForkOption,
  type TrainingConversationSessionContext,
  type TrainingSessionConversationForkResult,
} from './api'
import {
  projectTrainingConversationTree,
  selectTrainingConversationBranch,
  type TrainingConversationBranchStep,
  type TrainingConversationTreeProjection,
} from './branch-model'
import {
  loadTrainingInsightsExpanded,
  saveTrainingInsightsExpanded,
} from './insights-preference'
import {
  trainingCounterpartParticipant,
  trainingUserParticipant,
} from './participant-identity'
import { TrainingConversationComposer } from './training-conversation-composer'
import { TrainingConversationHeaderActions } from './training-conversation-header-actions'
import { TrainingConversationInsights } from './training-conversation-insights'

export type { TrainingConversationSessionContext } from './api'

type MessageRecord = {
  message: TrainingConversationMessage
  key: string
}

export interface TrainingConversationSurfaceProps {
  readonly conversationId: string
  readonly headerActionsTarget?: HTMLElement | null
  readonly onCompletionConfirmed: (
    result: TrainingConversationCompletionResult
  ) => void | Promise<void>
  readonly onForkCreated: (
    result: TrainingSessionConversationForkResult
  ) => void | Promise<void>
  readonly onSelectedTailChange: (messageId: string | null) => void
  readonly selectedTailId?: string
  readonly trainingApiBase: string
  readonly trainingSession: TrainingConversationSessionContext
}

const EMPTY_TREE_PROJECTION: TrainingConversationTreeProjection = {
  path: [],
  selectedTailId: null,
  branchSteps: [],
  excludedMessageIds: [],
}

const DEFAULT_TRAINING_TEXT_MODEL = 'doubao-seed-2-0-pro-260215'
const TRAINING_INPUT_CAPABILITIES = {
  attachments: false,
  search: false,
  parameters: false,
  clearMessages: false,
} as const

function metadataRecord(
  value: unknown
): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

function metadataText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function selectedTailFromSession(
  session: TrainingConversationSessionContext
): string | null {
  const selectedPath = metadataRecord(
    session.metadata?.selectedPath ?? session.metadata?.selected_path
  )
  const currentTail = metadataRecord(
    session.metadata?.currentBranchTail ?? session.metadata?.current_branch_tail
  )
  return (
    metadataText(
      selectedPath?.tailMessageId ?? selectedPath?.tail_message_id
    ) ?? metadataText(currentTail?.messageId ?? currentTail?.message_id)
  )
}

function TrainingMessageBranchSelector({
  disabled,
  messageRole,
  onSelect,
  pending,
  step,
}: {
  readonly disabled: boolean
  readonly messageRole: Message['from']
  readonly onSelect: (messageId: string) => void
  readonly pending: boolean
  readonly step: TrainingConversationBranchStep
}) {
  const selectedIndex = Math.max(
    0,
    step.options.findIndex((option) => option.selected)
  )

  return (
    <Branch
      className='mt-1 gap-0'
      currentBranch={selectedIndex}
      onBranchChange={(branchIndex) => {
        const option = step.options[branchIndex]
        if (option) onSelect(option.message.publicId)
      }}
    >
      <BranchMessages className='hidden'>
        {step.options.map((option) => (
          <span key={option.message.publicId} />
        ))}
      </BranchMessages>
      <BranchSelector className='px-0' from={messageRole}>
        <BranchPrevious disabled={disabled} />
        {pending ? (
          <LoaderCircle className='text-muted-foreground size-3.5 animate-spin' />
        ) : (
          <BranchPage />
        )}
        <BranchNext disabled={disabled} />
      </BranchSelector>
    </Branch>
  )
}

function createdAtToMillis(value: string | null): number | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function toPlaygroundMessage(message: TrainingConversationMessage): Message {
  return {
    key: message.publicId,
    from: message.role,
    versions: [{ id: message.publicId, content: message.content }],
    createdAt: createdAtToMillis(message.createdAt),
    completedAt: createdAtToMillis(message.createdAt),
    isContentComplete: true,
    status: 'complete',
  }
}

function updateMessageContent(message: Message, content: string): Message {
  return {
    ...message,
    versions: message.versions.map((version, index) =>
      index === 0 ? { ...version, content } : version
    ),
  }
}

function lastPersistedMessage(
  messages: Message[],
  records: Map<string, MessageRecord>
): TrainingConversationMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const record = records.get(messages[index].key)
    if (record) return record.message
  }
  return null
}

function retrySource(
  messages: Message[],
  records: Map<string, MessageRecord>,
  target: Message
): {
  content: string
  parentMessageId: string | null
  branchId: string | null
} | null {
  const targetIndex = messages.findIndex(
    (message) => message.key === target.key
  )
  if (targetIndex < 0) return null

  const source =
    target.from === 'user'
      ? target
      : messages
          .slice(0, targetIndex)
          .reverse()
          .find((message) => message.from === 'user')
  if (!source) return null

  const record = records.get(source.key)?.message
  if (!record) return null
  return {
    content: source.versions[0]?.content ?? '',
    parentMessageId: record.parentMessageId,
    branchId: record.branchId,
  }
}

function trainingConversationErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Training conversation request failed.'
}

function CompletionReportIcon({
  status,
}: {
  readonly status: TrainingConversationCompletionResult['reportStatus']
}) {
  if (status === 'pending') return <Clock3 />
  if (status === 'failed') return <TriangleAlert />
  return <CheckCircle2 />
}

export function TrainingConversationSurface({
  conversationId,
  headerActionsTarget,
  onCompletionConfirmed,
  onForkCreated,
  onSelectedTailChange,
  selectedTailId,
  trainingApiBase,
  trainingSession,
}: TrainingConversationSurfaceProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.auth.user)
  const {
    config,
    parameterEnabled,
    messages,
    isLoadingMessages,
    models,
    groups,
    updateMessages,
    setModels,
    setGroups,
    updateConfig,
    updateParameterEnabled,
  } = usePlaygroundState()
  const [isLoadingConversation, setIsLoadingConversation] = useState(true)
  const [loadedConversationId, setLoadedConversationId] = useState<
    string | null
  >(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [forkTarget, setForkTarget] =
    useState<TrainingConversationMessage | null>(null)
  const [forkTitle, setForkTitle] = useState('')
  const [forkOption, setForkOption] =
    useState<TrainingConversationForkOption>('directPath')
  const [isForking, setIsForking] = useState(false)
  const [isMobileInsightsOpen, setIsMobileInsightsOpen] = useState(false)
  const [isInsightsExpanded, setIsInsightsExpanded] = useState(() =>
    loadTrainingInsightsExpanded(
      typeof window === 'undefined' ? null : window.localStorage
    )
  )
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [completionIntent, setCompletionIntent] = useState<
    'direct' | 'report' | null
  >(null)
  const [completionError, setCompletionError] = useState<unknown>(null)
  const [completionResult, setCompletionResult] =
    useState<TrainingConversationCompletionResult | null>(null)
  const [battleSheet, setBattleSheet] =
    useState<TrainingConversationReportSummary | null>(null)
  const [battleSheetError, setBattleSheetError] = useState<unknown>(null)
  const [pendingBranchMessageId, setPendingBranchMessageId] = useState<
    string | null
  >(null)
  const [treeProjection, setTreeProjection] =
    useState<TrainingConversationTreeProjection>(EMPTY_TREE_PROJECTION)
  const messagesRef = useRef(messages)
  const messageRecordsRef = useRef(new Map<string, MessageRecord>())
  const persistedMessagesRef = useRef<TrainingConversationMessage[]>([])
  const selectedTailIdRef = useRef<string | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const initialSelectedTailId =
    selectedTailId?.trim() || selectedTailFromSession(trainingSession)
  const battlePlan = useMemo(
    () => resolveBattlePrepPlan(trainingSession.metadata),
    [trainingSession.metadata]
  )
  const assistantParticipant = useMemo(
    () => trainingCounterpartParticipant(trainingSession),
    [trainingSession]
  )
  const userParticipant = useMemo(
    () => trainingUserParticipant(currentUser),
    [currentUser]
  )
  const completedBattleTurns = battlePlan
    ? treeProjection.path.filter((message) => message.role === 'user').length
    : 0
  const remainingBattleTurns = battlePlan
    ? Math.max(0, battlePlan.turnBudget - completedBattleTurns)
    : 0
  const battleTurnLimitReached = Boolean(
    battlePlan && completedBattleTurns >= battlePlan.turnBudget
  )
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    setIsCompletionDialogOpen(false)
    setCompletionError(null)
    setCompletionResult(null)
    setBattleSheet(null)
    setBattleSheetError(null)
  }, [trainingSession.sessionId])

  useEffect(() => {
    saveTrainingInsightsExpanded(
      typeof window === 'undefined' ? null : window.localStorage,
      isInsightsExpanded
    )
  }, [isInsightsExpanded])

  const replaceMessages = useCallback(
    (nextMessages: Message[]) => {
      messagesRef.current = nextMessages
      updateMessages(nextMessages)
    },
    [updateMessages]
  )

  const mutateMessages = useCallback(
    (updater: (current: Message[]) => Message[]) => {
      updateMessages((current) => {
        const next = updater(current)
        messagesRef.current = next
        return next
      })
    },
    [updateMessages]
  )

  const applyLoadedMessages = useCallback(
    (
      loaded: TrainingConversationMessage[],
      preferredTailId?: string | null
    ) => {
      const projection = projectTrainingConversationTree(
        loaded,
        preferredTailId
      )
      persistedMessagesRef.current = loaded
      selectedTailIdRef.current = projection.selectedTailId
      messageRecordsRef.current = new Map(
        loaded.map((message) => [
          message.publicId,
          { key: message.publicId, message },
        ])
      )
      setTreeProjection(projection)
      replaceMessages(projection.path.map(toPlaygroundMessage))
      if (projection.selectedTailId !== (selectedTailId?.trim() || null)) {
        onSelectedTailChange(projection.selectedTailId)
      }
    },
    [onSelectedTailChange, replaceMessages, selectedTailId]
  )

  const refreshConversation = useCallback(
    async (signal?: AbortSignal, preferredTailId?: string | null) => {
      const loaded = await loadTrainingConversationMessages(
        conversationId,
        signal
      )
      applyLoadedMessages(loaded, preferredTailId)
    },
    [applyLoadedMessages, conversationId]
  )

  useEffect(() => {
    if (isLoadingMessages) return

    const controller = new AbortController()
    setIsLoadingConversation(true)
    setLoadedConversationId(null)
    void refreshConversation(controller.signal, initialSelectedTailId)
      .then(() => {
        if (!controller.signal.aborted) setLoadedConversationId(conversationId)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          toast.error(trainingConversationErrorMessage(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingConversation(false)
      })

    return () => controller.abort()
  }, [
    conversationId,
    initialSelectedTailId,
    isLoadingMessages,
    refreshConversation,
  ])

  useEffect(
    () => () => {
      streamAbortRef.current?.abort()
    },
    []
  )

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    modelEndpointType: 'openai',
    preferredModel: DEFAULT_TRAINING_TEXT_MODEL,
    setGroups,
    setModels,
    updateConfig,
  })

  const startStream = useCallback(
    async (
      text: string,
      options?: { branchId?: string | null; parentMessageId?: string | null }
    ) => {
      const content = text.trim()
      if (
        !content ||
        streamAbortRef.current ||
        trainingSession.status !== 'active'
      ) {
        return
      }

      const userKey = `local-user-${nanoid()}`
      const assistantKey = `local-assistant-${nanoid()}`
      const createdAt = Date.now()
      const controller = new AbortController()
      let didComplete = false
      let streamError: string | null = null

      streamAbortRef.current = controller
      setIsGenerating(true)
      mutateMessages((current) =>
        [
          ...current,
          createUserMessage(content, createdAt),
          createLoadingAssistantMessage(createdAt),
        ].map((message, index, appended) => {
          if (index === appended.length - 2) return { ...message, key: userKey }
          if (index === appended.length - 1) {
            return { ...message, key: assistantKey }
          }
          return message
        })
      )

      try {
        await sendTrainingConversationMessage(
          conversationId,
          {
            message: content,
            session: trainingSession,
            parentMessageId: options?.parentMessageId,
            branchId: options?.branchId,
            model: config.model,
            temperature: parameterEnabled.temperature
              ? config.temperature
              : undefined,
            maxTokens: parameterEnabled.max_tokens
              ? config.max_tokens
              : undefined,
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === 'message_created') {
                const message: TrainingConversationMessage = {
                  publicId: event.publicId,
                  role: 'user',
                  content,
                  parentMessageId: event.parentMessageId,
                  branchId: event.branchId,
                  createdAt: null,
                }
                messageRecordsRef.current.set(event.publicId, {
                  key: event.publicId,
                  message,
                })
                persistedMessagesRef.current = [
                  ...persistedMessagesRef.current,
                  message,
                ]
                mutateMessages((current) =>
                  current.map((item) =>
                    item.key === userKey
                      ? { ...item, key: event.publicId }
                      : item
                  )
                )
                return
              }

              if (event.type === 'message_delta') {
                mutateMessages((current) =>
                  current.map((item) =>
                    item.key === assistantKey
                      ? processStreamingContent(item, event.content)
                      : item
                  )
                )
                return
              }

              if (event.type === 'message_complete') {
                didComplete = true
                const message: TrainingConversationMessage = {
                  publicId: event.publicId,
                  role: 'assistant',
                  content: event.content,
                  parentMessageId: event.parentMessageId,
                  branchId: event.branchId,
                  createdAt: null,
                }
                messageRecordsRef.current.set(event.publicId, {
                  key: event.publicId,
                  message,
                })
                const persistedMessages = [
                  ...persistedMessagesRef.current,
                  message,
                ]
                applyLoadedMessages(persistedMessages, event.publicId)
                mutateMessages((current) =>
                  current.map((item) =>
                    item.key === event.publicId
                      ? completeAssistantMessage(
                          updateMessageContent(item, event.content)
                        )
                      : item
                  )
                )
                return
              }

              if (event.type === 'error') {
                streamError = event.message
                mutateMessages((current) =>
                  current.map((item) =>
                    item.key === assistantKey
                      ? {
                          ...item,
                          status: 'error',
                          isContentComplete: true,
                          versions: [{ id: item.key, content: event.message }],
                        }
                      : item
                  )
                )
              }
            },
          }
        )

        if (streamError && !controller.signal.aborted) {
          throw new Error(streamError)
        }
        if (!didComplete && !controller.signal.aborted) {
          throw new Error('Training response ended before completion.')
        }
      } catch (error) {
        const message = controller.signal.aborted
          ? 'Generation stopped before the response was completed.'
          : trainingConversationErrorMessage(error)
        mutateMessages((current) =>
          current.map((item) =>
            item.key === assistantKey
              ? {
                  ...item,
                  status: 'error',
                  isContentComplete: true,
                  versions: [{ id: item.key, content: message }],
                }
              : item
          )
        )
        if (!controller.signal.aborted) toast.error(message)
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null
          setIsGenerating(false)
        }
      }
    },
    [
      config.max_tokens,
      config.model,
      config.temperature,
      conversationId,
      applyLoadedMessages,
      mutateMessages,
      parameterEnabled.max_tokens,
      parameterEnabled.temperature,
      trainingSession,
    ]
  )

  const handleSendMessage = useCallback(
    (text: string) => {
      if (battleTurnLimitReached) return
      const tail = lastPersistedMessage(
        messagesRef.current,
        messageRecordsRef.current
      )
      void startStream(text, {
        parentMessageId: tail?.publicId,
        branchId: tail?.branchId,
      })
    },
    [battleTurnLimitReached, startStream]
  )

  const handleRegenerateMessage = useCallback(
    (message: Message) => {
      const source = retrySource(
        messagesRef.current,
        messageRecordsRef.current,
        message
      )
      if (!source?.content.trim()) return
      void startStream(source.content, source)
    },
    [startStream]
  )

  const handleSaveEdit = useCallback(
    (content: string) => {
      const messageKey = editingMessageKey
      const source = messageKey
        ? messageRecordsRef.current.get(messageKey)?.message
        : null
      if (!source || !messageKey) return

      setIsSavingEdit(true)
      void editTrainingConversationMessage(
        conversationId,
        source.publicId,
        content,
        trainingSession
      )
        .then(async (result) => {
          const selectedMessageId =
            result.message?.publicId ?? result.path.at(-1)?.publicId ?? null
          await refreshConversation(undefined, selectedMessageId)
          setEditingMessageKey(null)
        })
        .catch((error: unknown) =>
          toast.error(trainingConversationErrorMessage(error))
        )
        .finally(() => setIsSavingEdit(false))
    },
    [conversationId, editingMessageKey, refreshConversation, trainingSession]
  )

  const handleSelectBranch = useCallback(
    (selectedMessageId: string) => {
      if (pendingBranchMessageId || isGenerating || isSavingEdit) return
      const nextProjection = selectTrainingConversationBranch(
        persistedMessagesRef.current,
        selectedTailIdRef.current,
        selectedMessageId
      )
      if (nextProjection.selectedTailId === selectedTailIdRef.current) return

      setPendingBranchMessageId(selectedMessageId)
      void authorizeTrainingConversationBranch(
        conversationId,
        selectedMessageId
      )
        .then((result) => {
          if (result.message?.publicId !== selectedMessageId) {
            throw new Error('Selected branch was not confirmed by the server.')
          }
          selectedTailIdRef.current = nextProjection.selectedTailId
          messageRecordsRef.current = new Map(
            persistedMessagesRef.current.map((message) => [
              message.publicId,
              { key: message.publicId, message },
            ])
          )
          setEditingMessageKey(null)
          setTreeProjection(nextProjection)
          replaceMessages(nextProjection.path.map(toPlaygroundMessage))
          onSelectedTailChange(nextProjection.selectedTailId)
        })
        .catch((error: unknown) =>
          toast.error(trainingConversationErrorMessage(error))
        )
        .finally(() => setPendingBranchMessageId(null))
    },
    [
      conversationId,
      isGenerating,
      isSavingEdit,
      pendingBranchMessageId,
      onSelectedTailChange,
      replaceMessages,
    ]
  )

  const handleOpenFork = useCallback((message: Message) => {
    const persisted = messageRecordsRef.current.get(message.key)?.message
    if (!persisted) return
    setForkTitle('')
    setForkOption('directPath')
    setForkTarget(persisted)
  }, [])

  const handleFork = useCallback(() => {
    if (!forkTarget || isForking) return
    setIsForking(true)
    void forkTrainingSessionConversation(trainingApiBase, forkTarget.publicId, {
      session: trainingSession,
      title: forkTitle,
      option: forkOption,
    })
      .then(async (result) => {
        await onForkCreated(result)
        setForkTarget(null)
        toast.success(
          localize('Forked training session created.', '已创建分支训练会话。')
        )
      })
      .catch((error: unknown) =>
        toast.error(trainingConversationErrorMessage(error))
      )
      .finally(() => setIsForking(false))
  }, [
    forkOption,
    forkTarget,
    forkTitle,
    isForking,
    localize,
    onForkCreated,
    trainingApiBase,
    trainingSession,
  ])

  const openSessionReview = useCallback(() => {
    void navigate({
      to: '/training/sessions/$sessionId',
      params: { sessionId: trainingSession.sessionId },
    })
  }, [navigate, trainingSession.sessionId])

  const handleCompleteTraining = useCallback(
    (generateReport: boolean) => {
      const selectedTail = treeProjection.selectedTailId?.trim()
      if (
        !selectedTail ||
        isCompleting ||
        trainingSession.status !== 'active'
      ) {
        return
      }

      setIsCompleting(true)
      setCompletionIntent(generateReport ? 'report' : 'direct')
      setCompletionError(null)
      void completeTrainingConversationSession(
        trainingApiBase,
        trainingSession,
        conversationId,
        selectedTail,
        generateReport
      )
        .then(async (result) => {
          setCompletionResult(result)
          try {
            await onCompletionConfirmed(result)
          } catch {
            toast.error(
              localize(
                'Training finished, but the latest session state could not be refreshed.',
                '训练已结束，但暂时无法刷新最新会话状态。'
              )
            )
          }

          if (result.reportStatus === 'ready' && battlePlan) {
            try {
              const report = await loadTrainingConversationReportSummary(
                trainingApiBase,
                trainingSession.sessionId
              )
              setBattleSheet(report)
              toast.success(
                localize(
                  'Battle preparation finished. Your briefing card is ready.',
                  '备战已结束，速记卡已生成。'
                )
              )
            } catch (error: unknown) {
              setBattleSheetError(error)
            }
          } else if (result.reportStatus === 'ready') {
            toast.success(
              localize(
                'Training finished. Opening the review.',
                '训练已结束，正在打开复盘。'
              )
            )
            openSessionReview()
          } else if (result.reportStatus === 'skipped') {
            toast.success(
              localize(
                'Training ended without generating a review.',
                '训练已直接结束，未生成复盘。'
              )
            )
          }
        })
        .catch((error: unknown) => setCompletionError(error))
        .finally(() => {
          setIsCompleting(false)
          setCompletionIntent(null)
        })
    },
    [
      conversationId,
      battlePlan,
      isCompleting,
      localize,
      onCompletionConfirmed,
      openSessionReview,
      trainingApiBase,
      trainingSession,
      treeProjection.selectedTailId,
    ]
  )

  const renderMessageBranchSelector = useCallback(
    (message: Message) => {
      const step = treeProjection.branchSteps.find(
        (candidate) => candidate.selectedMessageId === message.key
      )
      if (!step || step.options.length <= 1) return null
      return (
        <TrainingMessageBranchSelector
          disabled={
            trainingSession.status !== 'active' ||
            Boolean(pendingBranchMessageId) ||
            isGenerating ||
            isSavingEdit
          }
          messageRole={message.from}
          onSelect={handleSelectBranch}
          pending={step.options.some(
            (option) => option.message.publicId === pendingBranchMessageId
          )}
          step={step}
        />
      )
    },
    [
      handleSelectBranch,
      isGenerating,
      isSavingEdit,
      pendingBranchMessageId,
      trainingSession.status,
      treeProjection.branchSteps,
    ]
  )

  const handleSaveEditAndSubmit = useCallback(
    (content: string) => {
      const messageKey = editingMessageKey
      const source = messageKey
        ? messageRecordsRef.current.get(messageKey)?.message
        : null
      if (!source || !source.content.trim()) return

      setEditingMessageKey(null)
      void startStream(content, {
        parentMessageId: source.parentMessageId,
        branchId: source.branchId,
      })
    },
    [editingMessageKey, startStream]
  )

  const isBusy = isGenerating || isSavingEdit || isForking || isCompleting
  const isSessionReadOnly = trainingSession.status !== 'active'
  const isInputLocked = isSessionReadOnly || battleTurnLimitReached
  const canComplete =
    !isBusy &&
    !isLoadingConversation &&
    !isLoadingMessages &&
    !editingMessageKey &&
    !pendingBranchMessageId &&
    Boolean(treeProjection.selectedTailId) &&
    !isSessionReadOnly
  const completionPermissionDenied =
    completionError instanceof TrainingConversationApiError &&
    (completionError.status === 401 || completionError.status === 403)
  let completionDialogTitle = ''
  let completionDialogDescription = ''
  let completionAlertTitle = ''
  let completionReviewLabel = ''
  if (completionResult?.reportStatus === 'skipped') {
    completionDialogTitle = localize('Training ended', '训练已结束')
    completionDialogDescription = localize(
      'The session and selected path were saved without generating a review.',
      '会话和当前路径已保存，本次未生成复盘。'
    )
    completionAlertTitle = localize('Review skipped', '已跳过复盘')
  } else if (completionResult?.reportStatus === 'pending') {
    completionDialogTitle = localize('Review is being prepared', '复盘正在生成')
    completionDialogDescription = localize(
      'The selected conversation path is saved. You can continue to the session page while the report is generated.',
      '当前对话路径已保存。报告生成期间可以前往会话页等待。'
    )
    completionAlertTitle = localize('Report queued', '报告已进入生成队列')
    completionReviewLabel = localize('View review status', '查看复盘状态')
  } else if (completionResult?.reportStatus === 'failed') {
    completionDialogTitle = localize(
      'Training finished without a report',
      '训练已结束，但报告生成失败'
    )
    completionDialogDescription = localize(
      'The session and selected path are preserved. Open the session page to inspect the report status.',
      '会话和当前路径均已保留，可前往会话页查看报告状态。'
    )
    completionAlertTitle = localize('Report unavailable', '报告暂不可用')
    completionReviewLabel = localize('Open session', '打开会话')
  } else if (completionResult?.reportStatus === 'ready') {
    completionDialogTitle = battlePlan
      ? localize('Battle briefing card', '备战速记卡')
      : localize('Training finished', '训练已结束')
    completionDialogDescription = battlePlan
      ? localize(
          'The selected path has been distilled into a concise briefing for the real conversation.',
          '当前选中路径已收口为一份可直接带走的沟通速记。'
        )
      : localize('The report is ready for review.', '复盘报告已就绪。')
    completionAlertTitle = battlePlan
      ? localize('Briefing ready', '速记卡已就绪')
      : localize('Report ready', '报告已就绪')
    completionReviewLabel = localize('Open full review', '打开完整复盘')
  }

  return (
    <div className='relative flex size-full min-h-0 flex-col overflow-hidden'>
      <TrainingConversationHeaderActions
        desktopExpanded={isInsightsExpanded}
        onDesktopExpandedChange={setIsInsightsExpanded}
        onMobileOpenChange={setIsMobileInsightsOpen}
        target={headerActionsTarget}
      >
        {isSessionReadOnly ? (
          <Button size='sm' variant='outline' onClick={openSessionReview}>
            <ClipboardCheck />
            <span className='hidden sm:inline'>
              {localize('Open review', '查看复盘')}
            </span>
            <span className='sr-only sm:hidden'>
              {localize('Open review', '查看复盘')}
            </span>
          </Button>
        ) : (
          <Button
            disabled={!canComplete}
            size='sm'
            variant='destructive'
            onClick={() => {
              setCompletionError(null)
              setCompletionResult(null)
              setIsCompletionDialogOpen(true)
            }}
          >
            <Flag />
            <span className='hidden sm:inline'>
              {battlePlan
                ? localize('Finish battle prep', '结束备战')
                : localize('Finish training', '结束训练')}
            </span>
            <span className='sr-only sm:hidden'>
              {battlePlan
                ? localize('Finish battle prep', '结束备战')
                : localize('Finish training', '结束训练')}
            </span>
          </Button>
        )}
      </TrainingConversationHeaderActions>
      {battlePlan && (
        <div className='flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5'>
          <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
            <Badge variant={battleTurnLimitReached ? 'default' : 'secondary'}>
              {battleTurnLimitReached
                ? localize('Planned rounds complete', '计划轮次已完成')
                : localize(
                    `${remainingBattleTurns} rounds remaining`,
                    `剩余 ${remainingBattleTurns} 轮`
                  )}
            </Badge>
            {battlePlan.selectedFocus.slice(0, 2).map((focus) => (
              <Badge
                className='max-w-48 truncate'
                key={focus}
                variant='outline'
              >
                {focus}
              </Badge>
            ))}
            {battlePlan.selectedFocus.length > 2 && (
              <Badge variant='outline'>
                +{battlePlan.selectedFocus.length - 2}
              </Badge>
            )}
          </div>
        </div>
      )}
      <div className='flex min-h-0 flex-1 overflow-hidden'>
        <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            {battleTurnLimitReached && !isSessionReadOnly && (
              <Alert className='mx-auto mt-3 w-[calc(100%-2rem)] max-w-4xl'>
                <Flag />
                <AlertTitle>
                  {localize('Planned rounds complete', '计划轮次已完成')}
                </AlertTitle>
                <AlertDescription>
                  {localize(
                    'Finish battle preparation to generate the briefing card, or switch branches before finishing.',
                    '现在可以结束备战生成速记卡，也可以先切换分支再结束。'
                  )}
                </AlertDescription>
              </Alert>
            )}
            {treeProjection.excludedMessageIds.length > 0 && (
              <Alert className='mx-auto mt-3 w-[calc(100%-2rem)] max-w-4xl'>
                <TriangleAlert />
                <AlertDescription>
                  {localize(
                    'Some messages could not be placed in this conversation path.',
                    '部分消息无法放入当前会话路径。'
                  )}
                </AlertDescription>
              </Alert>
            )}
            <PlaygroundChat
              assistantParticipant={assistantParticipant}
              contentClassName='max-w-none'
              editingKey={editingMessageKey}
              forkMessageLabel={localize('Fork conversation', '创建会话分支')}
              isGenerating={isBusy}
              isLoadingMessages={isLoadingMessages || isLoadingConversation}
              messages={messages}
              onCancelEdit={(open) => {
                if (!open) setEditingMessageKey(null)
              }}
              onEditMessage={
                isInputLocked
                  ? undefined
                  : (message) => setEditingMessageKey(message.key)
              }
              onForkMessage={isSessionReadOnly ? undefined : handleOpenFork}
              onRegenerateMessage={
                isInputLocked ? undefined : handleRegenerateMessage
              }
              onSaveEdit={handleSaveEdit}
              onSaveEditAndSubmit={handleSaveEditAndSubmit}
              onSelectPrompt={handleSendMessage}
              renderMessageFooter={renderMessageBranchSelector}
              userParticipant={userParticipant}
            />
          </div>

          <TrainingConversationComposer>
            <PlaygroundInput
              capabilities={TRAINING_INPUT_CAPABILITIES}
              compact
              config={config}
              disabled={isBusy || isInputLocked}
              groups={groups}
              groupValue={config.group}
              hasMessages={messages.length > 0}
              isGenerating={isGenerating}
              isModelLoading={isLoadingModels}
              modelValue={config.model}
              models={models}
              onConfigChange={updateConfig}
              onGroupChange={(value) => updateConfig('group', value)}
              onModelChange={(value) => updateConfig('model', value)}
              onParameterEnabledChange={updateParameterEnabled}
              onStop={() => streamAbortRef.current?.abort()}
              onSubmit={handleSendMessage}
              parameterEnabled={parameterEnabled}
            />
          </TrainingConversationComposer>
        </div>
        <TrainingConversationInsights
          desktopExpanded={isInsightsExpanded}
          isGenerating={isGenerating}
          isLoadingConversation={
            isLoadingConversation || loadedConversationId !== conversationId
          }
          messages={treeProjection.path}
          mobileOpen={isMobileInsightsOpen}
          selectedTailId={treeProjection.selectedTailId}
          trainingApiBase={trainingApiBase}
          trainingSession={trainingSession}
          onDesktopExpandedChange={setIsInsightsExpanded}
          onMobileOpenChange={setIsMobileInsightsOpen}
        />
      </div>
      <Dialog
        open={forkTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isForking) setForkTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {localize('Fork training conversation', '创建训练分支')}
            </DialogTitle>
            <DialogDescription>
              {localize(
                'The fork opens as a separate training session with its own review lifecycle.',
                '分支将作为独立训练会话打开，并拥有独立的复盘周期。'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-2'>
            <div className='grid gap-2'>
              <Label htmlFor='training-fork-title'>
                {localize('Title', '标题')}
              </Label>
              <Input
                disabled={isForking}
                id='training-fork-title'
                maxLength={255}
                placeholder={localize(
                  'Optional training title',
                  '可选的训练标题'
                )}
                value={forkTitle}
                onChange={(event) => setForkTitle(event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='training-fork-scope'>
                {localize('Messages to include', '包含的消息')}
              </Label>
              <Select
                disabled={isForking}
                value={forkOption}
                onValueChange={(value) =>
                  setForkOption(value as TrainingConversationForkOption)
                }
              >
                <SelectTrigger id='training-fork-scope' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='directPath'>
                    {localize('Selected path', '当前路径')}
                  </SelectItem>
                  <SelectItem value='includeBranches'>
                    {localize('Path and sibling branches', '路径及同层分支')}
                  </SelectItem>
                  <SelectItem value='targetLevel'>
                    {localize(
                      'All messages through this level',
                      '截至当前层的所有消息'
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isForking}
              variant='outline'
              onClick={() => setForkTarget(null)}
            >
              {localize('Cancel', '取消')}
            </Button>
            <Button disabled={isForking || !forkTarget} onClick={handleFork}>
              {isForking && <LoaderCircle className='animate-spin' />}
              {localize('Create fork', '创建分支')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isCompletionDialogOpen}
        onOpenChange={(open) => {
          if (!isCompleting) setIsCompletionDialogOpen(open)
        }}
      >
        <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
          {completionResult ? (
            <>
              <DialogHeader>
                <DialogTitle>{completionDialogTitle}</DialogTitle>
                <DialogDescription>
                  {completionDialogDescription}
                </DialogDescription>
              </DialogHeader>
              <Alert
                variant={
                  completionResult.reportStatus === 'failed'
                    ? 'destructive'
                    : 'default'
                }
              >
                <CompletionReportIcon status={completionResult.reportStatus} />
                <AlertTitle>{completionAlertTitle}</AlertTitle>
                {completionResult.reportStatus === 'failed' &&
                  completionResult.reportError && (
                    <AlertDescription>
                      {completionResult.reportError}
                    </AlertDescription>
                  )}
              </Alert>
              {battlePlan && battleSheet && (
                <div className='space-y-4 rounded-md border p-4'>
                  <div>
                    <div className='mb-1 text-sm font-medium'>
                      {localize('Core takeaway', '核心结论')}
                    </div>
                    <p className='text-muted-foreground text-sm whitespace-pre-wrap'>
                      {battleSheet.summary}
                    </p>
                  </div>
                  {battleSheet.suggestions.length > 0 && (
                    <div>
                      <div className='mb-1 text-sm font-medium'>
                        {localize('Before the conversation', '上场前提醒')}
                      </div>
                      <ul className='text-muted-foreground list-disc space-y-1.5 pl-5 text-sm'>
                        {battleSheet.suggestions.map((suggestion) => (
                          <li
                            key={`${suggestion.counterpart ?? ''}:${suggestion.priority ?? ''}:${suggestion.suggestion}`}
                          >
                            {suggestion.suggestion}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {battlePlan && battleSheetError !== null && (
                <Alert variant='destructive'>
                  <TriangleAlert />
                  <AlertTitle>
                    {localize(
                      'Briefing card could not be loaded',
                      '速记卡暂时无法加载'
                    )}
                  </AlertTitle>
                  <AlertDescription>
                    {trainingConversationErrorMessage(battleSheetError)}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button
                  variant='outline'
                  onClick={() => setIsCompletionDialogOpen(false)}
                >
                  {localize('Stay here', '留在当前页面')}
                </Button>
                {completionResult.reportStatus !== 'skipped' && (
                  <Button onClick={openSessionReview}>
                    <ClipboardCheck />
                    {completionReviewLabel}
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {completionPermissionDenied
                    ? localize('Access denied', '没有结束权限')
                    : localize('Finish this training?', '结束本次训练？')}
                </DialogTitle>
                <DialogDescription>
                  {localize(
                    'Choose whether to generate a review from the selected conversation path or end the session directly.',
                    '你可以结束并生成当前对话路径的复盘，也可以直接结束本次训练。'
                  )}
                </DialogDescription>
              </DialogHeader>
              {completionError !== null && (
                <Alert variant='destructive'>
                  <ShieldAlert />
                  <AlertTitle>
                    {completionPermissionDenied
                      ? localize(
                          'You cannot finish this training session',
                          '你无权结束该训练会话'
                        )
                      : localize('Unable to finish training', '无法结束训练')}
                  </AlertTitle>
                  <AlertDescription>
                    {trainingConversationErrorMessage(completionError)}
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button
                  disabled={isCompleting}
                  variant='outline'
                  onClick={() => setIsCompletionDialogOpen(false)}
                >
                  {localize('Cancel', '取消')}
                </Button>
                <Button
                  disabled={!canComplete}
                  variant='outline'
                  onClick={() => handleCompleteTraining(false)}
                >
                  {isCompleting && completionIntent === 'direct' ? (
                    <LoaderCircle className='animate-spin' />
                  ) : (
                    <Flag />
                  )}
                  {localize('End without review', '直接结束')}
                </Button>
                <Button
                  disabled={!canComplete}
                  onClick={() => handleCompleteTraining(true)}
                >
                  {isCompleting && completionIntent === 'report' ? (
                    <LoaderCircle className='animate-spin' />
                  ) : (
                    <Flag />
                  )}
                  {battlePlan
                    ? localize('End and create briefing', '结束并生成备战速记')
                    : localize('End and generate review', '结束并生成复盘')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

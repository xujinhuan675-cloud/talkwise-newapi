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
import { nanoid } from 'nanoid'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

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

import {
  editTrainingConversationMessage,
  loadTrainingConversationMessages,
  sendTrainingConversationMessage,
  type TrainingConversationMessage,
  type TrainingConversationSessionContext,
} from './api'

export type { TrainingConversationSessionContext } from './api'

type MessageRecord = {
  message: TrainingConversationMessage
  key: string
}

export interface TrainingConversationSurfaceProps {
  readonly conversationId: string
  readonly trainingSession: TrainingConversationSessionContext
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
      : [...messages.slice(0, targetIndex)]
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

export function TrainingConversationSurface({
  conversationId,
  trainingSession,
}: TrainingConversationSurfaceProps) {
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
  const [isGenerating, setIsGenerating] = useState(false)
  const [editingMessageKey, setEditingMessageKey] = useState<string | null>(
    null
  )
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const messagesRef = useRef(messages)
  const messageRecordsRef = useRef(new Map<string, MessageRecord>())
  const streamAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

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
    (loaded: TrainingConversationMessage[]) => {
      messageRecordsRef.current = new Map(
        loaded.map((message) => [
          message.publicId,
          { key: message.publicId, message },
        ])
      )
      replaceMessages(loaded.map(toPlaygroundMessage))
    },
    [replaceMessages]
  )

  const refreshConversation = useCallback(
    async (signal?: AbortSignal) => {
      const loaded = await loadTrainingConversationMessages(
        conversationId,
        signal
      )
      applyLoadedMessages(loaded)
    },
    [applyLoadedMessages, conversationId]
  )

  useEffect(() => {
    if (isLoadingMessages) return

    const controller = new AbortController()
    setIsLoadingConversation(true)
    void refreshConversation(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          toast.error(trainingConversationErrorMessage(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingConversation(false)
      })

    return () => controller.abort()
  }, [isLoadingMessages, refreshConversation])

  useEffect(
    () => () => {
      streamAbortRef.current?.abort()
    },
    []
  )

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
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
      if (!content || streamAbortRef.current) return

      const userKey = `local-user-${nanoid()}`
      const assistantKey = `local-assistant-${nanoid()}`
      const createdAt = Date.now()
      const controller = new AbortController()
      let didComplete = false

      streamAbortRef.current = controller
      setIsGenerating(true)
      mutateMessages((current) =>
        [
          ...current,
          createUserMessage(content, createdAt),
          createLoadingAssistantMessage(createdAt),
        ].map((message, index, appended) => {
          if (index === appended.length - 2) return { ...message, key: userKey }
          if (index === appended.length - 1)
            return { ...message, key: assistantKey }
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
                mutateMessages((current) =>
                  current.map((item) => {
                    if (item.key !== assistantKey) return item
                    return completeAssistantMessage(
                      updateMessageContent(
                        { ...item, key: event.publicId },
                        event.content
                      )
                    )
                  })
                )
                return
              }

              if (event.type === 'error') {
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
      mutateMessages,
      parameterEnabled.max_tokens,
      parameterEnabled.temperature,
      trainingSession,
    ]
  )

  const handleSendMessage = useCallback(
    (text: string) => {
      const tail = lastPersistedMessage(
        messagesRef.current,
        messageRecordsRef.current
      )
      void startStream(text, {
        parentMessageId: tail?.publicId,
        branchId: tail?.branchId,
      })
    },
    [startStream]
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
        .then((result) => {
          if (result.path.length > 0) {
            applyLoadedMessages(result.path)
          } else if (result.message) {
            const currentRecords = Array.from(
              messageRecordsRef.current.values(),
              (record) => record.message
            ).filter((message) => message.publicId !== result.message?.publicId)
            applyLoadedMessages([...currentRecords, result.message])
          }
          setEditingMessageKey(null)
        })
        .catch((error: unknown) =>
          toast.error(trainingConversationErrorMessage(error))
        )
        .finally(() => setIsSavingEdit(false))
    },
    [applyLoadedMessages, conversationId, editingMessageKey, trainingSession]
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

  const isBusy = isGenerating || isSavingEdit

  return (
    <div className='relative flex size-full min-h-0 flex-col overflow-hidden'>
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <PlaygroundChat
          editingKey={editingMessageKey}
          isGenerating={isBusy}
          isLoadingMessages={isLoadingMessages || isLoadingConversation}
          messages={messages}
          onCancelEdit={(open) => {
            if (!open) setEditingMessageKey(null)
          }}
          onEditMessage={(message) => setEditingMessageKey(message.key)}
          onRegenerateMessage={handleRegenerateMessage}
          onSaveEdit={handleSaveEdit}
          onSaveEditAndSubmit={handleSaveEditAndSubmit}
          onSelectPrompt={handleSendMessage}
        />
      </div>

      <div className='mx-auto w-full max-w-4xl'>
        <PlaygroundInput
          config={config}
          disabled={isBusy}
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
      </div>
    </div>
  )
}

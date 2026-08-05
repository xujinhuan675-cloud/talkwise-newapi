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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleAlert,
  LoaderCircle,
  PanelLeft,
  Plus,
  Trash2,
} from 'lucide-react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { TrainingConversationCompletionResult } from '../conversation-workspace/api'
import {
  TrainingConversationSurface,
  type TrainingConversationSessionContext,
} from '../conversation-workspace/training-conversation-surface'
import { TrainingHostProvider, useTrainingHost } from '../host'
import { TrainingRoomConversationSurface } from '../studio/training-room-conversation-surface'
import {
  deleteTrainingConversationSession,
  listTrainingConversationSessions,
  type TrainingConversationSession,
} from './api'
import {
  loadTrainingConversationListExpanded,
  saveTrainingConversationListExpanded,
} from './conversation-list-preference'
import { NewTrainingConversationDialog } from './new-training-conversation-dialog'
import type { TrainingConversationWorkspaceSearch } from './workspace-handoff'

type TrainingConversationWorkspaceProps = {
  conversationId?: string
  messageId?: string
  sessionId?: string
  onSessionChange: (search: TrainingConversationWorkspaceSearch) => void
}

type TrainingSessionCompletionResult = Pick<
  TrainingConversationCompletionResult,
  'metadata' | 'reportId' | 'sessionId' | 'status'
>

function sessionSearch(
  session: TrainingConversationSession
): TrainingConversationWorkspaceSearch {
  return {
    session: session.id,
    ...(session.conversationId ? { conversation: session.conversationId } : {}),
  }
}

function selectedSession(
  sessions: TrainingConversationSession[],
  selection: TrainingConversationWorkspaceSearch
): TrainingConversationSession | null {
  const sessionId = selection.session?.trim()
  const conversationId = selection.conversation?.trim()

  if (sessionId && conversationId) {
    return (
      sessions.find(
        (session) =>
          session.id === sessionId && session.conversationId === conversationId
      ) ?? null
    )
  }
  if (sessionId) {
    return sessions.find((session) => session.id === sessionId) ?? null
  }
  if (conversationId) {
    return (
      sessions.find((session) => session.conversationId === conversationId) ??
      null
    )
  }
  return sessions[0] ?? null
}

function TrainingConversationWorkspaceContent({
  conversationId,
  messageId,
  sessionId,
  onSessionChange,
}: TrainingConversationWorkspaceProps) {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const queryClient = useQueryClient()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const sessionsQuery = useQuery({
    queryKey: ['training', 'conversation-sessions', host.apiBase],
    queryFn: () => listTrainingConversationSessions(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)
  const [isListCollapsed, setIsListCollapsed] = useState(
    () =>
      !loadTrainingConversationListExpanded(
        typeof window === 'undefined' ? null : window.localStorage
      )
  )
  const [headerActionsTarget, setHeaderActionsTarget] =
    useState<HTMLDivElement | null>(null)
  const [sessionPendingDelete, setSessionPendingDelete] =
    useState<TrainingConversationSession | null>(null)
  const selection = useMemo(
    () => ({ session: sessionId, conversation: conversationId }),
    [conversationId, sessionId]
  )
  const activeSession = useMemo(
    () => selectedSession(sessions, selection),
    [selection, sessions]
  )
  const deleteSessionMutation = useMutation({
    mutationFn: (session: TrainingConversationSession) =>
      deleteTrainingConversationSession(host.apiBase, session.id),
    onSuccess: async (_result, deletedSession) => {
      const nextSession = sessions.find(
        (session) => session.id !== deletedSession.id
      )
      await queryClient.refetchQueries({
        queryKey: ['training', 'conversation-sessions', host.apiBase],
        type: 'active',
      })
      if (sessionId === deletedSession.id) {
        onSessionChange(nextSession ? sessionSearch(nextSession) : {})
      }
      setSessionPendingDelete(null)
    },
  })
  const handleCompletionConfirmed = useCallback(
    async (result: TrainingSessionCompletionResult) => {
      const sessionsKey = ['training', 'conversation-sessions', host.apiBase]
      queryClient.setQueryData<TrainingConversationSession[]>(
        sessionsKey,
        (current) =>
          current?.map((session) =>
            session.id === result.sessionId
              ? {
                  ...session,
                  status: result.status,
                  reportId: result.reportId,
                  metadata: {
                    ...session.metadata,
                    ...result.metadata,
                  },
                }
              : session
          )
      )
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: sessionsKey,
          type: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'training',
            'review-session',
            host.apiBase,
            result.sessionId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'training',
            'review-report',
            host.apiBase,
            result.sessionId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ['training', 'review-sessions', host.apiBase],
        }),
        queryClient.invalidateQueries({
          queryKey: ['training', 'review-progress', host.apiBase],
        }),
        queryClient.invalidateQueries({
          queryKey: ['training', 'scenario-progress-summary', host.apiBase],
        }),
        queryClient.invalidateQueries({
          queryKey: ['training', 'competency-radar', host.apiBase],
        }),
      ])
    },
    [host.apiBase, queryClient]
  )
  useEffect(() => {
    saveTrainingConversationListExpanded(
      typeof window === 'undefined' ? null : window.localStorage,
      !isListCollapsed
    )
  }, [isListCollapsed])
  useEffect(() => {
    if (!activeSession) return
    if (
      sessionId === activeSession.id &&
      conversationId === (activeSession.conversationId ?? undefined)
    ) {
      return
    }
    onSessionChange(sessionSearch(activeSession))
  }, [activeSession, conversationId, onSessionChange, sessionId])

  if (host.authStatus === 'anonymous') {
    return (
      <Alert className='m-4' variant='destructive'>
        <CircleAlert />
        <AlertTitle>{localize('Sign-in required', '需要登录')}</AlertTitle>
        <AlertDescription>
          {localize(
            'Your session is no longer available.',
            '当前登录会话已不可用。'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='flex size-full min-h-0 overflow-hidden'>
      <aside
        className={cn(
          'bg-muted/20 hidden shrink-0 overflow-hidden transition-[width,border-color] duration-200 md:flex md:flex-col',
          isListCollapsed ? 'w-0 border-r-0' : 'w-72 border-r'
        )}
        id='training-conversation-list'
      >
        {!isListCollapsed && (
          <div className='flex min-h-0 w-72 flex-1 flex-col'>
            <div className='flex min-h-12 items-center gap-2 border-b px-3 py-2'>
              <span className='min-w-0 flex-1 truncate text-sm font-semibold'>
                {localize('Training conversations', '训练会话')}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={localize(
                        'Start training session',
                        '开始训练会话'
                      )}
                      size='icon-sm'
                      variant='ghost'
                      onClick={() => setIsNewConversationOpen(true)}
                    />
                  }
                >
                  <Plus />
                </TooltipTrigger>
                <TooltipContent>
                  {localize('Start training session', '开始训练会话')}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-controls='training-conversation-list'
                      aria-expanded
                      aria-label={localize(
                        'Collapse conversation list',
                        '折叠会话列表'
                      )}
                      size='icon-sm'
                      variant='ghost'
                      onClick={() => setIsListCollapsed(true)}
                    />
                  }
                >
                  <PanelLeft />
                </TooltipTrigger>
                <TooltipContent>
                  {localize('Collapse conversation list', '折叠会话列表')}
                </TooltipContent>
              </Tooltip>
            </div>
            <ScrollArea className='min-h-0 flex-1 p-2'>
              {sessionsQuery.isPending && (
                <div className='text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm'>
                  <LoaderCircle className='size-4 animate-spin' />
                  {localize('Loading conversations...', '正在加载会话...')}
                </div>
              )}
              {sessionsQuery.isError && (
                <div className='text-destructive px-2 py-3 text-sm'>
                  {localize('Unable to load conversations.', '无法加载会话。')}
                </div>
              )}
              {!sessionsQuery.isPending &&
                !sessionsQuery.isError &&
                sessions.length === 0 && (
                  <div className='text-muted-foreground px-2 py-3 text-sm'>
                    {localize(
                      'Start a training session to create a conversation.',
                      '开始训练后，会话会显示在这里。'
                    )}
                  </div>
                )}
              <div className='space-y-1'>
                {sessions.map((session) => (
                  <div
                    className={cn(
                      'group hover:bg-accent focus-within:ring-ring flex w-full items-start gap-1 rounded-md px-3 py-2 outline-none focus-within:ring-2 focus-within:ring-inset',
                      activeSession?.id === session.id && 'bg-accent'
                    )}
                    key={session.id}
                  >
                    <button
                      className='min-w-0 flex-1 text-left'
                      onClick={() => onSessionChange(sessionSearch(session))}
                      type='button'
                    >
                      <span className='block truncate text-sm font-medium'>
                        {session.title}
                      </span>
                    </button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            aria-label={localize(
                              'Delete training session',
                              '删除训练会话'
                            )}
                            className='opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'
                            size='icon-sm'
                            variant='ghost'
                            onClick={() => {
                              deleteSessionMutation.reset()
                              setSessionPendingDelete(session)
                            }}
                          />
                        }
                      >
                        <Trash2 />
                      </TooltipTrigger>
                      <TooltipContent>
                        {localize('Delete training session', '删除训练会话')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </aside>

      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex min-h-12 items-center gap-2 border-b px-3 py-2 sm:px-4'>
          <div className='flex shrink-0 items-center gap-1'>
            {isListCollapsed && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-controls='training-conversation-list'
                      aria-expanded={false}
                      aria-label={localize(
                        'Expand conversation list',
                        '展开会话列表'
                      )}
                      className='hidden md:inline-flex'
                      size='icon-sm'
                      variant='outline'
                      onClick={() => setIsListCollapsed(false)}
                    />
                  }
                >
                  <PanelLeft />
                </TooltipTrigger>
                <TooltipContent>
                  {localize('Expand conversation list', '展开会话列表')}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={localize(
                      'Start training session',
                      '开始训练会话'
                    )}
                    className='md:hidden'
                    size='icon-sm'
                    variant='ghost'
                    onClick={() => setIsNewConversationOpen(true)}
                  />
                }
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent>
                {localize('Start training session', '开始训练会话')}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className='min-w-0 flex-1'>
            {activeSession ? (
              <>
                <div className='truncate text-sm font-medium'>
                  {activeSession.title}
                </div>
                <div className='text-muted-foreground truncate text-xs'>
                  {activeSession.description}
                </div>
              </>
            ) : (
              <div className='truncate text-sm font-medium'>
                {localize('Training conversations', '训练会话')}
              </div>
            )}
          </div>
          <div
            className='flex shrink-0 items-center gap-2'
            ref={setHeaderActionsTarget}
          />
        </div>
        {activeSession?.mode === 'text' && activeSession.conversationId && (
          <TrainingConversationSurface
            conversationId={activeSession.conversationId}
            headerActionsTarget={headerActionsTarget}
            onCompletionConfirmed={handleCompletionConfirmed}
            onForkCreated={async (result) => {
              await queryClient.refetchQueries({
                queryKey: ['training', 'conversation-sessions', host.apiBase],
                type: 'active',
              })
              onSessionChange({
                session: result.trainingSession.id,
                conversation: result.trainingSession.conversationId,
              })
            }}
            onSelectedTailChange={(nextMessageId) =>
              onSessionChange({
                ...sessionSearch(activeSession),
                ...(nextMessageId ? { message: nextMessageId } : {}),
              })
            }
            selectedTailId={messageId}
            trainingApiBase={host.apiBase}
            trainingSession={
              {
                sessionId: activeSession.id,
                scenarioId: activeSession.scenarioId,
                title: activeSession.title,
                description: activeSession.description,
                difficulty: activeSession.difficulty,
                status: activeSession.status,
                reportId: activeSession.reportId,
                metadata: activeSession.metadata,
              } satisfies TrainingConversationSessionContext
            }
          />
        )}
        {activeSession?.roomId && activeSession.mode !== 'text' && (
          <TrainingRoomConversationSurface
            apiBase={host.apiBase}
            feedbackMode={activeSession.feedbackMode}
            headerActionsTarget={headerActionsTarget}
            mode={activeSession.mode}
            onCompletionConfirmed={handleCompletionConfirmed}
            realtimeProfile={activeSession.realtimeProfile}
            realtimeProvider={activeSession.realtimeProvider}
            roomId={activeSession.roomId}
            trainingSession={
              {
                sessionId: activeSession.id,
                scenarioId: activeSession.scenarioId,
                title: activeSession.title,
                description: activeSession.description,
                difficulty: activeSession.difficulty,
                status: activeSession.status,
                reportId: activeSession.reportId,
                metadata: activeSession.metadata,
              } satisfies TrainingConversationSessionContext
            }
          />
        )}
      </div>
      <NewTrainingConversationDialog
        apiBase={host.apiBase}
        open={isNewConversationOpen}
        onOpenChange={setIsNewConversationOpen}
        onSessionCreated={(nextSessionId) =>
          onSessionChange({ session: nextSessionId })
        }
      />
      <Dialog
        open={sessionPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSessionMutation.isPending) {
            deleteSessionMutation.reset()
            setSessionPendingDelete(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {localize('Delete training session?', '删除训练会话？')}
            </DialogTitle>
            <DialogDescription>
              {localize(
                'This removes the training session from your conversation list.',
                '此操作会从你的训练会话列表中移除该会话。'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {deleteSessionMutation.isError && (
              <Alert className='mr-auto max-w-sm' variant='destructive'>
                <CircleAlert />
                <AlertDescription>
                  {localize(
                    'Unable to delete this training session. Please try again.',
                    '无法删除此训练会话，请重试。'
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Button
              disabled={deleteSessionMutation.isPending}
              variant='outline'
              onClick={() => setSessionPendingDelete(null)}
            >
              {localize('Cancel', '取消')}
            </Button>
            <Button
              disabled={
                deleteSessionMutation.isPending || !sessionPendingDelete
              }
              variant='destructive'
              onClick={() =>
                sessionPendingDelete &&
                deleteSessionMutation.mutate(sessionPendingDelete)
              }
            >
              {deleteSessionMutation.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Trash2 />
              )}
              {localize('Delete', '删除')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function TrainingConversationWorkspace(
  props: TrainingConversationWorkspaceProps
) {
  return (
    <TrainingHostProvider>
      <TrainingConversationWorkspaceContent {...props} />
    </TrainingHostProvider>
  )
}

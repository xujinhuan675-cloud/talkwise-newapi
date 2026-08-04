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
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  History,
  Lightbulb,
  MessageSquareText,
  PanelRightClose,
  RefreshCw,
  Target,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  loadTrainingConversationGuidanceHistory,
  loadTrainingConversationReportSummary,
  requestTrainingConversationGuidance,
  TrainingConversationApiError,
  type TrainingConversationGuidanceHistoryResult,
  type TrainingConversationGuidanceResult,
  type TrainingConversationMessage,
  type TrainingConversationReportSummary,
  type TrainingConversationSessionContext,
} from './api'
import {
  decideTrainingGuidanceAutoRefresh,
  EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE,
} from './guidance-refresh'

type InsightTab = 'context' | 'guidance' | 'analysis'

type TrainingConversationInsightsProps = {
  readonly desktopExpanded: boolean
  readonly mobileOpen: boolean
  readonly onDesktopExpandedChange: (expanded: boolean) => void
  readonly onMobileOpenChange: (open: boolean) => void
  readonly initialTab?: InsightTab
  readonly isGenerating: boolean
  readonly isLoadingConversation: boolean
  readonly trainingApiBase: string
  readonly trainingSession: TrainingConversationSessionContext
  readonly messages: readonly TrainingConversationMessage[]
  readonly selectedTailId: string | null
}

type ScenarioMetadata = {
  readonly title: string | null
  readonly description: string | null
  readonly customerProfile: string | null
  readonly personaName: string | null
  readonly personaRole: string | null
  readonly personaStyle: string | null
  readonly trainingPoints: string[]
}

type GuidanceDisplayError = {
  readonly message: string
  readonly title: string
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = textValue(item)
        return text ? [text] : []
      })
    : []
}

function scenarioMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): ScenarioMetadata {
  const source = recordValue(metadata?.scenario_training)
  const persona =
    recordValue(source?.persona) ?? recordValue(metadata?.counterpartPersona)
  return {
    title: textValue(source?.title),
    description: textValue(source?.description),
    customerProfile: textValue(
      source?.customer_profile ?? source?.customerProfile
    ),
    personaName: textValue(persona?.name ?? source?.persona_name),
    personaRole: textValue(persona?.role ?? source?.persona_role),
    personaStyle: textValue(persona?.style ?? source?.persona_style),
    trainingPoints: textList(source?.training_points ?? source?.trainingPoints),
  }
}

function completionReportMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | null {
  const completion = metadata?.completionReport ?? metadata?.completion_report
  return recordValue(completion)
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function guidanceDisplayError(
  error: unknown,
  localize: (english: string, chinese: string) => string,
  context: 'guidance' | 'history'
): GuidanceDisplayError {
  if (error instanceof TrainingConversationApiError && error.status === 401) {
    return {
      title: localize('Sign-in required', '需要重新登录'),
      message: localize(
        'Your session is no longer authorized. Sign in again before loading coaching guidance.',
        '当前登录状态已失效，请重新登录后再加载教练提示。'
      ),
    }
  }
  if (error instanceof TrainingConversationApiError && error.status === 403) {
    return {
      title: localize('Access denied', '没有访问权限'),
      message: localize(
        'You do not have access to coaching guidance for this training session.',
        '你无权访问该训练会话的教练提示。'
      ),
    }
  }
  return {
    title:
      context === 'history'
        ? localize('History unavailable', '历史提示不可用')
        : localize('Guidance unavailable', '教练提示不可用'),
    message: errorText(
      error,
      context === 'history'
        ? localize(
            'Unable to load saved guidance.',
            '无法加载已保存的教练提示。'
          )
        : localize('Unable to load guidance.', '无法加载教练提示。')
    ),
  }
}

function guidanceTimestamp(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function statusLabel(
  status: string | undefined,
  localize: (e: string, c: string) => string
): string {
  if (status === 'active') return localize('Active', '进行中')
  if (status === 'completed') return localize('Completed', '已完成')
  if (status === 'failed') return localize('Failed', '失败')
  return localize('Created', '已创建')
}

function ContextTab({
  messages,
  session,
  localize,
}: {
  readonly messages: readonly TrainingConversationMessage[]
  readonly session: TrainingConversationSessionContext
  readonly localize: (english: string, chinese: string) => string
}) {
  const scenario = useMemo(
    () => scenarioMetadata(session.metadata),
    [session.metadata]
  )
  const completion = useMemo(
    () => completionReportMetadata(session.metadata),
    [session.metadata]
  )
  const completionStatus = textValue(completion?.status)
  const visibleMessages = messages.filter((message) => message.content.trim())
  const title = session.title || scenario.title
  const description = session.description || scenario.description
  const hasDetails = Boolean(
    title ||
    description ||
    scenario.customerProfile ||
    scenario.personaName ||
    scenario.personaRole ||
    scenario.personaStyle ||
    scenario.trainingPoints.length
  )

  if (!hasDetails) {
    return (
      <Empty className='border-none py-10'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <CircleHelp />
          </EmptyMedia>
          <EmptyTitle>
            {localize('No session context available', '暂无会话上下文')}
          </EmptyTitle>
          <EmptyDescription>
            {session.scenarioId
              ? localize(
                  'A scenario is linked, but its descriptive context was not provided.',
                  '当前会话已关联场景，但没有提供可展示的场景正文。'
                )
              : localize(
                  'This session has not exposed scenario or persona details.',
                  '当前会话没有可展示的场景或 Persona 详情。'
                )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-5 p-4'>
        <div className='flex flex-wrap items-center gap-2'>
          {session.difficulty && (
            <Badge variant='outline'>{session.difficulty}</Badge>
          )}
          {session.status && (
            <Badge variant='secondary'>
              {statusLabel(session.status, localize)}
            </Badge>
          )}
        </div>

        {(title || description) && (
          <section className='space-y-1 border-b pb-4'>
            {title && <h3 className='font-medium'>{title}</h3>}
            {description && (
              <p className='text-muted-foreground text-sm'>{description}</p>
            )}
          </section>
        )}

        {(scenario.personaName ||
          scenario.personaRole ||
          scenario.personaStyle) && (
          <section className='space-y-2 border-b pb-4'>
            <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase'>
              <Target className='size-3.5' />
              {localize('Counterpart', '对方角色')}
            </div>
            {scenario.personaName && (
              <p className='font-medium'>{scenario.personaName}</p>
            )}
            {scenario.personaRole && (
              <p className='text-muted-foreground text-sm'>
                {scenario.personaRole}
              </p>
            )}
            {scenario.personaStyle && (
              <p className='text-muted-foreground text-sm'>
                {scenario.personaStyle}
              </p>
            )}
          </section>
        )}

        {scenario.customerProfile && (
          <section className='space-y-2 border-b pb-4'>
            <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase'>
              <BookOpen className='size-3.5' />
              {localize('Customer profile', '客户画像')}
            </div>
            <p className='text-sm'>{scenario.customerProfile}</p>
          </section>
        )}

        {scenario.trainingPoints.length > 0 && (
          <section className='space-y-2 border-b pb-4'>
            <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase'>
              <Target className='size-3.5' />
              {localize('Training focus', '训练重点')}
            </div>
            <ul className='text-muted-foreground list-disc space-y-1 pl-5 text-sm'>
              {scenario.trainingPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        <section className='space-y-2'>
          <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase'>
            <MessageSquareText className='size-3.5' />
            {localize('Selected path', '当前路径')}
          </div>
          <p className='text-sm'>
            {localize(
              `${visibleMessages.length} message${visibleMessages.length === 1 ? '' : 's'} in this path`,
              `当前路径包含 ${visibleMessages.length} 条消息`
            )}
          </p>
        </section>

        {completionStatus && completionStatus !== 'ready' && (
          <Alert>
            <AlertCircle />
            <AlertDescription>
              {completionStatus === 'pending'
                ? localize(
                    'The review report is still being generated.',
                    '复盘报告仍在生成中。'
                  )
                : localize(
                    'The review report could not be generated.',
                    '复盘报告生成失败。'
                  )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </ScrollArea>
  )
}

function GuidanceTab({
  autoRefreshEnabled,
  error,
  history,
  historyError,
  historyPending,
  isLoading,
  messages,
  onAutoRefreshEnabledChange,
  onRequestGuidance,
  onRetryHistory,
  pending,
  result,
  session,
  localize,
}: {
  readonly autoRefreshEnabled: boolean
  readonly error: GuidanceDisplayError | null
  readonly history: TrainingConversationGuidanceHistoryResult | null
  readonly historyError: GuidanceDisplayError | null
  readonly historyPending: boolean
  readonly isLoading: boolean
  readonly messages: readonly TrainingConversationMessage[]
  readonly onAutoRefreshEnabledChange: (enabled: boolean) => void
  readonly onRequestGuidance: () => void
  readonly onRetryHistory: () => void
  readonly pending: boolean
  readonly result: TrainingConversationGuidanceResult | null
  readonly session: TrainingConversationSessionContext
  readonly localize: (english: string, chinese: string) => string
}) {
  const hasMessages =
    !isLoading && messages.some((message) => message.content.trim())
  const sessionIsActive = !session.status || session.status === 'active'
  const capabilities = result?.capabilities ?? history?.capabilities
  const snapshots = history ? [...history.history].reverse() : []

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-4 p-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='space-y-1'>
            <div className='text-muted-foreground text-sm'>
              {localize(
                'Guidance uses the selected path only.',
                '教练提示只使用当前选中的消息路径。'
              )}
            </div>
            {capabilities?.serverSelectedPath && (
              <Badge variant='outline'>
                {localize('Server-verified path', '服务端已验证路径')}
              </Badge>
            )}
            {capabilities?.history && (
              <Badge variant='outline'>
                {localize('Bounded history', '受限历史')}
              </Badge>
            )}
          </div>
          <div className='flex items-center gap-3'>
            {sessionIsActive ? (
              <>
                <label className='text-muted-foreground flex items-center gap-2 text-sm'>
                  <Switch
                    aria-label={localize(
                      'Automatic coaching guidance',
                      '自动教练提示'
                    )}
                    checked={autoRefreshEnabled}
                    onCheckedChange={onAutoRefreshEnabledChange}
                  />
                  {localize('Automatic', '自动')}
                </label>
                <Button
                  disabled={
                    pending || !hasMessages || capabilities?.refresh === false
                  }
                  size='sm'
                  variant='outline'
                  onClick={onRequestGuidance}
                >
                  {pending ? (
                    <RefreshCw className='animate-spin' />
                  ) : (
                    <Lightbulb />
                  )}
                  {pending
                    ? localize('Thinking', '思考中')
                    : localize('Refresh', '刷新')}
                </Button>
              </>
            ) : (
              <Badge variant='secondary'>{localize('Read-only', '只读')}</Badge>
            )}
          </div>
        </div>

        {!sessionIsActive && (
          <Alert>
            <History />
            <AlertTitle>
              {localize('Saved guidance history', '已保存的教练提示')}
            </AlertTitle>
            <AlertDescription>
              {localize(
                'This session is no longer active. Saved guidance remains available for review.',
                '当前会话已结束，仍可只读查看已保存的教练提示。'
              )}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription className='space-y-2'>
              <p>{error.message}</p>
              <Button
                disabled={pending}
                size='sm'
                variant='outline'
                onClick={onRequestGuidance}
              >
                <RefreshCw />
                {localize('Try again', '重试')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {historyError && historyError.message !== error?.message && (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>{historyError.title}</AlertTitle>
            <AlertDescription className='space-y-2'>
              <p>{historyError.message}</p>
              <Button
                disabled={historyPending}
                size='sm'
                variant='outline'
                onClick={onRetryHistory}
              >
                <RefreshCw />
                {localize('Retry history', '重试历史记录')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {result?.persistence.retryable && (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>
              {localize('Guidance was not saved', '教练提示未保存')}
            </AlertTitle>
            <AlertDescription>
              {localize(
                'The guidance is available now, but the server could not add it to session history. Refresh to retry.',
                '当前提示仍可查看，但服务端未能写入会话历史；可刷新重试。'
              )}
            </AlertDescription>
          </Alert>
        )}

        {pending && !result && (
          <div className='space-y-3'>
            <Skeleton className='h-4 w-2/3' />
            <Skeleton className='h-16 w-full' />
          </div>
        )}

        {isLoading && (
          <div className='space-y-3'>
            <Skeleton className='h-4 w-2/3' />
            <Skeleton className='h-16 w-full' />
          </div>
        )}

        {!isLoading && !hasMessages && !result && (
          <Empty className='border-none py-10'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <MessageSquareText />
              </EmptyMedia>
              <EmptyTitle>
                {sessionIsActive
                  ? localize(
                      'Send a message before asking for guidance',
                      '发送消息后再请求教练提示'
                    )
                  : localize(
                      'No conversation path is available',
                      '没有可查看的会话路径'
                    )}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        {!pending && result && result.events.length === 0 && (
          <Empty className='border-none py-8'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <CheckCircle2 />
              </EmptyMedia>
              <EmptyTitle>
                {localize(
                  'No new guidance for this path',
                  '当前路径暂无新的教练提示'
                )}
              </EmptyTitle>
              <EmptyDescription>
                {localize(
                  'The guidance service did not identify a concrete intervention.',
                  '教练服务没有识别出需要立即干预的问题。'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {result && result.events.length > 0 && (
          <div className='space-y-3'>
            {result.events.map((event) => (
              <article
                key={`${event.eventType}:${event.title}:${event.message}:${event.suggestedText ?? ''}`}
                className='space-y-2 border-b pb-3 last:border-b-0'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge
                    variant={
                      event.severity === 'error' || event.severity === 'warning'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {event.severity}
                  </Badge>
                  <h3 className='font-medium'>{event.title}</h3>
                </div>
                <p className='text-sm'>{event.message}</p>
                {event.suggestedText && (
                  <p className='bg-muted text-muted-foreground rounded-md p-2 text-sm'>
                    {event.suggestedText}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        {hasMessages && (
          <section className='space-y-3 border-t pt-4'>
            <div className='flex items-center justify-between gap-2'>
              <h3 className='flex items-center gap-2 text-sm font-medium'>
                <History className='size-4' />
                {localize('Saved guidance', '已保存提示')}
              </h3>
              {history && (
                <Badge variant='secondary'>
                  {history.historyLimit
                    ? `${history.historyCount}/${history.historyLimit}`
                    : history.historyCount}
                </Badge>
              )}
            </div>

            {historyPending && !history && (
              <div className='space-y-2'>
                <Skeleton className='h-4 w-1/2' />
                <Skeleton className='h-12 w-full' />
              </div>
            )}

            {!historyPending && history && snapshots.length === 0 && (
              <p className='text-muted-foreground text-sm'>
                {localize(
                  'No saved guidance for this path.',
                  '当前路径还没有已保存的教练提示。'
                )}
              </p>
            )}

            {snapshots.map((snapshot) => (
              <article
                key={snapshot.snapshotId}
                className='space-y-2 border-b pb-3 last:border-b-0'
              >
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <Badge variant='outline'>
                    {snapshot.eventCount} {localize('items', '条')}
                  </Badge>
                  {guidanceTimestamp(snapshot.persistedAt) && (
                    <span className='text-muted-foreground text-xs'>
                      {guidanceTimestamp(snapshot.persistedAt)}
                    </span>
                  )}
                </div>
                {snapshot.events.length === 0 ? (
                  <p className='text-muted-foreground text-sm'>
                    {localize(
                      'No intervention was recorded.',
                      '该次未记录需要干预的问题。'
                    )}
                  </p>
                ) : (
                  snapshot.events.map((event) => (
                    <div
                      key={`${snapshot.snapshotId}:${event.eventType}:${event.title}:${event.message}`}
                      className='space-y-1'
                    >
                      <div className='text-sm font-medium'>{event.title}</div>
                      <p className='text-muted-foreground text-sm'>
                        {event.message}
                      </p>
                    </div>
                  ))
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </ScrollArea>
  )
}

function AnalysisTab({
  session,
  trainingApiBase,
  localize,
}: {
  readonly session: TrainingConversationSessionContext
  readonly trainingApiBase: string
  readonly localize: (english: string, chinese: string) => string
}) {
  const [report, setReport] =
    useState<TrainingConversationReportSummary | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const completion = completionReportMetadata(session.metadata)
  const reportId =
    session.reportId || textValue(completion?.reportId ?? completion?.report_id)
  const completionStatus = textValue(completion?.status)
  const completionError = textValue(
    completion?.message ?? completion?.error ?? completion?.error_message
  )

  const loadReport = useCallback(async () => {
    if (!reportId) return
    setPending(true)
    setError(null)
    try {
      setReport(
        await loadTrainingConversationReportSummary(
          trainingApiBase,
          session.sessionId
        )
      )
    } catch (requestError) {
      setError(
        errorText(
          requestError,
          localize('Unable to load the report.', '无法加载复盘报告。')
        )
      )
    } finally {
      setPending(false)
    }
  }, [localize, reportId, session.sessionId, trainingApiBase])

  useEffect(() => {
    setReport(null)
    setError(null)
    if (reportId) void loadReport()
  }, [loadReport, reportId])

  if (!reportId) {
    if (completionStatus === 'failed') {
      return (
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>
              {localize('Report generation failed', '复盘报告生成失败')}
            </AlertTitle>
            <AlertDescription>
              {completionError ||
                localize(
                  'The session is preserved, but no report was attached.',
                  '会话仍然保留，但没有生成可用的复盘报告。'
                )}
            </AlertDescription>
          </Alert>
        </div>
      )
    }
    let emptyTitle = localize(
      'No report attached yet',
      '当前会话还没有复盘报告'
    )
    if (completionStatus === 'pending') {
      emptyTitle = localize('Report is being generated', '复盘报告正在生成')
    }
    return (
      <Empty className='border-none py-10'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <BookOpen />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>
            {completionStatus === 'pending'
              ? localize(
                  'Return after the session completion workflow finishes.',
                  '请在会话完成流程结束后回来查看。'
                )
              : localize(
                  'Complete this training session before opening its analysis.',
                  '完成训练会话后才能打开分析摘要。'
                )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ScrollArea className='h-full'>
      <div className='space-y-4 p-4'>
        {error && (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>
              {localize('Report unavailable', '复盘报告不可用')}
            </AlertTitle>
            <AlertDescription className='space-y-2'>
              <p>{error}</p>
              <Button
                disabled={pending}
                size='sm'
                variant='outline'
                onClick={loadReport}
              >
                <RefreshCw />
                {localize('Try again', '重试')}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {pending && !report && (
          <div className='space-y-3'>
            <Skeleton className='h-5 w-1/2' />
            <Skeleton className='h-24 w-full' />
          </div>
        )}
        {!pending && report && (
          <>
            <section className='space-y-2 border-b pb-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h3 className='font-medium'>
                  {localize('Analysis summary', '分析摘要')}
                </h3>
                {report.createdAt && (
                  <span className='text-muted-foreground text-xs'>
                    {new Date(report.createdAt).toLocaleString()}
                  </span>
                )}
              </div>
              {report.summary ? (
                <p className='text-sm leading-6'>{report.summary}</p>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {localize(
                    'The report has no summary text.',
                    '报告没有摘要正文。'
                  )}
                </p>
              )}
            </section>
            {report.suggestions.length > 0 ? (
              <section className='space-y-3'>
                <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase'>
                  <Lightbulb className='size-3.5' />
                  {localize('Communication suggestions', '沟通建议')}
                </div>
                {report.suggestions.map((suggestion) => (
                  <article
                    key={`${suggestion.counterpart ?? ''}:${suggestion.priority ?? ''}:${suggestion.suggestion}`}
                    className='space-y-1 border-b pb-3 last:border-b-0'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      {suggestion.counterpart && (
                        <span className='font-medium'>
                          {suggestion.counterpart}
                        </span>
                      )}
                      {suggestion.priority && (
                        <Badge variant='outline'>{suggestion.priority}</Badge>
                      )}
                    </div>
                    <p className='text-sm'>{suggestion.suggestion}</p>
                  </article>
                ))}
              </section>
            ) : (
              <Empty className='border-none py-8'>
                <EmptyHeader>
                  <EmptyTitle>
                    {localize(
                      'No structured suggestions',
                      '没有结构化沟通建议'
                    )}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  )
}

export function TrainingConversationInsights({
  desktopExpanded,
  mobileOpen,
  onDesktopExpandedChange,
  onMobileOpenChange,
  initialTab = 'context',
  isGenerating,
  isLoadingConversation,
  trainingApiBase,
  trainingSession,
  messages,
  selectedTailId,
}: TrainingConversationInsightsProps) {
  const { i18n, t } = useTranslation()
  const [tab, setTab] = useState<InsightTab>(initialTab)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [guidanceResult, setGuidanceResult] =
    useState<TrainingConversationGuidanceResult | null>(null)
  const [guidanceHistory, setGuidanceHistory] =
    useState<TrainingConversationGuidanceHistoryResult | null>(null)
  const [guidancePending, setGuidancePending] = useState(false)
  const [historyPending, setHistoryPending] = useState(false)
  const [guidanceError, setGuidanceError] =
    useState<GuidanceDisplayError | null>(null)
  const [historyError, setHistoryError] = useState<GuidanceDisplayError | null>(
    null
  )
  const guidanceAbortRef = useRef<AbortController | null>(null)
  const historyAbortRef = useRef<AbortController | null>(null)
  const autoRefreshStateRef = useRef(EMPTY_TRAINING_GUIDANCE_AUTO_REFRESH_STATE)
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const selectedTail = selectedTailId?.trim() || null
  const sessionIsActive =
    !trainingSession.status || trainingSession.status === 'active'
  const hasGuidanceMessages =
    !isLoadingConversation &&
    messages.some((message) => Boolean(message.content.trim()))

  const refreshGuidanceHistory = useCallback(async () => {
    if (!selectedTail || !hasGuidanceMessages) return
    historyAbortRef.current?.abort()
    const controller = new AbortController()
    historyAbortRef.current = controller
    setHistoryPending(true)
    setHistoryError(null)
    try {
      const next = await loadTrainingConversationGuidanceHistory(
        trainingApiBase,
        trainingSession,
        selectedTail,
        controller.signal
      )
      if (historyAbortRef.current === controller) setGuidanceHistory(next)
    } catch (requestError) {
      if (
        !isAbortError(requestError) &&
        historyAbortRef.current === controller
      ) {
        setHistoryError(guidanceDisplayError(requestError, localize, 'history'))
      }
    } finally {
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null
        setHistoryPending(false)
      }
    }
  }, [
    hasGuidanceMessages,
    localize,
    selectedTail,
    trainingApiBase,
    trainingSession,
  ])

  const requestGuidance = useCallback(async () => {
    if (
      guidanceAbortRef.current ||
      !hasGuidanceMessages ||
      !selectedTail ||
      !sessionIsActive
    ) {
      return
    }

    const controller = new AbortController()
    guidanceAbortRef.current = controller
    setGuidancePending(true)
    setGuidanceError(null)
    try {
      const next = await requestTrainingConversationGuidance(
        trainingApiBase,
        trainingSession,
        messages,
        selectedTail,
        controller.signal
      )
      if (
        next.selectedTailMessageId &&
        next.selectedTailMessageId !== selectedTail
      ) {
        throw new Error(
          'Unable to load training guidance: response did not match the selected path'
        )
      }
      if (guidanceAbortRef.current !== controller) return
      setGuidanceResult(next)
      if (next.history.length > 0) {
        setGuidanceHistory({
          status: 'ready',
          retryable: next.persistence.retryable,
          selectedTailMessageId: selectedTail,
          history: next.history,
          historyCount: next.persistence.historyCount ?? next.history.length,
          historyLimit: next.persistence.historyLimit,
          persistence: next.persistence,
          capabilities: next.capabilities,
        })
      }
      if (
        next.capabilities.history ||
        next.persistence.persisted ||
        next.history.length > 0
      ) {
        await refreshGuidanceHistory()
      }
    } catch (requestError) {
      if (
        !isAbortError(requestError) &&
        guidanceAbortRef.current === controller
      ) {
        setGuidanceError(
          guidanceDisplayError(requestError, localize, 'guidance')
        )
      }
    } finally {
      if (guidanceAbortRef.current === controller) {
        guidanceAbortRef.current = null
        setGuidancePending(false)
      }
    }
  }, [
    hasGuidanceMessages,
    localize,
    messages,
    refreshGuidanceHistory,
    selectedTail,
    sessionIsActive,
    trainingApiBase,
    trainingSession,
  ])

  useEffect(() => {
    guidanceAbortRef.current?.abort()
    guidanceAbortRef.current = null
    historyAbortRef.current?.abort()
    historyAbortRef.current = null
    setGuidanceResult(null)
    setGuidanceHistory(null)
    setGuidanceError(null)
    setHistoryError(null)
    setGuidancePending(false)
    setHistoryPending(false)
    if (selectedTail && hasGuidanceMessages) {
      void refreshGuidanceHistory()
    }
  }, [
    hasGuidanceMessages,
    refreshGuidanceHistory,
    selectedTail,
    sessionIsActive,
    trainingSession.sessionId,
  ])

  useEffect(() => {
    const decision = decideTrainingGuidanceAutoRefresh(
      autoRefreshStateRef.current,
      {
        enabled: autoRefreshEnabled,
        isGenerating,
        isLoading: isLoadingConversation,
        messages,
        selectedTailId: selectedTail,
        sessionId: trainingSession.sessionId,
      }
    )
    autoRefreshStateRef.current = decision.state
    if (decision.shouldRefresh) void requestGuidance()
  }, [
    autoRefreshEnabled,
    isGenerating,
    isLoadingConversation,
    messages,
    requestGuidance,
    selectedTail,
    trainingSession.sessionId,
  ])

  useEffect(
    () => () => {
      guidanceAbortRef.current?.abort()
      historyAbortRef.current?.abort()
    },
    []
  )

  useEffect(() => {
    if (desktopExpanded || mobileOpen) setTab(initialTab)
  }, [desktopExpanded, initialTab, mobileOpen])

  const insightTabs = (
    <Tabs
      className='min-h-0 flex-1 px-4 pb-4'
      value={tab}
      onValueChange={(value) => setTab(value as InsightTab)}
    >
      <TabsList className='w-full' variant='line'>
        <TabsTrigger value='context'>
          <BookOpen />
          {localize('Context', '上下文')}
        </TabsTrigger>
        <TabsTrigger value='guidance'>
          <Lightbulb />
          {localize('Coach', '教练')}
        </TabsTrigger>
        <TabsTrigger value='analysis'>
          <MessageSquareText />
          {localize('Analysis', '分析')}
        </TabsTrigger>
      </TabsList>
      <TabsContent className='min-h-0' value='context'>
        <ContextTab
          localize={localize}
          messages={messages}
          session={trainingSession}
        />
      </TabsContent>
      <TabsContent className='min-h-0' value='guidance'>
        <GuidanceTab
          autoRefreshEnabled={autoRefreshEnabled}
          error={guidanceError}
          history={guidanceHistory}
          historyError={historyError}
          historyPending={historyPending}
          isLoading={isLoadingConversation}
          localize={localize}
          messages={messages}
          pending={guidancePending}
          result={guidanceResult}
          session={trainingSession}
          onAutoRefreshEnabledChange={setAutoRefreshEnabled}
          onRequestGuidance={() => void requestGuidance()}
          onRetryHistory={() => void refreshGuidanceHistory()}
        />
      </TabsContent>
      <TabsContent className='min-h-0' value='analysis'>
        {(desktopExpanded || mobileOpen) && tab === 'analysis' && (
          <AnalysisTab
            localize={localize}
            session={trainingSession}
            trainingApiBase={trainingApiBase}
          />
        )}
      </TabsContent>
    </Tabs>
  )

  return (
    <>
      {desktopExpanded && (
        <aside
          aria-label={localize('Training insights', '训练洞察')}
          className='bg-background hidden w-80 shrink-0 flex-col border-l lg:flex'
        >
          <div className='flex min-h-14 items-start justify-between gap-3 border-b px-4 py-3'>
            <div className='min-w-0'>
              <h2 className='text-sm font-semibold'>
                {localize('Training insights', '训练洞察')}
              </h2>
              <p className='text-muted-foreground mt-0.5 line-clamp-2 text-xs'>
                {localize(
                  'Live coaching and review evidence',
                  '实时教练提示与复盘证据'
                )}
              </p>
            </div>
            <Button
              aria-label={localize(
                'Collapse training insights',
                '收起训练洞察'
              )}
              size='icon-sm'
              variant='ghost'
              onClick={() => onDesktopExpandedChange(false)}
            >
              <PanelRightClose />
            </Button>
          </div>
          {insightTabs}
        </aside>
      )}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent className='w-full sm:max-w-lg lg:hidden'>
          <SheetHeader>
            <SheetTitle>{localize('Training insights', '训练洞察')}</SheetTitle>
            <SheetDescription>
              {localize(
                'Session context, selected-path guidance, and available review evidence.',
                '查看会话上下文、当前路径教练提示和已有复盘证据。'
              )}
            </SheetDescription>
          </SheetHeader>
          {insightTabs}
        </SheetContent>
      </Sheet>
    </>
  )
}

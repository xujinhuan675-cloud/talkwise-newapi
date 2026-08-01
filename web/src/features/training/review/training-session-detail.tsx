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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  CircleAlert,
  FileText,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  getReviewSession,
  getTrainingSessionReport,
  getReviewBranchContext,
  listScenarioProgress,
  progressForReviewSession,
  reviewRequestAccessState,
  reviewRequestErrorMessage,
} from './api'
import { ReviewReportDetails } from './report-details'
import { ReviewSessionReplay } from './session-replay'
import type { ReviewEvaluationState, ScenarioProgress } from './types'

function formatDate(value: string | null, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pathTextStateLabel(
  state: 'id_only' | 'reference_only' | 'with_text',
  localize: (english: string, chinese: string) => string
): string {
  if (state === 'id_only') return localize('IDs only', '仅节点 ID')
  if (state === 'with_text') {
    return localize('Path text included', '包含路径正文')
  }
  return localize('References only', '仅引用信息')
}

function progressScoreLabel(
  progress: ScenarioProgress | null,
  evaluation: ReviewEvaluationState | null,
  localize: (english: string, chinese: string) => string
): string {
  if (evaluation?.status === 'failed') {
    return localize('Failed', '评分失败')
  }
  if (evaluation?.status === 'unavailable') {
    return localize('Unavailable', '评分不可用')
  }
  if (progress?.score !== null && progress?.score !== undefined) {
    return `${progress.score}/100`
  }
  if (progress?.scoreStatus === 'pending') {
    return localize('Pending', '待评分')
  }
  return localize('Not recorded', '未记录')
}

function accessErrorCopy(
  error: unknown,
  localize: (english: string, chinese: string) => string
): { description: string; title: string } | null {
  const accessState = reviewRequestAccessState(error)
  if (accessState === 'unauthorized') {
    return {
      title: localize('Sign-in required', '需要登录'),
      description: localize(
        'Your authenticated session is no longer valid. Sign in again to continue.',
        '当前登录会话已失效，请重新登录后继续。'
      ),
    }
  }
  if (accessState === 'forbidden') {
    return {
      title: localize('Access denied', '无权访问'),
      description: localize(
        'You do not have permission to view this training resource.',
        '你没有查看该训练资源的权限。'
      ),
    }
  }
  return null
}

function TrainingSessionDetailContent({ sessionId }: { sessionId: string }) {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const sessionQuery = useQuery({
    queryKey: ['training', 'review-session', host.apiBase, sessionId],
    queryFn: () => getReviewSession(host.apiBase, sessionId),
    enabled: host.authStatus === 'authenticated',
    refetchInterval: (query) =>
      query.state.data?.reportState.status === 'pending' ? 3000 : false,
  })
  const progressQuery = useQuery({
    queryKey: [
      'training',
      'review-progress',
      host.apiBase,
      sessionQuery.data?.reportState.status,
    ],
    queryFn: () => listScenarioProgress(host.apiBase, { skip: 0, limit: 500 }),
    enabled:
      host.authStatus === 'authenticated' && Boolean(sessionQuery.data?.id),
  })
  const progress = sessionQuery.data
    ? progressForReviewSession(
        progressQuery.data?.items ?? [],
        sessionQuery.data.id
      )
    : null
  const reportState = sessionQuery.data?.reportState
  const hasReportReference = Boolean(
    sessionQuery.data?.reportId || progress?.reportId
  )
  const canReadReport = hasReportReference && reportState?.status === 'ready'
  const reportQuery = useQuery({
    queryKey: ['training', 'review-report', host.apiBase, sessionId],
    queryFn: () => getTrainingSessionReport(host.apiBase, sessionId),
    enabled: host.authStatus === 'authenticated' && canReadReport,
  })

  if (host.authStatus === 'anonymous') {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Sign-in required', '\u9700\u8981\u767b\u5f55')}
        </AlertTitle>
        <AlertDescription>
          {localize(
            'Your session is no longer available.',
            '\u5f53\u524d\u767b\u5f55\u4f1a\u8bdd\u5df2\u4e0d\u53ef\u7528\u3002'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (host.authStatus === 'loading' || sessionQuery.isPending) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    )
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    const accessCopy = accessErrorCopy(sessionQuery.error, localize)
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {accessCopy?.title ||
            localize(
              'Failed to load training session',
              '\u8bad\u7ec3\u4f1a\u8bdd\u52a0\u8f7d\u5931\u8d25'
            )}
        </AlertTitle>
        <AlertDescription>
          {accessCopy?.description ||
            reviewRequestErrorMessage(
              sessionQuery.error,
              localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
            )}
        </AlertDescription>
        {!accessCopy && (
          <div className='col-start-2 mt-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void sessionQuery.refetch()}
            >
              <RefreshCw />
              {localize('Retry', '\u91cd\u8bd5')}
            </Button>
          </div>
        )}
      </Alert>
    )
  }

  const session = sessionQuery.data
  const branchContext = getReviewBranchContext({
    session,
    report: reportQuery.data,
    progress,
  })
  const sourceLabel = (source: 'session' | 'report' | 'progress') => {
    const labels = {
      session: ['Session data', '会话数据'],
      report: ['Review report', '复盘报告'],
      progress: ['Progress record', '进度记录'],
    } as const
    const [english, chinese] = labels[source]
    return localize(english, chinese)
  }
  const progressAccessCopy = accessErrorCopy(progressQuery.error, localize)
  const reportAccessCopy = accessErrorCopy(reportQuery.error, localize)
  return (
    <div className='space-y-3'>
      <Card>
        <CardHeader>
          <CardTitle>{session.title}</CardTitle>
          <CardDescription>
            {session.description || session.role}
          </CardDescription>
          <div className='flex flex-wrap gap-2 pt-2'>
            <Badge variant='outline'>{sourceLabel('session')}</Badge>
            {progress && (
              <Badge variant='secondary'>{sourceLabel('progress')}</Badge>
            )}
            {hasReportReference && (
              <Badge variant='secondary'>
                {localize('Report reference', '报告引用')}
              </Badge>
            )}
            {session.reportState.status === 'pending' && (
              <Badge variant='secondary'>
                {localize('Report generating', '报告生成中')}
              </Badge>
            )}
            {session.reportState.status === 'failed' && (
              <Badge variant='destructive'>
                {localize('Report failed', '报告失败')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className='grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3'>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Status', '\u72b6\u6001')}
              </dt>
              <dd className='mt-1 capitalize'>{session.status}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Progress score', '进度评分')}
              </dt>
              <dd className='mt-1 tabular-nums'>
                {progressScoreLabel(
                  progress,
                  session.evaluationState,
                  localize
                )}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Mode', '\u6a21\u5f0f')}
              </dt>
              <dd className='mt-1 capitalize'>{session.mode}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Messages', '\u6d88\u606f')}
              </dt>
              <dd className='mt-1 tabular-nums'>{session.messageCount}</dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Started', '\u5f00\u59cb\u65f6\u95f4')}
              </dt>
              <dd className='mt-1'>
                {formatDate(session.startedAt, i18n.language)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Completed', '\u5b8c\u6210\u65f6\u95f4')}
              </dt>
              <dd className='mt-1'>
                {formatDate(session.completedAt, i18n.language)}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground text-xs'>
                {localize('Session ID', '\u4f1a\u8bdd ID')}
              </dt>
              <dd className='mt-1 truncate font-mono text-xs'>{session.id}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {progressQuery.isError && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {progressAccessCopy?.title ||
              localize('Progress record unavailable', '进度记录暂不可用')}
          </AlertTitle>
          <AlertDescription>
            {progressAccessCopy?.description ||
              reviewRequestErrorMessage(
                progressQuery.error,
                localize('Request failed', '请求失败')
              )}
          </AlertDescription>
        </Alert>
      )}
      {session.evaluationState?.status === 'failed' && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize('Score evaluation failed', '评分失败')}
          </AlertTitle>
          <AlertDescription>
            {session.evaluationState.message ||
              localize(
                'The review report is ready, but the server could not produce a score.',
                '复盘报告已生成，但服务端未能生成评分。'
              )}
          </AlertDescription>
        </Alert>
      )}
      {session.evaluationState?.status === 'unavailable' && (
        <Alert>
          <CircleAlert />
          <AlertTitle>{localize('Score unavailable', '评分不可用')}</AlertTitle>
          <AlertDescription>
            {session.evaluationState.message ||
              localize(
                'The review report is ready, but no score was produced.',
                '复盘报告已生成，但未产生评分。'
              )}
          </AlertDescription>
        </Alert>
      )}
      <ReviewSessionReplay
        locale={i18n.language}
        localize={localize}
        roomId={session.roomId}
        sessionId={session.id}
      />
      {session.reportState.status === 'not_requested' && (
        <div className='rounded-lg border p-8'>
          <Empty className='border-none p-0'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <FileText />
              </EmptyMedia>
              <EmptyTitle>
                {localize(
                  'No review report yet',
                  '\u6682\u65e0\u590d\u76d8\u62a5\u544a'
                )}
              </EmptyTitle>
              <EmptyDescription>
                {localize(
                  'This session has not generated a report.',
                  '\u6b64\u6b21\u8bad\u7ec3\u5c1a\u672a\u751f\u6210\u590d\u76d8\u62a5\u544a\u3002'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}
      {session.reportState.status === 'pending' && (
        <Alert>
          <LoaderCircle className='animate-spin' />
          <AlertTitle>
            {localize('Generating review report', '正在生成复盘报告')}
          </AlertTitle>
          <AlertDescription>
            {localize(
              'This page will refresh when the server publishes the report.',
              '服务端发布报告后，本页会自动刷新。'
            )}
          </AlertDescription>
        </Alert>
      )}
      {session.reportState.status === 'failed' && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize('Review report generation failed', '复盘报告生成失败')}
          </AlertTitle>
          <AlertDescription>
            {session.reportState.message ||
              localize(
                'The server did not publish a report for this completion attempt.',
                '服务端未能为本次完成尝试发布报告。'
              )}
          </AlertDescription>
        </Alert>
      )}
      {session.reportState.status === 'unavailable' && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize('Review report unavailable', '复盘报告不可用')}
          </AlertTitle>
          <AlertDescription>
            {localize(
              'The completion record does not contain a readable report reference.',
              '完成记录中没有可读取的报告引用。'
            )}
          </AlertDescription>
        </Alert>
      )}
      {canReadReport && reportQuery.isPending && (
        <Skeleton className='h-48 w-full' />
      )}
      {canReadReport && reportQuery.isError && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {reportAccessCopy?.title ||
              localize(
                'Failed to load review report',
                '\u590d\u76d8\u62a5\u544a\u52a0\u8f7d\u5931\u8d25'
              )}
          </AlertTitle>
          <AlertDescription>
            {reportAccessCopy?.description ||
              reviewRequestErrorMessage(
                reportQuery.error,
                localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
              )}
          </AlertDescription>
          {!reportAccessCopy && (
            <div className='col-start-2 mt-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void reportQuery.refetch()}
              >
                <RefreshCw />
                {localize('Retry', '\u91cd\u8bd5')}
              </Button>
            </div>
          )}
        </Alert>
      )}
      {reportQuery.data && (
        <ReviewReportDetails
          report={reportQuery.data}
          branchContext={branchContext}
          locale={i18n.language}
          localize={localize}
        />
      )}
      {branchContext && (
        <Card>
          <CardHeader>
            <CardTitle>{localize('Selected path', '选中路径')}</CardTitle>
            <CardDescription>
              {sourceLabel(branchContext.source)} · {branchContext.sourceDetail}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex flex-wrap gap-2 text-xs'>
              {branchContext.branchId && (
                <Badge variant='outline'>
                  {localize('Branch', '分支')}: {branchContext.branchId}
                </Badge>
              )}
              {branchContext.selectedTailMessageId && (
                <Badge variant='outline'>
                  {localize('Tail', '尾节点')}:{' '}
                  {branchContext.selectedTailMessageId}
                </Badge>
              )}
              {branchContext.pathCount && (
                <Badge variant='outline'>
                  {localize('Nodes', '节点')}: {branchContext.pathCount}
                </Badge>
              )}
              <Badge variant='secondary'>
                {pathTextStateLabel(branchContext.pathTextState, localize)}
              </Badge>
            </div>
            {branchContext.pathSummary && (
              <p className='text-sm leading-6'>{branchContext.pathSummary}</p>
            )}
            {branchContext.lastReplyPreview && (
              <p className='text-muted-foreground text-sm leading-6'>
                {branchContext.lastReplyPreview}
              </p>
            )}
            {branchContext.pathTextState === 'id_only' && (
              <Empty className='border-none p-0'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <FileText />
                  </EmptyMedia>
                  <EmptyTitle>
                    {localize('Path text is not available', '路径只有节点 ID')}
                  </EmptyTitle>
                  <EmptyDescription>
                    {localize(
                      'The selected path can be reopened from the conversation workspace, but this review payload does not include message text.',
                      '当前复盘数据只包含节点 ID，可回到会话工作区查看正文。'
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {branchContext.pathTextState === 'reference_only' && (
              <p className='text-muted-foreground text-sm'>
                {localize(
                  'Only path references were persisted; no summary text was fabricated.',
                  '只持久化了路径引用，页面不会伪造摘要。'
                )}
              </p>
            )}
            {branchContext.selectedPath.length > 0 && (
              <ol className='space-y-2 text-sm'>
                {branchContext.selectedPath.map((item) => (
                  <li
                    key={item.publicId}
                    className='rounded-md border px-3 py-2'
                  >
                    <span className='text-muted-foreground mr-2 font-mono text-xs'>
                      {item.publicId}
                    </span>
                    {item.content ||
                      localize('Node text unavailable', '节点正文不可用')}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function TrainingSessionDetailPage({
  sessionId,
}: {
  sessionId: string
}) {
  const { i18n, t } = useTranslation()
  const title = t('Session review', {
    defaultValue: i18n.language.startsWith('zh')
      ? '\u8bad\u7ec3\u590d\u76d8'
      : 'Session review',
  })

  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Breadcrumb>
          <Button
            variant='ghost'
            size='sm'
            render={<Link to='/training/sessions' />}
          >
            <ArrowLeft />
            {t('Training sessions', {
              defaultValue: i18n.language.startsWith('zh')
                ? '\u8bad\u7ec3\u8bb0\u5f55'
                : 'Training sessions',
            })}
          </Button>
        </SectionPageLayout.Breadcrumb>
        <SectionPageLayout.Title>{title}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <TrainingSessionDetailContent sessionId={sessionId} />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

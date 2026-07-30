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
import { ArrowLeft, CircleAlert, FileText, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  reviewRequestErrorMessage,
} from './api'

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
  })
  const reportQuery = useQuery({
    queryKey: ['training', 'review-report', host.apiBase, sessionId],
    queryFn: () => getTrainingSessionReport(host.apiBase, sessionId),
    enabled:
      host.authStatus === 'authenticated' &&
      Boolean(sessionQuery.data?.reportId),
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
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize(
            'Failed to load training session',
            '\u8bad\u7ec3\u4f1a\u8bdd\u52a0\u8f7d\u5931\u8d25'
          )}
        </AlertTitle>
        <AlertDescription>
          {reviewRequestErrorMessage(
            sessionQuery.error,
            localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
          )}
        </AlertDescription>
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
      </Alert>
    )
  }

  const session = sessionQuery.data
  return (
    <div className='space-y-3'>
      <Card>
        <CardHeader>
          <CardTitle>{session.title}</CardTitle>
          <CardDescription>
            {session.description || session.role}
          </CardDescription>
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

      {!session.reportId && (
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
      {session.reportId && reportQuery.isPending && (
        <Skeleton className='h-48 w-full' />
      )}
      {session.reportId && reportQuery.isError && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize(
              'Failed to load review report',
              '\u590d\u76d8\u62a5\u544a\u52a0\u8f7d\u5931\u8d25'
            )}
          </AlertTitle>
          <AlertDescription>
            {reviewRequestErrorMessage(
              reportQuery.error,
              localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
            )}
          </AlertDescription>
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
        </Alert>
      )}
      {reportQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle>
              {localize('Review report', '\u590d\u76d8\u62a5\u544a')}
            </CardTitle>
            <CardDescription>
              {formatDate(reportQuery.data.created_at ?? null, i18n.language)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reportQuery.data.summary ? (
              <p className='leading-6 whitespace-pre-wrap'>
                {reportQuery.data.summary}
              </p>
            ) : (
              <span className='text-muted-foreground'>
                {localize(
                  'The report has no summary text.',
                  '\u8be5\u62a5\u544a\u672a\u5305\u542b\u6458\u8981\u6b63\u6587\u3002'
                )}
              </span>
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

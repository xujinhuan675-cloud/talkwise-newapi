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
import {
  Activity,
  CircleAlert,
  FileVideo,
  LoaderCircle,
  MessageSquareText,
  Play,
  RefreshCw,
} from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getFreshAuthHeaders } from '@/lib/api'

import {
  loadTrainingRoomMessages,
  type TrainingRoomMessage,
  type TrainingRoomVideoAnswer,
} from '../studio/training-room-client'
import { reviewRequestAccessState, reviewRequestErrorMessage } from './api'
import {
  buildReviewEmotionChart,
  isNumericReviewRoomId,
  reviewEmotionPoints,
  reviewReplayMessages,
  reviewVideoReplayUrl,
  type ReviewReplayBinding,
} from './session-replay-contract'

type Localize = (english: string, chinese: string) => string

const VIDEO_REPLAY_MAX_BYTES = 100 * 1024 * 1024
const EMOTION_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

function formatDate(value: string | null, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(value: number | null, localize: Localize): string {
  if (value === null || value < 0) {
    return localize('Duration unknown', '时长未记录')
  }
  const seconds = Math.round(value / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes > 0
    ? localize(`${minutes}m ${remainder}s`, `${minutes} 分 ${remainder} 秒`)
    : localize(`${seconds}s`, `${seconds} 秒`)
}

function formatSize(value: number | null): string | null {
  if (value === null || value <= 0) return null
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function speakerLabel(message: TrainingRoomMessage, localize: Localize) {
  if (message.senderType === 'user') return localize('You', '你')
  if (message.senderType === 'persona') {
    return message.senderId || localize('Counterpart', '对话对象')
  }
  return localize('System', '系统')
}

async function loadVideoBlob(url: string, localize: Localize): Promise<Blob> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      Accept: 'video/*',
      ...(await getFreshAuthHeaders()),
    },
  })
  if (!response.ok) {
    throw Object.assign(
      new Error(localize('Video replay failed', '视频回放失败')),
      {
        status: response.status,
      }
    )
  }
  const contentType = (response.headers.get('content-type') || '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (!contentType?.startsWith('video/')) {
    throw new Error(
      localize(
        'Video replay returned an unsupported media type.',
        '视频回放返回了不支持的媒体类型。'
      )
    )
  }
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > VIDEO_REPLAY_MAX_BYTES) {
    throw new Error(
      localize(
        'Video replay exceeds the supported size.',
        '视频回放超过支持的大小限制。'
      )
    )
  }
  const blob = await response.blob()
  if (blob.size <= 0 || blob.size > VIDEO_REPLAY_MAX_BYTES) {
    throw new Error(
      localize(
        'Video replay returned an invalid media file.',
        '视频回放返回了无效的媒体文件。'
      )
    )
  }
  return blob.type ? blob : new Blob([blob], { type: contentType })
}

function VideoReplay({
  attachment,
  binding,
  localize,
}: {
  attachment: TrainingRoomVideoAnswer
  binding: ReviewReplayBinding
  localize: Localize
}) {
  const replayUrl = reviewVideoReplayUrl(attachment, binding)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    },
    [objectUrl]
  )

  const loadReplay = async () => {
    if (!replayUrl) return
    setIsLoading(true)
    setError(null)
    try {
      const blob = await loadVideoBlob(replayUrl, localize)
      const nextObjectUrl = URL.createObjectURL(blob)
      setObjectUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous)
        return nextObjectUrl
      })
    } catch (loadError) {
      const status =
        loadError && typeof loadError === 'object' && 'status' in loadError
          ? Number(loadError.status)
          : null
      if (status === 401) {
        setError(
          localize(
            'Sign in again to load this recording.',
            '请重新登录后加载该录像。'
          )
        )
      } else if (status === 403) {
        setError(
          localize(
            'You do not have access to this recording.',
            '你没有访问该录像的权限。'
          )
        )
      } else {
        setError(
          loadError instanceof Error
            ? loadError.message
            : localize('Unable to load this recording.', '无法加载该录像。')
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  const mediaDetails = [
    attachment.mimeType,
    formatDuration(attachment.durationMs, localize),
    formatSize(attachment.size),
  ].filter(Boolean)
  let replayContent: ReactNode
  if (!replayUrl) {
    replayContent = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Recording unavailable', '录像不可用')}
        </AlertTitle>
        <AlertDescription>
          {localize(
            'The persisted attachment is missing a valid session-bound replay URL.',
            '已持久化附件中没有有效的会话绑定回放地址。'
          )}
        </AlertDescription>
      </Alert>
    )
  } else if (objectUrl) {
    replayContent = (
      <video
        className='bg-background aspect-video w-full rounded-md border object-contain'
        controls
        preload='metadata'
        src={objectUrl}
      />
    )
  } else {
    replayContent = (
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={isLoading}
        onClick={() => void loadReplay()}
      >
        {isLoading ? <LoaderCircle className='animate-spin' /> : <Play />}
        {localize('Load recording', '加载录像')}
      </Button>
    )
  }

  return (
    <div className='bg-muted/30 mt-3 space-y-3 rounded-md border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <FileVideo className='text-muted-foreground size-4 shrink-0' />
          <span className='text-sm font-medium'>
            {localize('Recorded video answer', '已录制视频回答')}
          </span>
        </div>
        <Badge variant='outline'>{localize('Room message', '房间消息')}</Badge>
      </div>
      {mediaDetails.length > 0 && (
        <p className='text-muted-foreground text-xs'>
          {mediaDetails.join(' · ')}
        </p>
      )}
      {replayContent}
      {error && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>{localize('Replay failed', '回放失败')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function Transcript({
  messages,
  binding,
  locale,
  localize,
}: {
  messages: readonly TrainingRoomMessage[]
  binding: ReviewReplayBinding
  locale: string
  localize: Localize
}) {
  if (messages.length === 0) {
    return (
      <Empty className='border-none py-8'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <MessageSquareText />
          </EmptyMedia>
          <EmptyTitle>
            {localize('No replay messages', '暂无回放消息')}
          </EmptyTitle>
          <EmptyDescription>
            {localize(
              'This room has no persisted conversation messages.',
              '该房间尚无已持久化的对话消息。'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className='divide-y'>
      {messages.map((message) => (
        <article key={message.id} className='space-y-2 py-3 first:pt-0'>
          <div className='flex flex-wrap items-center gap-2 text-xs'>
            <span className='font-medium'>
              {speakerLabel(message, localize)}
            </span>
            <span className='text-muted-foreground'>
              {formatDate(message.timestamp, locale)}
            </span>
            {message.emotionScore !== null && (
              <Badge variant='secondary' className='tabular-nums'>
                {message.emotionScore > 0 ? '+' : ''}
                {message.emotionScore}
                {message.emotionLabel ? ` · ${message.emotionLabel}` : ''}
              </Badge>
            )}
          </div>
          {message.content && (
            <p className='text-sm leading-6 whitespace-pre-wrap'>
              {message.content}
            </p>
          )}
          {message.videoAnswer && (
            <VideoReplay
              attachment={message.videoAnswer}
              binding={binding}
              localize={localize}
            />
          )}
        </article>
      ))}
    </div>
  )
}

function EmotionTrend({
  messages,
  locale,
  localize,
}: {
  messages: readonly TrainingRoomMessage[]
  locale: string
  localize: Localize
}) {
  const chart = useMemo(() => buildReviewEmotionChart(messages), [messages])
  const points = useMemo(() => reviewEmotionPoints(messages), [messages])
  const config = useMemo(
    () =>
      Object.fromEntries(
        chart.series.map((series, index) => [
          series.dataKey,
          {
            color: EMOTION_COLORS[index % EMOTION_COLORS.length],
            label: series.senderId || localize('Counterpart', '对话对象'),
          },
        ])
      ) satisfies ChartConfig,
    [chart.series, localize]
  )

  if (points.length === 0) {
    return (
      <Empty className='border-none py-8'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <Activity />
          </EmptyMedia>
          <EmptyTitle>
            {localize('No observed emotion data', '暂无真实情绪数据')}
          </EmptyTitle>
          <EmptyDescription>
            {localize(
              'No persona message in this replay contains a persisted emotion score. No trend has been inferred.',
              '本次回放没有包含已持久化情绪分数的角色消息，页面不会推测趋势。'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='space-y-4'>
      <ChartContainer config={config} className='aspect-auto h-56 w-full'>
        <LineChart data={chart.rows} margin={{ left: 8, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey='sequence' tickLine={false} axisLine={false} />
          <YAxis domain={[-5, 5]} ticks={[-5, 0, 5]} width={24} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {chart.series.map((series) => (
            <Line
              key={series.dataKey}
              type='linear'
              dataKey={series.dataKey}
              name={series.senderId || localize('Counterpart', '对话对象')}
              stroke={`var(--color-${series.dataKey})`}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
      <div className='divide-y rounded-md border'>
        {points.map((point) => (
          <div
            key={point.messageId}
            className='flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs'
          >
            <div className='min-w-0'>
              <span className='font-medium'>{point.senderId}</span>
              <span className='text-muted-foreground ml-2'>
                {formatDate(point.timestamp, locale)}
              </span>
            </div>
            <Badge variant='outline' className='tabular-nums'>
              {point.score > 0 ? '+' : ''}
              {point.score}
              {point.emotionLabel ? ` · ${point.emotionLabel}` : ''}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReviewSessionReplay({
  locale,
  localize,
  roomId,
  sessionId,
}: {
  locale: string
  localize: Localize
  roomId: string | null | undefined
  sessionId: string
}) {
  const hasNumericRoom = isNumericReviewRoomId(roomId)
  const binding = { roomId: roomId || '', sessionId }
  const messagesQuery = useQuery({
    queryKey: ['training', 'review-room', roomId, sessionId],
    queryFn: () => loadTrainingRoomMessages(roomId || '', sessionId),
    enabled: hasNumericRoom,
  })
  const messages = useMemo(
    () => reviewReplayMessages(messagesQuery.data ?? []),
    [messagesQuery.data]
  )
  const videoCount = messages.filter((message) => message.videoAnswer).length
  const emotionCount = reviewEmotionPoints(messages).length
  const accessState = reviewRequestAccessState(messagesQuery.error)
  let content: ReactNode
  if (!hasNumericRoom) {
    content = (
      <Empty className='border-none py-8'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <MessageSquareText />
          </EmptyMedia>
          <EmptyTitle>
            {localize('No room replay reference', '暂无房间回放引用')}
          </EmptyTitle>
          <EmptyDescription>
            {localize(
              'This session is not bound to a legacy room. Message-tree evidence remains available from the report metadata below.',
              '该会话未绑定 legacy room；消息树证据仍以下方报告 metadata 为准。'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else if (messagesQuery.isPending) {
    content = (
      <div className='space-y-3'>
        <Skeleton className='h-8 w-56' />
        <Skeleton className='h-24 w-full' />
      </div>
    )
  } else if (messagesQuery.isError) {
    let errorTitle = localize('Replay unavailable', '回放不可用')
    if (accessState === 'unauthorized') {
      errorTitle = localize('Sign-in required', '需要登录')
    } else if (accessState === 'forbidden') {
      errorTitle = localize('Access denied', '无权访问')
    }
    const errorDescription =
      accessState === 'forbidden'
        ? localize(
            'You do not have permission to read this training room.',
            '你没有读取该训练房间的权限。'
          )
        : reviewRequestErrorMessage(
            messagesQuery.error,
            localize('Unable to load replay messages.', '无法加载回放消息。')
          )
    content = (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>{errorTitle}</AlertTitle>
        <AlertDescription>{errorDescription}</AlertDescription>
        {accessState === 'request_error' && (
          <div className='col-start-2 mt-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => void messagesQuery.refetch()}
            >
              <RefreshCw />
              {localize('Retry', '重试')}
            </Button>
          </div>
        )}
      </Alert>
    )
  } else {
    content = (
      <Tabs defaultValue='transcript'>
        <TabsList variant='line'>
          <TabsTrigger value='transcript'>
            <MessageSquareText />
            {localize('Transcript', '对话')}
          </TabsTrigger>
          <TabsTrigger value='emotion'>
            <Activity />
            {localize('Emotion trend', '情绪趋势')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='transcript' className='pt-3'>
          <Transcript
            messages={messages}
            binding={binding}
            locale={locale}
            localize={localize}
          />
        </TabsContent>
        <TabsContent value='emotion' className='pt-3'>
          <EmotionTrend
            messages={messages}
            locale={locale}
            localize={localize}
          />
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='space-y-1.5'>
            <CardTitle>{localize('Conversation replay', '对话回放')}</CardTitle>
            <CardDescription>
              {localize(
                'Persisted room messages, recorded answers, and observed emotion signals.',
                '来自房间持久化消息的对话、录像与真实情绪信号。'
              )}
            </CardDescription>
          </div>
          <div className='flex flex-wrap gap-1.5'>
            <Badge variant='outline'>{localize('Room data', '房间数据')}</Badge>
            {videoCount > 0 && (
              <Badge variant='secondary'>
                <FileVideo /> {videoCount}
              </Badge>
            )}
            {emotionCount > 0 && (
              <Badge variant='secondary'>
                <Activity /> {emotionCount}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  )
}

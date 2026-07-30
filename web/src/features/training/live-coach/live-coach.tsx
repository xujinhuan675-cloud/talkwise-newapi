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
  CircleAlert,
  CircleCheck,
  Headphones,
  LoaderCircle,
  Mic,
  Radio,
  Send,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  buildLiveCoachSessionInput,
  getRealtimeReadiness,
  launchTrainingSession,
  persistLiveGuidance,
  requestLiveGuidance,
  trainingStudioErrorMessage,
  type GuidanceSnapshot,
  type RealtimeReadiness,
  type TrainingSession,
} from '../studio/api'

function severityVariant(
  severity: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (severity === 'critical' || severity === 'error') return 'destructive'
  if (severity === 'warning') return 'secondary'
  return 'outline'
}

function LiveCoachContent() {
  const { i18n, t } = useTranslation()
  const { apiBase, authStatus } = useTrainingHost()
  const [activeTab, setActiveTab] = useState('setup')
  const [goal, setGoal] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('Chinese')
  const [targetLanguage, setTargetLanguage] = useState('English')
  const [turn, setTurn] = useState('')
  const [speaker, setSpeaker] = useState<'user' | 'counterpart'>('user')
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [guidance, setGuidance] = useState<GuidanceSnapshot | null>(null)
  const [readiness, setReadiness] = useState<RealtimeReadiness | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isGuiding, setIsGuiding] = useState(false)
  const [isCheckingReadiness, setIsCheckingReadiness] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  const startCoach = async () => {
    setError(null)
    setIsStarting(true)
    try {
      const input = buildLiveCoachSessionInput({
        goal,
        sourceLanguage,
        targetLanguage,
      })
      const nextSession = await launchTrainingSession(apiBase, input)
      setSession(nextSession)
      setGuidance(null)
      setActiveTab('coach')
    } catch (nextError) {
      setError(
        trainingStudioErrorMessage(
          nextError,
          localize('Failed to start live coaching.', '启动实时教练失败。')
        )
      )
    } finally {
      setIsStarting(false)
    }
  }

  const checkReadiness = async () => {
    setError(null)
    setIsCheckingReadiness(true)
    try {
      setReadiness(await getRealtimeReadiness(apiBase))
    } catch (nextError) {
      setError(
        trainingStudioErrorMessage(
          nextError,
          localize(
            'Failed to check realtime readiness.',
            '检查实时链路就绪状态失败。'
          )
        )
      )
    } finally {
      setIsCheckingReadiness(false)
    }
  }

  const requestGuidance = async () => {
    if (!session || !turn.trim()) return
    setError(null)
    setIsGuiding(true)
    try {
      const snapshot = await requestLiveGuidance(apiBase, {
        sessionId: session.sessionId,
        goal,
        speaker,
        text: turn,
      })
      setGuidance(snapshot)
      await persistLiveGuidance(apiBase, {
        sessionId: session.sessionId,
        snapshot,
      })
      setTurn('')
    } catch (nextError) {
      setError(
        trainingStudioErrorMessage(
          nextError,
          localize('Failed to get live guidance.', '获取实时指导失败。')
        )
      )
    } finally {
      setIsGuiding(false)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {localize('Live coach', '实时教练')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          onClick={checkReadiness}
          disabled={isCheckingReadiness}
        >
          {isCheckingReadiness ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <Radio />
          )}
          {isCheckingReadiness
            ? localize('Checking...', '检查中...')
            : localize('Check runtime', '检查实时链路')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-5xl space-y-3'>
          {error && (
            <Alert variant='destructive'>
              <CircleAlert />
              <AlertTitle>
                {localize('Live coach needs attention', '实时教练需要处理')}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {readiness && (
            <Alert variant={readiness.ready ? 'default' : 'destructive'}>
              {readiness.ready ? <CircleCheck /> : <CircleAlert />}
              <AlertTitle>
                {readiness.ready
                  ? localize('Realtime runtime ready', '实时运行时已就绪')
                  : localize(
                      'Realtime runtime unavailable',
                      '实时运行时不可用'
                    )}
              </AlertTitle>
              <AlertDescription>{readiness.message}</AlertDescription>
            </Alert>
          )}

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='space-y-3'
          >
            <TabsList>
              <TabsTrigger value='setup'>
                <Headphones />
                {localize('Setup', '设置')}
              </TabsTrigger>
              <TabsTrigger value='coach' aria-disabled={!session}>
                <Mic />
                {localize('Coach', '教练')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value='setup'>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {localize('Coaching session', '教练会话')}
                  </CardTitle>
                  <CardDescription>
                    {localize(
                      'Start a scoped voice training session before submitting practice turns.',
                      '先启动受当前账户范围约束的语音训练会话，再提交练习片段。'
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2 sm:col-span-2'>
                    <Label htmlFor='live-coach-goal'>
                      {localize('Training objective', '训练目标')}
                    </Label>
                    <Textarea
                      id='live-coach-goal'
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      placeholder={localize(
                        'Practice an interview answer and reduce unnecessary detail.',
                        '练习面试回答，并减少不必要的细节。'
                      )}
                      disabled={isStarting}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='live-coach-source'>
                      {localize('Source language', '源语言')}
                    </Label>
                    <Input
                      id='live-coach-source'
                      value={sourceLanguage}
                      onChange={(event) =>
                        setSourceLanguage(event.target.value)
                      }
                      disabled={isStarting}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='live-coach-target'>
                      {localize('Target language', '目标语言')}
                    </Label>
                    <Input
                      id='live-coach-target'
                      value={targetLanguage}
                      onChange={(event) =>
                        setTargetLanguage(event.target.value)
                      }
                      disabled={isStarting}
                    />
                  </div>
                </CardContent>
                <CardFooter className='justify-end gap-2'>
                  {session && (
                    <Button
                      variant='outline'
                      onClick={() => setDetailsOpen(true)}
                    >
                      {localize('Session details', '会话详情')}
                    </Button>
                  )}
                  <Button
                    onClick={startCoach}
                    disabled={isStarting || authStatus !== 'authenticated'}
                  >
                    {isStarting ? (
                      <LoaderCircle className='animate-spin' />
                    ) : (
                      <Headphones />
                    )}
                    {isStarting
                      ? localize('Starting...', '正在启动...')
                      : localize('Start live coach', '启动实时教练')}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value='coach'>
              <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]'>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {localize('Practice turn', '练习片段')}
                    </CardTitle>
                    <CardDescription>
                      {localize(
                        'Submit the latest turn for a structured guidance response.',
                        '提交最新练习片段，获取结构化指导。'
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    <ToggleGroup
                      value={[speaker]}
                      onValueChange={(values) => {
                        const nextSpeaker = values.find(
                          (value) => value !== speaker
                        )
                        if (nextSpeaker) {
                          setSpeaker(nextSpeaker as typeof speaker)
                        }
                      }}
                      variant='outline'
                      className='grid w-full grid-cols-2 sm:w-64'
                      disabled={!session || isGuiding}
                      aria-label={localize('Turn speaker', '片段说话者')}
                    >
                      <ToggleGroupItem value='user' className='w-full'>
                        {localize('Learner', '练习者')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='counterpart' className='w-full'>
                        {localize('Counterpart', '对练角色')}
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <Textarea
                      value={turn}
                      onChange={(event) => setTurn(event.target.value)}
                      placeholder={localize(
                        'Paste or type the latest spoken turn.',
                        '输入或粘贴最新的口语片段。'
                      )}
                      disabled={!session || isGuiding}
                    />
                  </CardContent>
                  <CardFooter className='justify-end'>
                    <Button
                      onClick={requestGuidance}
                      disabled={!session || !turn.trim() || isGuiding}
                    >
                      {isGuiding ? (
                        <LoaderCircle className='animate-spin' />
                      ) : (
                        <Send />
                      )}
                      {isGuiding
                        ? localize('Coaching...', '指导中...')
                        : localize('Get guidance', '获取指导')}
                    </Button>
                  </CardFooter>
                </Card>

                <Card size='sm'>
                  <CardHeader>
                    <CardTitle>{localize('Guidance', '指导')}</CardTitle>
                    <CardDescription>
                      {guidance?.source
                        ? `${localize('Source', '来源')}: ${guidance.source}`
                        : localize(
                            'No guidance received yet.',
                            '尚未收到指导。'
                          )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    {guidance?.events.map((event) => (
                      <div
                        key={`${event.eventType}-${event.title}-${event.message}`}
                        className='space-y-1 border-b pb-3 last:border-0 last:pb-0'
                      >
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='font-medium'>{event.title}</span>
                          <Badge variant={severityVariant(event.severity)}>
                            {event.severity}
                          </Badge>
                        </div>
                        <p className='text-muted-foreground text-sm'>
                          {event.message}
                        </p>
                        {event.suggestedText && (
                          <p className='text-sm'>{event.suggestedText}</p>
                        )}
                      </div>
                    ))}
                    {guidance && guidance.events.length === 0 && (
                      <p className='text-muted-foreground text-sm'>
                        {localize(
                          'No coaching signal was generated for this turn.',
                          '此片段没有生成新的指导信号。'
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {localize('Live coach session', '实时教练会话')}
              </DialogTitle>
              <DialogDescription>
                {localize(
                  'This session is scoped by the NewAPI host and backed by TalkWise training data.',
                  '该会话由 NewAPI 宿主限定访问范围，并由 TalkWise 训练数据承载。'
                )}
              </DialogDescription>
            </DialogHeader>
            {session && (
              <dl className='grid gap-3 text-sm'>
                <div>
                  <dt className='text-muted-foreground'>
                    {localize('Session', '会话')}
                  </dt>
                  <dd className='mt-1 break-all'>{session.sessionId}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {localize('Room', '房间')}
                  </dt>
                  <dd className='mt-1 break-all'>
                    {session.roomId || localize('Not bound', '未绑定')}
                  </dd>
                </div>
              </dl>
            )}
            <DialogFooter>
              <DialogClose render={<Button variant='outline' />}>
                {localize('Close', '关闭')}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function LiveCoach() {
  return (
    <TrainingHostProvider>
      <LiveCoachContent />
    </TrainingHostProvider>
  )
}

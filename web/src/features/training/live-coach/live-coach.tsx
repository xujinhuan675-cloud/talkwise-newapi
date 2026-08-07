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
  Headphones,
  LoaderCircle,
  MessagesSquare,
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
  launchTrainingSession,
  persistLiveGuidance,
  requestLiveGuidance,
  trainingStudioErrorMessage,
  type GuidanceSnapshot,
  type TrainingSession,
} from '../studio/api'
import {
  CONVERSATION_ASSIST_COPY,
  type ConversationAssistCopy,
} from './product-copy'

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
  const [isStarting, setIsStarting] = useState(false)
  const [isGuiding, setIsGuiding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const localizeProductCopy = (copy: ConversationAssistCopy) =>
    localize(copy.english, copy.chinese)

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
          localize(
            'Failed to start in-conversation assistance.',
            '启动临场辅助失败。'
          )
        )
      )
    } finally {
      setIsStarting(false)
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
          localize(
            'Failed to get in-conversation guidance.',
            '获取临场建议失败。'
          )
        )
      )
    } finally {
      setIsGuiding(false)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {localizeProductCopy(CONVERSATION_ASSIST_COPY.productName)}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-5xl space-y-3'>
          {error && (
            <Alert variant='destructive'>
              <CircleAlert />
              <AlertTitle>
                {localize(
                  'In-conversation assist needs attention',
                  '临场辅助需要处理'
                )}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
                {localize('Prepare', '准备')}
              </TabsTrigger>
              <TabsTrigger value='coach' aria-disabled={!session}>
                <MessagesSquare />
                {localize('During conversation', '会话中')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value='setup' hidden={activeTab !== 'setup'}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {localize(
                      'Prepare in-conversation assistance',
                      '准备临场辅助'
                    )}
                  </CardTitle>
                  <CardDescription>
                    {localizeProductCopy(
                      CONVERSATION_ASSIST_COPY.setupDescription
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2 sm:col-span-2'>
                    <Label htmlFor='live-coach-goal'>
                      {localize('Conversation objective', '当前会话目标')}
                    </Label>
                    <Textarea
                      id='live-coach-goal'
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      placeholder={localize(
                        'Keep the customer engaged, understand the real concern, and avoid conceding too early.',
                        '稳住客户对涨价的异议，确认真实顾虑，并避免过早让步。'
                      )}
                      disabled={isStarting}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='live-coach-source'>
                      {localize('Conversation language', '会话语言')}
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
                      {localize('Suggested reply language', '建议语言')}
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
                      : localize('Start assistance', '开始辅助')}
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value='coach' hidden={activeTab !== 'coach'}>
              <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]'>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {localize('Latest conversation turn', '最新会话片段')}
                    </CardTitle>
                    <CardDescription>
                      {localizeProductCopy(
                        CONVERSATION_ASSIST_COPY.turnDescription
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
                      aria-label={localize('Current speaker', '当前说话者')}
                    >
                      <ToggleGroupItem value='user' className='w-full'>
                        {localizeProductCopy(
                          CONVERSATION_ASSIST_COPY.userSpeaker
                        )}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='counterpart' className='w-full'>
                        {localizeProductCopy(
                          CONVERSATION_ASSIST_COPY.counterpartSpeaker
                        )}
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <Label htmlFor='conversation-assist-turn'>
                      {localize('Latest spoken turn', '刚刚说的话')}
                    </Label>
                    <Textarea
                      id='conversation-assist-turn'
                      value={turn}
                      onChange={(event) => setTurn(event.target.value)}
                      placeholder={localize(
                        'Manually enter or paste the latest thing either person said.',
                        '手动输入或粘贴我或对方刚说的最新一句。'
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
                        ? localize('Analyzing...', '正在分析...')
                        : localize('Generate side guidance', '生成临场建议')}
                    </Button>
                  </CardFooter>
                </Card>

                <Card size='sm'>
                  <CardHeader>
                    <CardTitle>
                      {localize('Side guidance', '临场建议')}
                    </CardTitle>
                    <CardDescription>
                      {guidance?.source
                        ? `${localize('Source', '来源')}: ${guidance.source}`
                        : localize(
                            'Enter the latest turn to see suggested replies, follow-up questions, and risks here.',
                            '提交最新一句后，这里会显示回应建议、追问和风险提醒。'
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
                          'No new side guidance was generated for this turn.',
                          '这一句没有生成新的临场建议。'
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
                {localize('In-conversation assistance session', '临场辅助会话')}
              </DialogTitle>
              <DialogDescription>
                {localize(
                  'This session is limited to the current account and saves guidance through the existing training data contract.',
                  '该会话仅限当前账号访问，并通过现有训练数据契约保存辅助记录。'
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

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
import { Link } from '@tanstack/react-router'
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Play,
  Settings2,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  launchTrainingSession,
  trainingStudioErrorMessage,
  type TrainingFeedbackMode,
  type TrainingSession,
  type TrainingStudioMode,
} from './api'

const MODES: Array<{ value: TrainingStudioMode; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'video', label: 'Video' },
]

const FEEDBACK_MODES: Array<{ value: TrainingFeedbackMode; label: string }> = [
  { value: 'simulation', label: 'Simulation' },
  { value: 'assisted', label: 'Guided' },
  { value: 'drill', label: 'Drill' },
]

function chineseModeLabel(label: string): string {
  if (label === 'Text') return '文本'
  if (label === 'Voice') return '语音'
  return '视频'
}

function chineseFeedbackLabel(label: string): string {
  if (label === 'Simulation') return '模拟'
  if (label === 'Guided') return '引导'
  return '逐项练习'
}

function TrainingStudioContent() {
  const { i18n, t } = useTranslation()
  const { apiBase, authStatus } = useTrainingHost()
  const [role, setRole] = useState('')
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<TrainingStudioMode>('voice')
  const [feedbackMode, setFeedbackMode] =
    useState<TrainingFeedbackMode>('simulation')
  const [session, setSession] = useState<TrainingSession | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  const startSession = async () => {
    setError(null)
    setIsLaunching(true)
    try {
      const nextSession = await launchTrainingSession(apiBase, {
        role,
        goal,
        mode,
        feedbackMode,
      })
      setSession(nextSession)
    } catch (nextError) {
      setError(
        trainingStudioErrorMessage(
          nextError,
          localize('Failed to start training session.', '启动训练会话失败。')
        )
      )
    } finally {
      setIsLaunching(false)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {localize('Training studio', '训练工作台')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto grid w-full max-w-5xl gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]'>
          <Card>
            <CardHeader>
              <CardTitle>{localize('Session setup', '会话设置')}</CardTitle>
              <CardDescription>
                {localize(
                  'Create a scoped TalkWise session from the NewAPI host.',
                  '从 NewAPI 宿主创建受当前账户范围约束的 TalkWise 训练会话。'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              {authStatus !== 'authenticated' && (
                <Alert variant='destructive'>
                  <CircleAlert />
                  <AlertTitle>
                    {localize('Sign in required', '需要登录')}
                  </AlertTitle>
                  <AlertDescription>
                    {localize(
                      'Sign in before starting a training session.',
                      '登录后才能启动训练会话。'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='training-studio-role'>
                    {localize('Learner role', '练习者角色')}
                  </Label>
                  <Input
                    id='training-studio-role'
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder={localize('Account manager', '客户经理')}
                    disabled={isLaunching}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>{localize('Training mode', '训练模式')}</Label>
                  <ToggleGroup
                    value={[mode]}
                    onValueChange={(values) => {
                      const nextMode = values.find((value) => value !== mode)
                      if (nextMode) {
                        setMode(nextMode as TrainingStudioMode)
                      }
                    }}
                    variant='outline'
                    className='grid w-full grid-cols-3'
                    disabled={isLaunching}
                    aria-label={localize('Training mode', '训练模式')}
                  >
                    {MODES.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        className='w-full'
                      >
                        {localize(option.label, chineseModeLabel(option.label))}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </div>

              <div className='space-y-2'>
                <Label htmlFor='training-studio-goal'>
                  {localize('Training objective', '训练目标')}
                </Label>
                <Textarea
                  id='training-studio-goal'
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder={localize(
                    'Handle a pricing objection and agree the next step.',
                    '处理价格异议，并达成明确的下一步。'
                  )}
                  disabled={isLaunching}
                />
              </div>

              <div className='space-y-2'>
                <Label>{localize('Feedback policy', '反馈方式')}</Label>
                <ToggleGroup
                  value={[feedbackMode]}
                  onValueChange={(values) => {
                    const nextMode = values.find(
                      (value) => value !== feedbackMode
                    )
                    if (nextMode) {
                      setFeedbackMode(nextMode as TrainingFeedbackMode)
                    }
                  }}
                  variant='outline'
                  className='grid w-full grid-cols-3'
                  disabled={isLaunching}
                  aria-label={localize('Feedback policy', '反馈方式')}
                >
                  {FEEDBACK_MODES.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className='w-full'
                    >
                      {localize(
                        option.label,
                        chineseFeedbackLabel(option.label)
                      )}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {error && (
                <Alert variant='destructive'>
                  <CircleAlert />
                  <AlertTitle>
                    {localize('Session not started', '会话未启动')}
                  </AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className='justify-end gap-2'>
              <Button
                onClick={startSession}
                disabled={isLaunching || authStatus !== 'authenticated'}
              >
                {isLaunching ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Play />
                )}
                {isLaunching
                  ? localize('Starting...', '正在启动...')
                  : localize('Start session', '启动会话')}
              </Button>
            </CardFooter>
          </Card>

          <Card size='sm'>
            <CardHeader>
              <CardTitle>{localize('Session state', '会话状态')}</CardTitle>
              <CardDescription>
                {localize(
                  'The server owns training identity and room binding.',
                  '服务端负责训练身份范围和房间绑定。'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {session ? (
                <Alert>
                  <CircleCheck />
                  <AlertTitle>
                    {localize('Session active', '会话已激活')}
                  </AlertTitle>
                  <AlertDescription className='space-y-1 break-all'>
                    <div>
                      {localize('Session', '会话')}: {session.sessionId}
                    </div>
                    <div>
                      {localize('Room', '房间')}:{' '}
                      {session.roomId || localize('Not bound', '未绑定')}
                    </div>
                    {session.conversationId && (
                      <div>
                        {localize('Conversation', '对话')}:{' '}
                        {session.conversationId}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className='text-muted-foreground flex min-h-28 items-center text-sm'>
                  {localize(
                    'No session has been started from this workspace.',
                    '当前工作台尚未启动训练会话。'
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className='justify-end'>
              <Button
                variant='outline'
                render={<Link to='/training/conversations' />}
              >
                <Settings2 />
                {localize('Open conversations', '打开对话库')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function TrainingStudio() {
  return (
    <TrainingHostProvider>
      <TrainingStudioContent />
    </TrainingHostProvider>
  )
}

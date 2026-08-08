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
import { useNavigate } from '@tanstack/react-router'
import { CircleAlert, LoaderCircle, Play } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { ModelSelector } from '@/components/model-group-selector'
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
import {
  usePlaygroundOptions,
  usePlaygroundState,
} from '@/features/playground/hooks'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  trainingVoiceRouteLocalizedDescription,
  trainingVoiceRouteLocalizedName,
} from '../training-display-labels'
import { TRAINING_FEEDBACK_MODE_OPTIONS } from '../training-feedback'
import type { TrainingLengthProfile, TrainingPressure } from '../training-plan'
import { listTrainingVoiceRoutes, type VoiceRoute } from '../voice-routes'
import {
  launchTrainingSession,
  trainingStudioErrorMessage,
  type TrainingFeedbackMode,
  type TrainingStudioMode,
} from './api'

const MODES: Array<{ value: TrainingStudioMode; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'realtime', label: 'Realtime' },
  { value: 'video', label: 'Video' },
]

function chineseModeLabel(label: string): string {
  if (label === 'Text') return '文本'
  if (label === 'Voice') return '语音'
  if (label === 'Realtime') return '实时'
  return '视频'
}

type TrainingStudioContentProps = {
  initialSessionId?: string
}

function TrainingStudioContent({
  initialSessionId,
}: TrainingStudioContentProps) {
  const { i18n, t } = useTranslation()
  const { apiBase, authStatus } = useTrainingHost()
  const navigate = useNavigate()
  const [role, setRole] = useState('')
  const [goal, setGoal] = useState('')
  const [mode, setMode] = useState<TrainingStudioMode>('voice')
  const [voiceRouteId, setVoiceRouteId] = useState('')
  const [feedbackMode, setFeedbackMode] =
    useState<TrainingFeedbackMode>('simulation')
  const [pressure, setPressure] = useState<TrainingPressure>('medium')
  const [lengthProfile, setLengthProfile] =
    useState<TrainingLengthProfile>('standard')
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const localize = useCallback(
    (english: string, chinese: string) =>
      i18n.language.startsWith('zh') ? chinese : t(english),
    [i18n.language, t]
  )
  const {
    config: playgroundConfig,
    models: playgroundModels,
    updateConfig: updatePlaygroundConfig,
    setGroups: setPlaygroundGroups,
    setModels: setPlaygroundModels,
  } = usePlaygroundState()
  usePlaygroundOptions({
    currentGroup: playgroundConfig.group,
    currentModel: playgroundConfig.model,
    modelEndpointType: 'openai',
    preferredModel: 'doubao-seed-2-0-pro-260215',
    setGroups: setPlaygroundGroups,
    setModels: setPlaygroundModels,
    updateConfig: updatePlaygroundConfig,
  })
  const voiceRoutesQuery = useQuery<VoiceRoute[]>({
    queryKey: ['training', 'voice-routes', apiBase],
    queryFn: () => listTrainingVoiceRoutes(apiBase),
    enabled: authStatus === 'authenticated',
  })
  const selectableVoiceRoutes = useMemo(
    () =>
      (voiceRoutesQuery.data ?? []).filter(
        (route) => mode === 'realtime' || route.mode === 'cascade'
      ),
    [mode, voiceRoutesQuery.data]
  )
  const voiceRouteOptions = useMemo(
    () =>
      selectableVoiceRoutes.map((route) => ({
        value: route.id,
        label: trainingVoiceRouteLocalizedName(route, localize),
        category: localize(
          route.mode === 'cascade' ? 'Cascade' : 'Realtime',
          route.mode === 'cascade' ? '级联' : '实时'
        ),
        description: trainingVoiceRouteLocalizedDescription(route, localize),
      })),
    [localize, selectableVoiceRoutes]
  )
  useEffect(() => {
    if (!selectableVoiceRoutes.length) {
      if (voiceRouteId) setVoiceRouteId('')
      return
    }
    if (selectableVoiceRoutes.some((route) => route.id === voiceRouteId)) {
      return
    }
    const defaultRoute =
      selectableVoiceRoutes.find((route) => route.default) ??
      selectableVoiceRoutes[0]
    setVoiceRouteId(defaultRoute.id)
  }, [selectableVoiceRoutes, voiceRouteId])

  useEffect(() => {
    if (!initialSessionId) return
    void navigate({
      replace: true,
      search: { session: initialSessionId },
      to: '/training/conversations',
    })
  }, [initialSessionId, navigate])

  const startSession = async () => {
    setError(null)
    setIsLaunching(true)
    try {
      const nextSession = await launchTrainingSession(apiBase, {
        role,
        goal,
        mode,
        feedbackMode,
        pressure,
        lengthProfile,
        ...(mode === 'voice' || mode === 'realtime'
          ? { voiceRouteId }
          : { llmModel: playgroundConfig.model }),
      })
      await navigate({
        search: { session: nextSession.sessionId },
        to: '/training/conversations',
      })
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
        {initialSessionId ? (
          <div className='text-muted-foreground flex min-h-64 items-center justify-center gap-2 text-sm'>
            <LoaderCircle className='size-4 animate-spin' />
            {localize('Opening conversation...', '正在进入训练会话...')}
          </div>
        ) : (
          <div className='mx-auto w-full max-w-3xl'>
            <Card>
              <CardHeader>
                <CardTitle>{localize('Session setup', '会话设置')}</CardTitle>
                <CardDescription>
                  {localize(
                    'Create a training session scoped to the current account.',
                    '创建受当前账户范围约束的训练会话。'
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
                      className='grid w-full grid-cols-4'
                      disabled={isLaunching}
                      aria-label={localize('Training mode', '训练模式')}
                    >
                      {MODES.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          className='w-full'
                        >
                          {localize(
                            option.label,
                            chineseModeLabel(option.label)
                          )}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label>
                    {mode === 'voice' || mode === 'realtime'
                      ? localize('Voice preset', '语音预设')
                      : localize('Language model', '语言模型')}
                  </Label>
                  {mode === 'voice' || mode === 'realtime' ? (
                    <ModelSelector
                      variant='field'
                      models={voiceRouteOptions}
                      selectedModel={voiceRouteId}
                      onModelChange={setVoiceRouteId}
                      disabled={isLaunching}
                      placeholder={localize(
                        'Select a platform preset',
                        '选择平台预设'
                      )}
                      searchPlaceholder={localize(
                        'Search voice presets...',
                        '搜索语音预设...'
                      )}
                      emptyText={localize(
                        'No voice preset found.',
                        '没有找到语音预设'
                      )}
                      ariaLabel={localize('Voice preset', '语音预设')}
                    />
                  ) : (
                    <ModelSelector
                      variant='field'
                      models={playgroundModels}
                      selectedModel={playgroundConfig.model}
                      onModelChange={(value) =>
                        updatePlaygroundConfig('model', value)
                      }
                      disabled={isLaunching}
                      placeholder={localize('Select a model', '选择模型')}
                      searchPlaceholder={localize(
                        'Search models...',
                        '搜索模型...'
                      )}
                      emptyText={localize('No model found.', '没有找到模型')}
                      ariaLabel={localize('Language model', '语言模型')}
                    />
                  )}
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
                    {TRAINING_FEEDBACK_MODE_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        className='w-full'
                        title={localize(
                          option.description.english,
                          option.description.chinese
                        )}
                      >
                        {localize(option.label.english, option.label.chinese)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>
                      {localize('Counterpart pressure', '对手压力')}
                    </Label>
                    <ToggleGroup
                      aria-label={localize('Counterpart pressure', '对手压力')}
                      className='grid w-full grid-cols-3'
                      disabled={isLaunching}
                      onValueChange={(values) => {
                        const next = values.find((value) => value !== pressure)
                        if (next) setPressure(next as TrainingPressure)
                      }}
                      value={[pressure]}
                      variant='outline'
                    >
                      <ToggleGroupItem value='easy'>
                        {localize('Supportive', '温和')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='medium'>
                        {localize('Realistic', '真实')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='hard'>
                        {localize('Pressured', '高压')}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className='space-y-2'>
                    <Label>{localize('Practice length', '练习长度')}</Label>
                    <ToggleGroup
                      aria-label={localize('Practice length', '练习长度')}
                      className='grid w-full grid-cols-3'
                      disabled={isLaunching}
                      onValueChange={(values) => {
                        const next = values.find(
                          (value) => value !== lengthProfile
                        )
                        if (next) {
                          setLengthProfile(next as TrainingLengthProfile)
                        }
                      }}
                      value={[lengthProfile]}
                      variant='outline'
                    >
                      <ToggleGroupItem value='quick'>
                        {localize('Quick', '快速')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='standard'>
                        {localize('Standard', '标准')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='complete'>
                        {localize('Complete', '完整')}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
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
                  disabled={
                    isLaunching ||
                    authStatus !== 'authenticated' ||
                    (mode === 'voice' || mode === 'realtime'
                      ? !voiceRouteId
                      : !playgroundConfig.model)
                  }
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
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function TrainingStudio({ sessionId }: { sessionId?: string }) {
  return (
    <TrainingHostProvider>
      <TrainingStudioContent initialSessionId={sessionId} />
    </TrainingHostProvider>
  )
}

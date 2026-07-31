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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  CircleAlert,
  FileText,
  LoaderCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  createAndStartDefensePrep,
  generateBattlePrep,
  listScopedTrainingPrepPersonas,
  startBattlePrep,
  trainingPrepRequestErrorMessage,
  type BattlePrepResult,
  type DefenseScenarioType,
  type TrainingPrepPersona,
} from './api'
import { trainingPrepWorkspaceHandoff } from './handoff'

type Localize = (english: string, chinese: string) => string

const DEFENSE_SCENARIOS: Array<{
  readonly value: DefenseScenarioType
  readonly english: string
  readonly chinese: string
}> = [
  { value: 'general', english: 'General defense', chinese: '通用答辩' },
  {
    value: 'performance_review',
    english: 'Performance review',
    chinese: '述职答辩',
  },
  { value: 'proposal_review', english: 'Proposal review', chinese: '方案评审' },
  { value: 'project_report', english: 'Project report', chinese: '项目汇报' },
  { value: 'interview', english: 'Interview', chinese: '模拟面试' },
  {
    value: 'probation_review',
    english: 'Probation review',
    chinese: '转正答辩',
  },
]

function useLocalize(): Localize {
  const { i18n, t } = useTranslation()
  return (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
}

function PrepPageFrame({
  children,
  icon: Icon,
  title,
  localize,
}: {
  children: ReactNode
  icon: typeof ShieldCheck
  title: string
  localize: Localize
}) {
  return (
    <SectionPageLayout>
      <SectionPageLayout.Breadcrumb>
        <Button render={<Link to='/training' />} size='sm' variant='ghost'>
          <ArrowLeft />
          {localize('Training', '训练')}
        </Button>
      </SectionPageLayout.Breadcrumb>
      <SectionPageLayout.Title>
        <span className='inline-flex items-center gap-2'>
          <Icon className='size-5' />
          {title}
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto w-full max-w-5xl space-y-4'>{children}</div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

function SignInRequired({ localize }: { localize: Localize }) {
  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{localize('Sign in required', '需要登录')}</AlertTitle>
      <AlertDescription>
        {localize(
          'Sign in before preparing a training session.',
          '登录后才能创建训练准备。'
        )}
      </AlertDescription>
    </Alert>
  )
}

function MutationError({
  error,
  title,
  localize,
}: {
  error: unknown
  title: string
  localize: Localize
}) {
  return (
    <Alert variant='destructive'>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {trainingPrepRequestErrorMessage(
          error,
          localize('Request failed', '请求失败')
        )}
      </AlertDescription>
    </Alert>
  )
}

function toggleTextItem(
  items: readonly string[],
  item: string,
  checked: boolean
): string[] {
  if (checked) return items.includes(item) ? [...items] : [...items, item]
  return items.filter((value) => value !== item)
}

function difficultyOptionLabel(
  value: 'easy' | 'normal' | 'hard',
  localize: Localize
): string {
  if (value === 'easy') return localize('Easy', '简单')
  if (value === 'hard') return localize('Hard', '困难')
  return localize('Standard', '标准')
}

function BattlePreparedOpponent({
  preparation,
  selectedTrainingPoints,
  onToggleTrainingPoint,
  disabled,
  localize,
}: {
  preparation: BattlePrepResult | null
  selectedTrainingPoints: readonly string[]
  onToggleTrainingPoint: (point: string, checked: boolean) => void
  disabled: boolean
  localize: Localize
}) {
  if (!preparation) {
    return (
      <Empty className='border-none py-8'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <ShieldCheck />
          </EmptyMedia>
          <EmptyTitle>{localize('No opponent yet', '尚未生成对手')}</EmptyTitle>
          <EmptyDescription>
            {localize(
              'Generate a meeting brief to create a scoped practice counterpart.',
              '填写会议背景后，生成本次训练专属的模拟对手。'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <div className='font-medium'>{preparation.personaName}</div>
        <div className='text-muted-foreground text-sm'>
          {preparation.personaRole}
        </div>
      </div>
      <p className='text-muted-foreground text-sm leading-6'>
        {preparation.personaStyle}
      </p>
      <div className='space-y-2'>
        <div className='text-sm font-medium'>
          {localize('Scenario', '训练情境')}
        </div>
        <p className='text-muted-foreground text-sm leading-6'>
          {preparation.scenarioContext}
        </p>
      </div>
      <div className='space-y-2'>
        <div className='text-sm font-medium'>
          {localize('Training focus', '训练重点')}
        </div>
        <div className='space-y-2'>
          {preparation.trainingPoints.map((point) => (
            <label
              className='flex cursor-pointer items-start gap-2 text-sm'
              key={point}
            >
              <Checkbox
                aria-label={point}
                checked={selectedTrainingPoints.includes(point)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onToggleTrainingPoint(point, checked === true)
                }
              />
              <span className='leading-5'>{point}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function TrainingBattlePrepContent() {
  const localize = useLocalize()
  const host = useTrainingHost()
  const navigate = useNavigate()
  const [brief, setBrief] = useState('')
  const [preparation, setPreparation] = useState<BattlePrepResult | null>(null)
  const [selectedTrainingPoints, setSelectedTrainingPoints] = useState<
    readonly string[]
  >([])
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>(
    'normal'
  )
  const isAuthenticated = host.authStatus === 'authenticated'

  const generateMutation = useMutation({
    mutationFn: () => generateBattlePrep(brief),
    onSuccess: (nextPreparation) => {
      setPreparation(nextPreparation)
      setSelectedTrainingPoints(nextPreparation.trainingPoints)
    },
  })
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!preparation) {
        throw new Error('Generate an opponent before starting practice')
      }
      const result = await startBattlePrep({
        preparation,
        selectedTrainingPoints: [...selectedTrainingPoints],
        difficulty,
        replyLanguage: host.locale,
      })
      const handoff = trainingPrepWorkspaceHandoff(result)
      if (!handoff) {
        throw new Error(
          'TalkWise did not return the training session and conversation required to open practice'
        )
      }
      return handoff
    },
    onSuccess: (handoff) => {
      void navigate({ to: handoff.to, search: handoff.search })
    },
  })
  const isBusy = generateMutation.isPending || startMutation.isPending

  return (
    <PrepPageFrame
      icon={ShieldCheck}
      localize={localize}
      title={localize('Battle preparation', '备战准备')}
    >
      {!isAuthenticated && <SignInRequired localize={localize} />}
      {generateMutation.isError && (
        <MutationError
          error={generateMutation.error}
          localize={localize}
          title={localize('Opponent not prepared', '未能生成对手')}
        />
      )}
      {startMutation.isError && (
        <MutationError
          error={startMutation.error}
          localize={localize}
          title={localize('Practice not started', '训练未启动')}
        />
      )}

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]'>
        <Card>
          <CardHeader>
            <CardTitle>{localize('Meeting brief', '会议简报')}</CardTitle>
            <CardDescription>
              {localize(
                'Describe the meeting, stakes, counterpart, and objective.',
                '说明会议背景、关键冲突、对方角色和你的目标。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='battle-prep-brief'>
                {localize('Brief', '会议背景')}
              </Label>
              <Textarea
                disabled={!isAuthenticated || isBusy}
                id='battle-prep-brief'
                onChange={(event) => {
                  setBrief(event.target.value)
                  setPreparation(null)
                  setSelectedTrainingPoints([])
                  generateMutation.reset()
                  startMutation.reset()
                }}
                placeholder={localize(
                  'I need to align a renewal plan with a cost-conscious customer leader.',
                  '我需要向一位预算敏感的客户负责人争取续约，并确认下一步。'
                )}
                rows={8}
                value={brief}
              />
            </div>
            <div className='space-y-2'>
              <Label>{localize('Difficulty', '训练难度')}</Label>
              <ToggleGroup
                aria-label={localize('Training difficulty', '训练难度')}
                className='grid w-full grid-cols-3'
                disabled={!isAuthenticated || isBusy}
                onValueChange={(values) => {
                  const next = values.find((value) => value !== difficulty)
                  if (next) setDifficulty(next as typeof difficulty)
                }}
                value={[difficulty]}
                variant='outline'
              >
                {(['easy', 'normal', 'hard'] as const).map((value) => (
                  <ToggleGroupItem className='w-full' key={value} value={value}>
                    {difficultyOptionLabel(value, localize)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </CardContent>
          <CardFooter className='justify-end'>
            <Button
              disabled={!isAuthenticated || isBusy || brief.trim().length < 10}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Sparkles />
              )}
              {generateMutation.isPending
                ? localize('Preparing...', '正在生成...')
                : localize('Prepare opponent', '生成对手')}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{localize('Opponent', '模拟对手')}</CardTitle>
            <CardDescription>
              {localize(
                'Choose the focus before opening the native conversation workspace.',
                '确认训练重点后，进入原生会话工作区。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BattlePreparedOpponent
              disabled={isBusy}
              localize={localize}
              onToggleTrainingPoint={(point, checked) =>
                setSelectedTrainingPoints((current) =>
                  toggleTextItem(current, point, checked)
                )
              }
              preparation={preparation}
              selectedTrainingPoints={selectedTrainingPoints}
            />
          </CardContent>
        </Card>
      </div>

      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          disabled={
            !isAuthenticated ||
            !preparation ||
            selectedTrainingPoints.length === 0 ||
            isBusy
          }
          onClick={() => startMutation.mutate()}
        >
          {startMutation.isPending ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <Play />
          )}
          {startMutation.isPending
            ? localize('Opening practice...', '正在打开训练...')
            : localize('Start practice', '开始训练')}
        </Button>
      </div>
    </PrepPageFrame>
  )
}

function reviewerLabel(persona: TrainingPrepPersona): string {
  return `${persona.name} - ${persona.role}`
}

function TrainingDefensePrepContent() {
  const localize = useLocalize()
  const host = useTrainingHost()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<
    readonly string[]
  >([])
  const [scenarioType, setScenarioType] =
    useState<DefenseScenarioType>('general')
  const isAuthenticated = host.authStatus === 'authenticated'
  const personasQuery = useQuery({
    queryKey: ['training', 'prep', 'scoped-personas'],
    queryFn: listScopedTrainingPrepPersonas,
    enabled: isAuthenticated,
  })
  const personas = personasQuery.data ?? []
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a practice document')
      const result = await createAndStartDefensePrep({
        file,
        personaIds: selectedPersonaIds,
        scenarioType,
      })
      const handoff = trainingPrepWorkspaceHandoff(result)
      if (!handoff) {
        throw new Error(
          'TalkWise did not return the training session and conversation required to open practice'
        )
      }
      return { handoff, result }
    },
    onSuccess: ({ handoff }) => {
      void navigate({ to: handoff.to, search: handoff.search })
    },
  })

  useEffect(() => {
    if (!personasQuery.data) return
    setSelectedPersonaIds((current) => {
      const visible = current.filter((id) =>
        personasQuery.data?.some((persona) => persona.id === id)
      )
      return visible.length > 0 || personasQuery.data.length === 0
        ? visible
        : [personasQuery.data[0].id]
    })
  }, [personasQuery.data])

  const isBusy = startMutation.isPending
  const started = startMutation.data?.result ?? null

  return (
    <PrepPageFrame
      icon={FileText}
      localize={localize}
      title={localize('Defense preparation', '答辩准备')}
    >
      {!isAuthenticated && <SignInRequired localize={localize} />}
      {personasQuery.isError && (
        <MutationError
          error={personasQuery.error}
          localize={localize}
          title={localize('Reviewers not loaded', '未能加载评审角色')}
        />
      )}
      {startMutation.isError && (
        <MutationError
          error={startMutation.error}
          localize={localize}
          title={localize('Defense not started', '答辩训练未启动')}
        />
      )}

      <div className='grid gap-4 lg:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle>{localize('Material', '训练材料')}</CardTitle>
            <CardDescription>
              {localize(
                'Upload a document for the review panel to challenge.',
                '上传需要进行答辩训练的文档。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Label htmlFor='defense-prep-material'>
              {localize('Practice material', '训练材料')}
            </Label>
            <Input
              accept='.pptx,.pdf,.docx,.txt,.md'
              disabled={!isAuthenticated || isBusy}
              id='defense-prep-material'
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                startMutation.reset()
              }}
              type='file'
            />
            {file && (
              <div className='text-muted-foreground truncate text-xs'>
                {file.name}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{localize('Review panel', '评审角色')}</CardTitle>
            <CardDescription>
              {localize(
                'Reviewers are loaded only from the current scoped account.',
                '仅显示当前账号有权使用的评审角色。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {personasQuery.isPending && (
              <div className='text-muted-foreground flex min-h-28 items-center gap-2 text-sm'>
                <LoaderCircle className='size-4 animate-spin' />
                {localize('Loading reviewers...', '正在加载评审角色...')}
              </div>
            )}
            {!personasQuery.isPending && personas.length === 0 && (
              <Empty className='border-none py-4'>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <ShieldCheck />
                  </EmptyMedia>
                  <EmptyTitle>
                    {localize('No reviewers available', '暂无可用评审角色')}
                  </EmptyTitle>
                  <EmptyDescription>
                    {localize(
                      'Create or request access to a persona before starting defense preparation.',
                      '请先创建角色或申请使用已有角色。'
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {!personasQuery.isPending && personas.length > 0 && (
              <div className='max-h-52 space-y-2 overflow-y-auto pr-1'>
                {personas.map((persona) => (
                  <label
                    className='flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm'
                    key={persona.id}
                  >
                    <Checkbox
                      aria-label={reviewerLabel(persona)}
                      checked={selectedPersonaIds.includes(persona.id)}
                      disabled={
                        !isAuthenticated ||
                        isBusy ||
                        (!selectedPersonaIds.includes(persona.id) &&
                          selectedPersonaIds.length >= 5)
                      }
                      onCheckedChange={(checked) =>
                        setSelectedPersonaIds((current) =>
                          toggleTextItem(current, persona.id, checked === true)
                        )
                      }
                    />
                    <span className='min-w-0'>
                      <span className='block truncate font-medium'>
                        {persona.name}
                      </span>
                      <span className='text-muted-foreground block truncate text-xs'>
                        {persona.role}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{localize('Scenario', '答辩场景')}</CardTitle>
            <CardDescription>
              {localize(
                'The scenario determines the review dimensions and questioning style.',
                '场景决定评审维度和提问方式。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Label htmlFor='defense-prep-scenario'>
              {localize('Scenario type', '场景类型')}
            </Label>
            <Select
              disabled={!isAuthenticated || isBusy}
              onValueChange={(value) => {
                if (value) setScenarioType(value as DefenseScenarioType)
              }}
              value={scenarioType}
            >
              <SelectTrigger id='defense-prep-scenario'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {DEFENSE_SCENARIOS.map((scenario) => (
                    <SelectItem key={scenario.value} value={scenario.value}>
                      {localize(scenario.english, scenario.chinese)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{localize('Prepared questions', '准备结果')}</CardTitle>
          <CardDescription>
            {localize(
              'The server prepares the review strategy before the conversation opens.',
              '服务端生成评审提问策略后，才会打开原生会话工作区。'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {started ? (
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                {started.documentTitle && (
                  <Badge variant='secondary'>{started.documentTitle}</Badge>
                )}
                <Badge variant='outline'>{started.defenseSessionId}</Badge>
              </div>
              {started.questionStrategy.length > 0 ? (
                <ol className='space-y-2'>
                  {started.questionStrategy.slice(0, 5).map((question) => (
                    <li
                      className='rounded-md border p-3 text-sm'
                      key={`${question.askedBy}-${question.dimension}-${question.question}`}
                    >
                      <div className='font-medium'>{question.question}</div>
                      {(question.dimension || question.difficulty) && (
                        <div className='text-muted-foreground mt-1 flex flex-wrap gap-1.5 text-xs'>
                          {question.dimension && (
                            <Badge variant='outline'>
                              {question.dimension}
                            </Badge>
                          )}
                          {question.difficulty && (
                            <Badge variant='outline'>
                              {question.difficulty}
                            </Badge>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {localize(
                    'The review panel is ready. Opening the conversation workspace.',
                    '评审角色已准备就绪，正在打开会话工作区。'
                  )}
                </p>
              )}
            </div>
          ) : (
            <Empty className='border-none py-8'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <Upload />
                </EmptyMedia>
                <EmptyTitle>
                  {localize('No prepared questions', '尚未生成问题')}
                </EmptyTitle>
                <EmptyDescription>
                  {localize(
                    'Choose a document, reviewers, and scenario to prepare a defense session.',
                    '选择文档、评审角色和场景后，生成答辩训练。'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          disabled={
            !isAuthenticated ||
            !file ||
            selectedPersonaIds.length === 0 ||
            personasQuery.isPending ||
            isBusy
          }
          onClick={() => startMutation.mutate()}
        >
          {isBusy ? <LoaderCircle className='animate-spin' /> : <Play />}
          {isBusy
            ? localize('Preparing...', '正在准备...')
            : localize('Prepare and start', '准备并开始')}
        </Button>
      </div>
    </PrepPageFrame>
  )
}

export function TrainingBattlePrepPage() {
  return (
    <TrainingHostProvider>
      <TrainingBattlePrepContent />
    </TrainingHostProvider>
  )
}

export function TrainingDefensePrepPage() {
  return (
    <TrainingHostProvider>
      <TrainingDefensePrepContent />
    </TrainingHostProvider>
  )
}

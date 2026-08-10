import { useMutation, useQuery } from '@tanstack/react-query'
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
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import {
  CircleAlert,
  ListRestart,
  LoaderCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Play,
  Radio,
  RefreshCw,
  Search,
  Video,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  DataTableViewModeToggle,
  type DataTableViewMode,
  useDataTable,
  useDataTableViewMode,
} from '@/components/data-table'
import { ModelSelector } from '@/components/model-group-selector'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyContent,
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  usePlaygroundOptions,
  usePlaygroundState,
} from '@/features/playground/hooks'

import { useTrainingHost } from '../host'
import {
  trainingRoleLocalizedLabel,
  trainingVoiceRouteLocalizedDescription,
  trainingVoiceRouteLocalizedName,
} from '../training-display-labels'
import {
  TRAINING_FEEDBACK_MODE_OPTIONS,
  type TrainingFeedbackMode,
} from '../training-feedback'
import {
  scenarioPressure,
  type TrainingLengthProfile,
  type TrainingPressure,
} from '../training-plan'
import {
  listTrainingVoiceRoutes,
  voiceRouteDisabledReason,
  voiceRouteIsReady,
  voiceRoutePresetGroup,
  voiceRouteSupportsInteraction,
  type VoiceRoute,
} from '../voice-routes'
import {
  type buildTrainingSessionRequest,
  filterTrainingScenarios,
  isTrainingModeSelectionAvailable,
  launchScenarioTrainingSession,
  listTrainingScenarios,
  ScenarioTrainingStartError,
  startScenarioTrainingSession,
  trainingRequestErrorMessage,
  trainingSessionModeForSelection,
} from './api'
import type {
  TrainingInteractionMode,
  TrainingModality,
  TrainingScenario,
  TrainingScenarioCategory,
  TrainingScenarioDifficulty,
  TrainingSessionMode,
} from './types'

const DIFFICULTY_OPTIONS: Array<TrainingScenarioDifficulty | 'all'> = [
  'all',
  'easy',
  'medium',
  'hard',
  'expert',
]
const CATEGORY_OPTIONS: Array<TrainingScenarioCategory | 'all'> = [
  'all',
  'sales',
  'customer_service',
  'negotiation',
  'interview',
  'workplace',
]
const SESSION_MODALITIES: Array<{
  icon: typeof MessageSquare
  value: TrainingModality
}> = [
  { icon: MessageSquare, value: 'text' },
  { icon: Mic, value: 'voice' },
  { icon: Video, value: 'video' },
]
const INTERACTION_MODES: Array<{
  icon: typeof MessageSquare
  value: TrainingInteractionMode
}> = [
  { icon: ListRestart, value: 'turn_based' },
  { icon: Radio, value: 'realtime' },
]
const SKELETON_ROWS = Array.from(
  { length: 5 },
  (_, index) => `training-scenario-skeleton-${index + 1}`
)

function difficultyStatusVariant(difficulty: TrainingScenarioDifficulty) {
  if (difficulty === 'easy') return 'success' as const
  if (difficulty === 'medium') return 'info' as const
  return 'warning' as const
}

function ScenarioTableSkeleton() {
  return (
    <div className='overflow-hidden rounded-lg border'>
      <Table className='min-w-190'>
        <TableHeader>
          <TableRow>
            {Array.from({ length: 6 }, (_, index) => (
              <TableHead key={`training-scenario-heading-${index + 1}`}>
                <Skeleton className='h-4 w-20' />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {SKELETON_ROWS.map((row) => (
            <TableRow key={row}>
              <TableCell>
                <div className='space-y-2'>
                  <Skeleton className='h-4 w-44' />
                  <Skeleton className='h-3 w-64' />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className='h-5 w-18' />
              </TableCell>
              <TableCell>
                <Skeleton className='h-5 w-16' />
              </TableCell>
              <TableCell>
                <Skeleton className='h-4 w-28' />
              </TableCell>
              <TableCell>
                <Skeleton className='h-4 w-36' />
              </TableCell>
              <TableCell>
                <Skeleton className='ml-auto h-7 w-20' />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ScenarioDataTable({
  scenarios,
  localize,
  categoryLabel,
  difficultyLabel,
  openScenario,
  viewMode,
  onViewModeChange,
}: {
  scenarios: TrainingScenario[]
  localize: (english: string, chinese: string) => string
  categoryLabel: (value: TrainingScenarioCategory | 'all') => string
  difficultyLabel: (value: TrainingScenarioDifficulty | 'all') => string
  openScenario: (scenario: TrainingScenario) => void
  viewMode: DataTableViewMode
  onViewModeChange: (mode: DataTableViewMode) => void
}) {
  const columns = useMemo<ColumnDef<TrainingScenario>[]>(
    () => [
      {
        id: 'scenario',
        header: localize('Scenario', '场景'),
        cell: ({ row }) => {
          const scenario = row.original
          return (
            <div className='min-w-0'>
              <div className='flex items-center gap-1.5 font-medium'>
                <span className='truncate'>{scenario.title}</span>
                {scenario.required && (
                  <Badge variant='outline' className='shrink-0'>
                    {localize('Required', '必练')}
                  </Badge>
                )}
              </div>
              <p className='text-muted-foreground mt-1 line-clamp-1 text-xs'>
                {scenario.description}
              </p>
            </div>
          )
        },
      },
      {
        id: 'category',
        header: localize('Category', '类型'),
        cell: ({ row }) => (
          <StatusBadge
            label={categoryLabel(row.original.category)}
            variant='info'
            copyable={false}
          />
        ),
      },
      {
        id: 'difficulty',
        header: localize('Difficulty', '难度'),
        cell: ({ row }) => (
          <StatusBadge
            label={difficultyLabel(row.original.difficulty)}
            variant={difficultyStatusVariant(row.original.difficulty)}
            copyable={false}
          />
        ),
      },
      {
        id: 'counterpart',
        header: localize('Counterpart', '对练角色'),
        cell: ({ row }) => (
          <div>
            <div className='truncate font-medium'>
              {row.original.persona.name}
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {row.original.persona.role}
            </div>
          </div>
        ),
      },
      {
        id: 'focus',
        header: localize('Training focus', '训练重点'),
        cell: ({ row }) => {
          const scenario = row.original
          return (
            <div>
              <div className='truncate'>
                {scenario.trainingPoints[0] || scenario.customerProfile}
              </div>
              {scenario.trainingPoints.length > 1 && (
                <div className='text-muted-foreground mt-1 text-xs'>
                  +{scenario.trainingPoints.length - 1}
                </div>
              )}
            </div>
          )
        },
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{localize('Actions', '操作')}</span>
        ),
        cell: ({ row }) => (
          <Button size='sm' onClick={() => openScenario(row.original)}>
            <Play />
            {localize('Start training', '开始训练')}
          </Button>
        ),
      },
    ],
    [categoryLabel, difficultyLabel, localize, openScenario]
  )
  const { table } = useDataTable({
    data: scenarios,
    columns,
    getRowId: (scenario) => scenario.id,
    enableRowSelection: false,
  })

  useEffect(() => {
    table.resetPageIndex()
  }, [scenarios, table])

  return (
    <DataTablePage
      table={table}
      columns={columns}
      fixedHeight={false}
      tableClassName='min-w-190'
      enableCardView
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      renderCard={(row) => {
        const scenario = row.original
        return (
          <div className='flex h-full min-h-50 flex-col gap-3'>
            <div className='space-y-1.5'>
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0 flex-1 text-sm font-medium'>
                  {scenario.title}
                </div>
                {scenario.required && (
                  <Badge className='shrink-0' variant='outline'>
                    {localize('Required', '必练')}
                  </Badge>
                )}
              </div>
              <p className='text-muted-foreground line-clamp-2 text-xs leading-5'>
                {scenario.description}
              </p>
            </div>

            <div className='flex flex-wrap gap-1.5'>
              <StatusBadge
                label={categoryLabel(scenario.category)}
                variant='info'
                copyable={false}
              />
              <StatusBadge
                label={difficultyLabel(scenario.difficulty)}
                variant={difficultyStatusVariant(scenario.difficulty)}
                copyable={false}
              />
            </div>

            <dl className='grid grid-cols-2 gap-x-3 gap-y-2 text-xs'>
              <div className='min-w-0'>
                <dt className='text-muted-foreground'>
                  {localize('Counterpart', '对练角色')}
                </dt>
                <dd className='mt-0.5 truncate font-medium'>
                  {scenario.persona.name}
                </dd>
                <dd className='text-muted-foreground mt-0.5 truncate'>
                  {scenario.persona.role}
                </dd>
              </div>
              <div className='min-w-0'>
                <dt className='text-muted-foreground'>
                  {localize('Training focus', '训练重点')}
                </dt>
                <dd className='mt-0.5 truncate font-medium'>
                  {scenario.trainingPoints[0] || scenario.customerProfile}
                </dd>
                {scenario.trainingPoints.length > 1 && (
                  <dd className='text-muted-foreground mt-0.5'>
                    +{scenario.trainingPoints.length - 1}
                  </dd>
                )}
              </div>
            </dl>

            <Button
              className='mt-auto w-full'
              onClick={() => openScenario(scenario)}
            >
              <Play />
              {localize('Start training', '开始训练')}
            </Button>
          </div>
        )
      }}
      cardGridClassName='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'
      getColumnClassName={(columnId) => {
        if (columnId === 'scenario') return 'max-w-80 whitespace-normal'
        if (columnId === 'counterpart') return 'max-w-44 whitespace-normal'
        if (columnId === 'focus') return 'max-w-56 whitespace-normal'
        if (columnId === 'actions') return 'text-right'
        return undefined
      }}
    />
  )
}

export function TrainingScenarios() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState<
    TrainingScenarioDifficulty | 'all'
  >('all')
  const [category, setCategory] = useState<TrainingScenarioCategory | 'all'>(
    'all'
  )
  const [selectedScenario, setSelectedScenario] =
    useState<TrainingScenario | null>(null)
  const [modality, setModality] = useState<TrainingModality>('text')
  const [interactionMode, setInteractionMode] =
    useState<TrainingInteractionMode>('turn_based')
  const [feedbackMode, setFeedbackMode] =
    useState<TrainingFeedbackMode>('simulation')
  const [selectedFocus, setSelectedFocus] = useState<readonly string[]>([])
  const [pressure, setPressure] = useState<TrainingPressure>('medium')
  const [lengthProfile, setLengthProfile] =
    useState<TrainingLengthProfile>('standard')
  const [voiceRouteId, setVoiceRouteId] = useState('')
  const [retrySessionId, setRetrySessionId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useDataTableViewMode({
    storageKey: 'talkwise.training-scenarios.view-mode',
    defaultMode: 'table',
  })
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

  const scenariosQuery = useQuery({
    queryKey: ['training', 'scenarios', host.apiBase],
    queryFn: () => listTrainingScenarios(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const voiceRoutesQuery = useQuery<VoiceRoute[]>({
    queryKey: ['training', 'voice-routes', host.apiBase],
    queryFn: () => listTrainingVoiceRoutes(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  const selectableVoiceRoutes = useMemo(
    () =>
      (voiceRoutesQuery.data ?? []).filter((route) =>
        voiceRouteSupportsInteraction(route, interactionMode)
      ),
    [interactionMode, voiceRoutesQuery.data]
  )
  const voiceRouteOptions = useMemo(
    () =>
      selectableVoiceRoutes.map((route) => {
        const group = voiceRoutePresetGroup(route)
        const category = {
          cascade: localize('Cascade', '级联'),
          realtime: localize('Realtime', '实时'),
        }[group]

        return {
          value: route.id,
          label: trainingVoiceRouteLocalizedName(route, localize),
          category,
          description: trainingVoiceRouteLocalizedDescription(route, localize),
          disabled: !voiceRouteIsReady(route),
          disabledReason: voiceRouteDisabledReason(route, localize),
        }
      }),
    [localize, selectableVoiceRoutes]
  )
  useEffect(() => {
    const readyRoutes = selectableVoiceRoutes.filter(voiceRouteIsReady)
    if (!readyRoutes.length) {
      if (voiceRouteId) setVoiceRouteId('')
      return
    }
    if (readyRoutes.some((route) => route.id === voiceRouteId)) {
      return
    }
    const defaultRoute =
      readyRoutes.find((route) => route.default) ?? readyRoutes[0]
    setVoiceRouteId(defaultRoute.id)
  }, [selectableVoiceRoutes, voiceRouteId])
  const selectedVoiceRoute = selectableVoiceRoutes.find(
    (route) => route.id === voiceRouteId
  )

  const createSessionMutation = useMutation({
    mutationFn: (request: {
      mode: TrainingSessionMode
      interactionMode: TrainingInteractionMode
      feedbackMode: TrainingFeedbackMode
      plan: Parameters<typeof buildTrainingSessionRequest>[2]
      retrySessionId: string | null
      voiceRouteId?: string
      llmModel?: string
      scenario: TrainingScenario
    }) => {
      if (request.retrySessionId) {
        return startScenarioTrainingSession(
          host.apiBase,
          request.retrySessionId,
          request.scenario,
          request.mode,
          request.plan,
          undefined,
          request.feedbackMode,
          request.interactionMode
        )
      }
      return launchScenarioTrainingSession(
        host.apiBase,
        request.scenario,
        request.mode,
        request.plan,
        undefined,
        request.feedbackMode,
        request.llmModel,
        request.voiceRouteId,
        request.interactionMode
      )
    },
    onSuccess: (session) => {
      setRetrySessionId(null)
      setSelectedScenario(null)
      void navigate({
        to: '/training/conversations',
        search: { session: session.sessionId },
      })
    },
    onError: (error) => {
      if (error instanceof ScenarioTrainingStartError) {
        setRetrySessionId(error.sessionId)
      }
    },
  })

  const filteredScenarios = useMemo(
    () =>
      filterTrainingScenarios(scenariosQuery.data ?? [], {
        query,
        difficulty,
        category,
      }),
    [category, difficulty, query, scenariosQuery.data]
  )
  const hasActiveFilters = Boolean(
    query.trim() || difficulty !== 'all' || category !== 'all'
  )
  const EmptyIcon = hasActiveFilters ? Search : MessagesSquare
  const emptyTitle = hasActiveFilters
    ? localize('No matching scenarios', '没有匹配的训练场景')
    : localize('No scenarios available', '暂无可用训练场景')
  const emptyDescription = hasActiveFilters
    ? localize('Try a different search or filter.', '请调整搜索词或筛选条件。')
    : localize(
        'Published training scenarios will appear here.',
        '已发布的训练场景会显示在这里。'
      )

  const difficultyLabel = (value: TrainingScenarioDifficulty | 'all') => {
    const labels = {
      all: localize('All difficulties', '全部难度'),
      easy: localize('Easy', '简单'),
      medium: localize('Medium', '中等'),
      hard: localize('Hard', '困难'),
      expert: localize('Expert', '专家'),
    }
    return labels[value]
  }
  const categoryLabel = (value: TrainingScenarioCategory | 'all') => {
    const labels = {
      all: localize('All categories', '全部类型'),
      sales: localize('Sales', '销售'),
      customer_service: localize('Customer service', '客户服务'),
      negotiation: localize('Negotiation', '谈判'),
      interview: localize('Interview', '面试'),
      workplace: localize('Workplace', '职场'),
    }
    return labels[value]
  }
  const modalityLabel = (value: TrainingModality) => {
    const labels = {
      text: localize('Text', '文本'),
      voice: localize('Voice', '语音'),
      video: localize('Video', '视频'),
    }
    return labels[value]
  }
  const interactionModeLabel = (value: TrainingInteractionMode) => {
    const labels = {
      turn_based: localize('Turn-by-turn conversation', '逐轮对话'),
      realtime: localize(
        'Natural conversation (interruptible)',
        '自然对话（可打断）'
      ),
    }
    return labels[value]
  }
  const pressureLabel = (value: TrainingPressure) => {
    const labels = {
      easy: localize('Supportive', '温和'),
      medium: localize('Realistic', '真实'),
      hard: localize('Pressured', '高压'),
    }
    return labels[value]
  }
  const lengthProfileLabel = (value: TrainingLengthProfile) => {
    const labels = {
      quick: localize('Quick · 6 target answers', '快速 · 6 个目标回答'),
      standard: localize('Standard · 9 target answers', '标准 · 9 个目标回答'),
      complete: localize(
        'Complete · 12 target answers',
        '完整 · 12 个目标回答'
      ),
    }
    return labels[value]
  }

  const resetFilters = () => {
    setQuery('')
    setDifficulty('all')
    setCategory('all')
  }
  const openScenario = (scenario: TrainingScenario) => {
    createSessionMutation.reset()
    setRetrySessionId(null)
    setModality('text')
    setInteractionMode('turn_based')
    setFeedbackMode('simulation')
    setSelectedFocus(scenario.trainingPoints)
    setPressure(scenarioPressure(scenario.difficulty))
    setLengthProfile('standard')
    setVoiceRouteId('')
    setSelectedScenario(scenario)
  }
  const closeScenario = () => {
    if (createSessionMutation.isPending) return
    createSessionMutation.reset()
    setRetrySessionId(null)
    setSelectedScenario(null)
  }
  const createSelectedSession = () => {
    if (!selectedScenario || modality === 'video') return
    const mode = trainingSessionModeForSelection({
      modality,
      interactionMode,
    })
    createSessionMutation.mutate({
      mode,
      interactionMode,
      feedbackMode,
      scenario: selectedScenario,
      plan: {
        focusScope:
          selectedFocus.length === selectedScenario.trainingPoints.length
            ? 'all'
            : 'custom',
        selectedFocus,
        pressure,
        lengthProfile,
      },
      retrySessionId,
      ...(modality === 'voice' ? { voiceRouteId } : {}),
      ...(modality !== 'voice' && playgroundConfig.model
        ? { llmModel: playgroundConfig.model }
        : {}),
    })
  }
  let startButtonLabel = localize('Start training', '开始训练')
  if (retrySessionId) {
    startButtonLabel = localize('Retry start', '重试启动')
  }
  if (createSessionMutation.isPending) {
    startButtonLabel = localize('Starting...', '启动中...')
  }
  if (host.authStatus === 'anonymous') {
    return (
      <Alert variant='destructive'>
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
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='relative min-w-52 flex-1 sm:max-w-sm'>
          <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={localize('Search scenarios...', '搜索训练场景...')}
            aria-label={localize('Search scenarios', '搜索训练场景')}
            className='pl-8'
          />
        </div>
        <Select
          value={difficulty}
          onValueChange={(value) =>
            value && setDifficulty(value as typeof difficulty)
          }
        >
          <SelectTrigger
            className='w-36'
            aria-label={localize('Difficulty filter', '难度筛选')}
          >
            <SelectValue>{difficultyLabel(difficulty)}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {DIFFICULTY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {difficultyLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={category}
          onValueChange={(value) =>
            value && setCategory(value as typeof category)
          }
        >
          <SelectTrigger
            className='w-36'
            aria-label={localize('Category filter', '类型筛选')}
          >
            <SelectValue>{categoryLabel(category)}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {categoryLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <DataTableViewModeToggle
          className='ml-auto'
          value={viewMode}
          onChange={setViewMode}
        />
      </div>

      {scenariosQuery.isError && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize('Failed to load scenarios', '训练场景加载失败')}
          </AlertTitle>
          <AlertDescription>
            {trainingRequestErrorMessage(
              scenariosQuery.error,
              localize('Request failed', '请求失败')
            )}
          </AlertDescription>
          <div className='col-start-2 mt-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void scenariosQuery.refetch()}
            >
              <RefreshCw />
              {localize('Retry', '重试')}
            </Button>
          </div>
        </Alert>
      )}
      {!scenariosQuery.isError &&
        (scenariosQuery.isPending || host.authStatus === 'loading') && (
          <ScenarioTableSkeleton />
        )}
      {!scenariosQuery.isError &&
        !scenariosQuery.isPending &&
        host.authStatus !== 'loading' &&
        filteredScenarios.length === 0 && (
          <div className='rounded-lg border p-8'>
            <Empty className='border-none p-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <EmptyIcon />
                </EmptyMedia>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
              {hasActiveFilters && (
                <EmptyContent>
                  <Button variant='outline' size='sm' onClick={resetFilters}>
                    {localize('Clear filters', '清除筛选')}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          </div>
        )}
      {!scenariosQuery.isError &&
        !scenariosQuery.isPending &&
        host.authStatus !== 'loading' &&
        filteredScenarios.length > 0 && (
          <ScenarioDataTable
            scenarios={filteredScenarios}
            localize={localize}
            categoryLabel={categoryLabel}
            difficultyLabel={difficultyLabel}
            openScenario={openScenario}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        )}

      <Dialog
        open={selectedScenario !== null}
        onOpenChange={(open) => !open && closeScenario()}
      >
        <DialogContent className='sm:max-w-lg'>
          {selectedScenario && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {localize('Training settings', '训练设置')}
                </DialogTitle>
                <DialogDescription>
                  {localize(
                    'Configure this practice session before starting.',
                    '开始前配置本次练习。'
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className='space-y-4'>
                <div className='flex items-baseline gap-3 text-sm'>
                  <span className='text-muted-foreground'>
                    {localize('Learner role', '练习者角色')}
                  </span>
                  <span className='font-medium'>
                    {trainingRoleLocalizedLabel(
                      selectedScenario.learnerRole,
                      localize
                    )}
                  </span>
                </div>

                {selectedScenario.trainingPoints.length > 0 && (
                  <div className='space-y-2'>
                    <Label>{localize('Training focus', '训练重点')}</Label>
                    <div className='flex flex-wrap gap-1.5'>
                      {selectedScenario.trainingPoints.map((point) => {
                        const selected = selectedFocus.includes(point)
                        return (
                          <Button
                            aria-pressed={selected}
                            className='h-auto px-2 py-1 text-xs whitespace-normal'
                            disabled={createSessionMutation.isPending}
                            key={point}
                            onClick={() => {
                              setSelectedFocus((current) =>
                                current.includes(point)
                                  ? current.filter((item) => item !== point)
                                  : [...current, point]
                              )
                            }}
                            size='sm'
                            variant='outline'
                          >
                            {point}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>
                      {localize('Counterpart pressure', '对手压力')}
                    </Label>
                    <Select
                      disabled={createSessionMutation.isPending}
                      value={pressure}
                      onValueChange={(value) =>
                        value && setPressure(value as TrainingPressure)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>{pressureLabel(pressure)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='easy'>
                          {pressureLabel('easy')}
                        </SelectItem>
                        <SelectItem value='medium'>
                          {pressureLabel('medium')}
                        </SelectItem>
                        <SelectItem value='hard'>
                          {pressureLabel('hard')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>{localize('Practice length', '练习长度')}</Label>
                    <Select
                      disabled={createSessionMutation.isPending}
                      value={lengthProfile}
                      onValueChange={(value) =>
                        value &&
                        setLengthProfile(value as TrainingLengthProfile)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {lengthProfileLabel(lengthProfile)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='quick'>
                          {lengthProfileLabel('quick')}
                        </SelectItem>
                        <SelectItem value='standard'>
                          {lengthProfileLabel('standard')}
                        </SelectItem>
                        <SelectItem value='complete'>
                          {lengthProfileLabel('complete')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label>{localize('Feedback policy', '反馈方式')}</Label>
                  <ToggleGroup
                    aria-label={localize('Feedback policy', '反馈方式')}
                    className='grid w-full grid-cols-3'
                    disabled={createSessionMutation.isPending}
                    onValueChange={(values) => {
                      const nextFeedbackMode = values.find(
                        (value) => value !== feedbackMode
                      ) as TrainingFeedbackMode | undefined
                      if (nextFeedbackMode) {
                        setFeedbackMode(nextFeedbackMode)
                      }
                    }}
                    value={[feedbackMode]}
                    variant='outline'
                  >
                    {TRAINING_FEEDBACK_MODE_OPTIONS.map((option) => (
                      <ToggleGroupItem
                        className='h-auto min-h-9 w-full px-2 py-1.5'
                        key={option.value}
                        title={localize(
                          option.description.english,
                          option.description.chinese
                        )}
                        value={option.value}
                      >
                        {localize(option.label.english, option.label.chinese)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>

                <div className='space-y-2'>
                  <Label>{localize('Training modality', '训练媒介')}</Label>
                  <ToggleGroup
                    value={[modality]}
                    onValueChange={(values) => {
                      const nextModality = values.find(
                        (value) => value !== modality
                      ) as TrainingModality | undefined
                      if (!nextModality) return
                      setModality(nextModality)
                      if (
                        !isTrainingModeSelectionAvailable({
                          modality: nextModality,
                          interactionMode,
                        })
                      ) {
                        setInteractionMode('turn_based')
                      }
                    }}
                    variant='outline'
                    className='grid w-full grid-cols-3'
                    disabled={createSessionMutation.isPending}
                    aria-label={localize('Training modality', '训练媒介')}
                  >
                    {SESSION_MODALITIES.map((option) => {
                      const Icon = option.icon
                      const available = option.value !== 'video'
                      return (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          className='h-auto min-h-9 w-full flex-wrap gap-1 py-1'
                          disabled={!available}
                          title={
                            available
                              ? undefined
                              : localize(
                                  'Video training is coming soon',
                                  '视频训练即将开放'
                                )
                          }
                        >
                          <Icon />
                          {modalityLabel(option.value)}
                          {!available && (
                            <Badge
                              variant='secondary'
                              className='px-1.5 text-[10px]'
                            >
                              {localize('Coming soon', '即将开放')}
                            </Badge>
                          )}
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                </div>

                {modality !== 'text' && (
                  <div className='space-y-2'>
                    <Label>{localize('Interaction mode', '交互方式')}</Label>
                    <ToggleGroup
                      value={[interactionMode]}
                      onValueChange={(values) => {
                        const nextInteractionMode = values.find(
                          (value) => value !== interactionMode
                        ) as TrainingInteractionMode | undefined
                        if (nextInteractionMode) {
                          setInteractionMode(nextInteractionMode)
                        }
                      }}
                      variant='outline'
                      className='grid w-full grid-cols-2'
                      disabled={createSessionMutation.isPending}
                      aria-label={localize('Interaction mode', '交互方式')}
                    >
                      {INTERACTION_MODES.map((option) => {
                        const Icon = option.icon
                        const available = isTrainingModeSelectionAvailable({
                          modality,
                          interactionMode: option.value,
                        })
                        return (
                          <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                            className='h-auto min-h-9 w-full gap-1 px-2 py-1.5 text-center whitespace-normal'
                            disabled={!available}
                            title={
                              available
                                ? undefined
                                : localize(
                                    'Realtime video is coming soon',
                                    '实时视频即将开放'
                                  )
                            }
                          >
                            <Icon />
                            {interactionModeLabel(option.value)}
                            {!available && (
                              <Badge
                                variant='secondary'
                                className='ml-1 px-1.5 text-[10px]'
                              >
                                {localize('Coming soon', '即将开放')}
                              </Badge>
                            )}
                          </ToggleGroupItem>
                        )
                      })}
                    </ToggleGroup>
                  </div>
                )}

                {modality === 'voice' ? (
                  <div className='space-y-2'>
                    <Label className='flex items-center gap-1.5'>
                      <Radio className='size-4' />
                      {localize('Voice preset', '语音预设')}
                    </Label>
                    <ModelSelector
                      variant='field'
                      showOptionDescriptions={false}
                      plainCategoryLabels
                      models={voiceRouteOptions}
                      selectedModel={voiceRouteId}
                      onModelChange={setVoiceRouteId}
                      disabled={
                        createSessionMutation.isPending ||
                        retrySessionId !== null
                      }
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
                  </div>
                ) : (
                  <div className='space-y-2'>
                    <Label>{localize('Language model', '语言模型')}</Label>
                    <ModelSelector
                      variant='field'
                      models={playgroundModels}
                      selectedModel={playgroundConfig.model}
                      onModelChange={(value) =>
                        updatePlaygroundConfig('model', value)
                      }
                      disabled={createSessionMutation.isPending}
                      placeholder={localize('Select a model', '选择模型')}
                      searchPlaceholder={localize(
                        'Search models...',
                        '搜索模型...'
                      )}
                      emptyText={localize('No model found.', '没有找到模型')}
                      ariaLabel={localize('Language model', '语言模型')}
                    />
                  </div>
                )}

                {createSessionMutation.isError && (
                  <Alert variant='destructive'>
                    <CircleAlert />
                    <AlertTitle>
                      {retrySessionId
                        ? localize(
                            'The session started without an opening message',
                            '会话已启动，但开场消息未就绪'
                          )
                        : localize(
                            'Failed to create session',
                            '训练会话创建失败'
                          )}
                    </AlertTitle>
                    <AlertDescription>
                      {trainingRequestErrorMessage(
                        createSessionMutation.error,
                        localize('Request failed', '请求失败')
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <DialogClose render={<Button variant='outline' />}>
                  {localize('Close', '关闭')}
                </DialogClose>
                <Button
                  onClick={createSelectedSession}
                  disabled={
                    createSessionMutation.isPending ||
                    modality === 'video' ||
                    selectedFocus.length === 0 ||
                    (modality === 'voice'
                      ? !selectedVoiceRoute ||
                        !voiceRouteIsReady(selectedVoiceRoute)
                      : !playgroundConfig.model)
                  }
                >
                  {createSessionMutation.isPending ? (
                    <LoaderCircle className='animate-spin' />
                  ) : (
                    <Play />
                  )}
                  {startButtonLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

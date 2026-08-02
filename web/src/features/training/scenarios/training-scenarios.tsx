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
import type { ColumnDef } from '@tanstack/react-table'
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  MessageSquare,
  MessagesSquare,
  Mic,
  Play,
  RefreshCw,
  Search,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePage,
  DataTableViewModeToggle,
  type DataTableViewMode,
  useDataTable,
  useDataTableViewMode,
} from '@/components/data-table'
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

import { useTrainingHost } from '../host'
import {
  scenarioPressure,
  type TrainingFocusScope,
  type TrainingLengthProfile,
  type TrainingPressure,
} from '../training-plan'
import {
  buildTrainingSessionRequest,
  createTrainingSession,
  filterTrainingScenarios,
  listTrainingScenarios,
  trainingRequestErrorMessage,
} from './api'
import type {
  TrainingScenario,
  TrainingScenarioCategory,
  TrainingScenarioDifficulty,
  TrainingSession,
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
const SESSION_MODES: Array<{
  icon: typeof MessageSquare
  value: TrainingSessionMode
}> = [
  { icon: MessageSquare, value: 'text' },
  { icon: Mic, value: 'voice' },
  { icon: Video, value: 'video' },
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
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState<
    TrainingScenarioDifficulty | 'all'
  >('all')
  const [category, setCategory] = useState<TrainingScenarioCategory | 'all'>(
    'all'
  )
  const [selectedScenario, setSelectedScenario] =
    useState<TrainingScenario | null>(null)
  const [mode, setMode] = useState<TrainingSessionMode>('text')
  const [focusScope, setFocusScope] =
    useState<TrainingFocusScope>('recommended')
  const [selectedFocus, setSelectedFocus] = useState<readonly string[]>([])
  const [pressure, setPressure] = useState<TrainingPressure>('medium')
  const [lengthProfile, setLengthProfile] =
    useState<TrainingLengthProfile>('standard')
  const [createdSession, setCreatedSession] = useState<TrainingSession | null>(
    null
  )
  const [viewMode, setViewMode] = useDataTableViewMode({
    storageKey: 'talkwise.training-scenarios.view-mode',
    defaultMode: 'table',
  })
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  const scenariosQuery = useQuery({
    queryKey: ['training', 'scenarios', host.apiBase],
    queryFn: () => listTrainingScenarios(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })

  const createSessionMutation = useMutation({
    mutationFn: (request: ReturnType<typeof buildTrainingSessionRequest>) =>
      createTrainingSession(host.apiBase, request),
    onSuccess: setCreatedSession,
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
  const modeLabel = (value: TrainingSessionMode) => {
    const labels = {
      text: localize('Text', '文本'),
      voice: localize('Voice', '语音'),
      video: localize('Video', '视频'),
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
    setCreatedSession(null)
    setMode('text')
    setFocusScope('recommended')
    setSelectedFocus(scenario.trainingPoints.slice(0, 3))
    setPressure(scenarioPressure(scenario.difficulty))
    setLengthProfile('standard')
    setSelectedScenario(scenario)
  }
  const closeScenario = () => {
    if (createSessionMutation.isPending) return
    createSessionMutation.reset()
    setCreatedSession(null)
    setSelectedScenario(null)
  }
  const createSelectedSession = () => {
    if (!selectedScenario) return
    createSessionMutation.mutate(
      buildTrainingSessionRequest(selectedScenario, mode, {
        focusScope,
        selectedFocus,
        pressure,
        lengthProfile,
      })
    )
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
                <DialogTitle>{selectedScenario.title}</DialogTitle>
                <DialogDescription>
                  {selectedScenario.description}
                </DialogDescription>
              </DialogHeader>

              <div className='space-y-4'>
                <dl className='grid grid-cols-2 gap-x-4 gap-y-3 text-sm'>
                  <div>
                    <dt className='text-muted-foreground text-xs'>
                      {localize('Counterpart', '对练角色')}
                    </dt>
                    <dd className='mt-1 font-medium'>
                      {selectedScenario.persona.name}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-xs'>
                      {localize('Learner role', '练习者角色')}
                    </dt>
                    <dd className='mt-1 font-medium'>
                      {selectedScenario.learnerRole}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-xs'>
                      {localize('Category', '类型')}
                    </dt>
                    <dd className='mt-1'>
                      {categoryLabel(selectedScenario.category)}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-xs'>
                      {localize('Difficulty', '难度')}
                    </dt>
                    <dd className='mt-1'>
                      {difficultyLabel(selectedScenario.difficulty)}
                    </dd>
                  </div>
                </dl>

                {selectedScenario.trainingPoints.length > 0 && (
                  <div className='space-y-2'>
                    <Label>{localize('Training focus', '训练重点')}</Label>
                    <ToggleGroup
                      aria-label={localize(
                        'Training focus scope',
                        '训练重点范围'
                      )}
                      className='grid w-full grid-cols-3'
                      disabled={
                        createSessionMutation.isPending ||
                        createdSession !== null
                      }
                      onValueChange={(values) => {
                        const next = values.find(
                          (value) => value !== focusScope
                        )
                        if (!next) return
                        const scope = next as TrainingFocusScope
                        setFocusScope(scope)
                        if (scope === 'recommended') {
                          setSelectedFocus(
                            selectedScenario.trainingPoints.slice(0, 3)
                          )
                        } else if (scope === 'all') {
                          setSelectedFocus(selectedScenario.trainingPoints)
                        }
                      }}
                      value={[focusScope]}
                      variant='outline'
                    >
                      <ToggleGroupItem value='recommended'>
                        {localize('Recommended', '推荐')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='all'>
                        {localize('All', '全部')}
                      </ToggleGroupItem>
                      <ToggleGroupItem value='custom'>
                        {localize('Custom', '自选')}
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <div className='flex flex-wrap gap-1.5'>
                      {selectedScenario.trainingPoints.map((point) => (
                        <Button
                          className='h-auto px-2 py-1 text-xs whitespace-normal'
                          disabled={
                            createSessionMutation.isPending ||
                            createdSession !== null
                          }
                          key={point}
                          onClick={() => {
                            setFocusScope('custom')
                            setSelectedFocus((current) =>
                              current.includes(point)
                                ? current.filter((item) => item !== point)
                                : [...current, point]
                            )
                          }}
                          size='sm'
                          variant={
                            selectedFocus.includes(point)
                              ? 'secondary'
                              : 'outline'
                          }
                        >
                          {point}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label>
                      {localize('Counterpart pressure', '对手压力')}
                    </Label>
                    <Select
                      disabled={
                        createSessionMutation.isPending ||
                        createdSession !== null
                      }
                      value={pressure}
                      onValueChange={(value) =>
                        value && setPressure(value as TrainingPressure)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='easy'>
                          {localize('Supportive', '温和')}
                        </SelectItem>
                        <SelectItem value='medium'>
                          {localize('Realistic', '真实')}
                        </SelectItem>
                        <SelectItem value='hard'>
                          {localize('Pressured', '高压')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2'>
                    <Label>{localize('Practice length', '练习长度')}</Label>
                    <Select
                      disabled={
                        createSessionMutation.isPending ||
                        createdSession !== null
                      }
                      value={lengthProfile}
                      onValueChange={(value) =>
                        value &&
                        setLengthProfile(value as TrainingLengthProfile)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='quick'>
                          {localize('Quick · 6 turns', '快速 · 6 轮')}
                        </SelectItem>
                        <SelectItem value='standard'>
                          {localize('Standard · 9 turns', '标准 · 9 轮')}
                        </SelectItem>
                        <SelectItem value='complete'>
                          {localize('Complete · 12 turns', '完整 · 12 轮')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label>{localize('Training mode', '训练模式')}</Label>
                  <ToggleGroup
                    value={[mode]}
                    onValueChange={(values) => {
                      const nextMode = values.find((value) => value !== mode)
                      if (nextMode) setMode(nextMode as TrainingSessionMode)
                    }}
                    variant='outline'
                    className='grid w-full grid-cols-3'
                    disabled={
                      createSessionMutation.isPending || createdSession !== null
                    }
                    aria-label={localize('Training mode', '训练模式')}
                  >
                    {SESSION_MODES.map((option) => {
                      const Icon = option.icon
                      return (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          className='w-full'
                        >
                          <Icon />
                          {modeLabel(option.value)}
                        </ToggleGroupItem>
                      )
                    })}
                  </ToggleGroup>
                </div>

                {createSessionMutation.isError && (
                  <Alert variant='destructive'>
                    <CircleAlert />
                    <AlertTitle>
                      {localize('Failed to create session', '训练会话创建失败')}
                    </AlertTitle>
                    <AlertDescription>
                      {trainingRequestErrorMessage(
                        createSessionMutation.error,
                        localize('Request failed', '请求失败')
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {createdSession && (
                  <Alert>
                    <CheckCircle2 />
                    <AlertTitle>
                      {localize('Session created', '训练会话已创建')}
                    </AlertTitle>
                    <AlertDescription className='break-all'>
                      {localize('Session ID', '会话 ID')}:{' '}
                      {createdSession.sessionId}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <DialogClose render={<Button variant='outline' />}>
                  {localize('Close', '关闭')}
                </DialogClose>
                {!createdSession && (
                  <Button
                    onClick={createSelectedSession}
                    disabled={
                      createSessionMutation.isPending ||
                      selectedFocus.length === 0
                    }
                  >
                    {createSessionMutation.isPending ? (
                      <LoaderCircle className='animate-spin' />
                    ) : (
                      <Play />
                    )}
                    {createSessionMutation.isPending
                      ? localize('Starting...', '启动中...')
                      : localize('Start training', '开始训练')}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  SettingsControlGroup,
  SettingsForm,
  SettingsFormGrid,
  SettingsFormGridItem,
  SettingsSwitchField,
} from '@/features/system-settings/components/settings-form-layout'
import { SettingsPageFrame } from '@/features/system-settings/components/settings-page'
import { SettingsPageFormActions } from '@/features/system-settings/components/settings-page-context'

import { useTrainingHost } from '../host'
import {
  getTrainingRubricDefaults,
  getTrainingScenarioConfig,
  saveTrainingScenarioConfig,
  trainingConfigRequestErrorMessage,
} from './api'
import {
  canManageTrainingScenarioConfig,
  rubricDefaultsForConfiguredDimensions,
} from './contract'
import type {
  TrainingScenarioCategory,
  TrainingScenarioConfigDraft,
  TrainingScenarioConfigState,
  TrainingScenarioDifficulty,
  TrainingScenarioDimension,
  TrainingScenarioDimensionWeight,
} from './types'

type SettingsTab = 'dimensions' | 'scenarios'
type Localize = (english: string, chinese: string) => string

type DefaultDimensionLocalization = {
  name: readonly [english: string, chinese: string]
  description: readonly [english: string, chinese: string]
}

const CATEGORIES: TrainingScenarioCategory[] = [
  'sales',
  'customer_service',
  'negotiation',
  'interview',
  'product_management',
  'workplace',
]
const DIFFICULTIES: TrainingScenarioDifficulty[] = [
  'easy',
  'medium',
  'hard',
  'expert',
]
const FRAMEWORKS = ['prep', 'star', 'scqa', 'pyramid']
const LEARNER_ROLE_LOCALIZATION: Record<string, readonly [string, string]> = {
  'Customer Success Manager': ['Customer Success Manager', '客户成功经理'],
  'Project Lead': ['Project Lead', '项目负责人'],
  Salesperson: ['Salesperson', '销售顾问'],
  'Team Member': ['Team Member', '团队成员'],
}

const DEFAULT_DIMENSION_LOCALIZATION: Record<
  string,
  DefaultDimensionLocalization
> = {
  substance: {
    name: ['Substance', '内容质量'],
    description: [
      'Addresses the real issue with concrete information, trade-offs, and useful next steps.',
      '围绕真实问题，给出具体信息、权衡取舍和有用的下一步建议。',
    ],
  },
  structure: {
    name: ['Structure', '表达结构'],
    description: [
      'Keeps the response easy to follow with an appropriate framework and clear flow.',
      '用合适的框架和清晰的逻辑，使回应易于理解。',
    ],
  },
  relevance: {
    name: ['Relevance', '回应相关性'],
    description: [
      "Responds to the counterpart's actual need or objection instead of using generic scripts.",
      '回应对方真实需求或异议，而不是套用泛泛话术。',
    ],
  },
  credibility: {
    name: ['Credibility', '可信度'],
    description: [
      'Supports claims with evidence, examples, limitations, or a believable plan.',
      '用证据、案例、限制条件或可信的实施计划支持观点。',
    ],
  },
  differentiation: {
    name: ['Differentiation', '差异化'],
    description: [
      'Creates a clear point of view, contrast, or differentiated value.',
      '形成清晰观点、有效对比或差异化价值。',
    ],
  },
}

function nowIso(): string {
  return new Date().toISOString()
}

function splitLines(value: string): string[] {
  return value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function clampWeight(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function evenlyDistributedWeights(
  dimensionIds: string[]
): TrainingScenarioDimensionWeight[] {
  if (dimensionIds.length === 0) return []
  const base = Math.floor(100 / dimensionIds.length)
  const remainder = 100 - base * dimensionIds.length
  return dimensionIds.map((dimensionId, index) => ({
    dimensionId,
    weight: base + (index < remainder ? 1 : 0),
  }))
}

function totalWeight(weights: TrainingScenarioDimensionWeight[]): number {
  return weights.reduce((total, item) => total + item.weight, 0)
}

function newScenario(
  dimensions: TrainingScenarioDimension[]
): TrainingScenarioConfigDraft {
  const timestamp = nowIso()
  const enabledDimensionIds = dimensions
    .filter((dimension) => dimension.enabled)
    .map((dimension) => dimension.id)

  return {
    id: `local-scenario-${Date.now().toString(36)}`,
    title: 'Untitled scenario',
    description: '',
    customerProfile: '',
    difficulty: 'medium',
    category: 'sales',
    required: false,
    enabled: true,
    openingLine: '',
    persona: { name: '', role: '', style: '' },
    learnerRole: '',
    framework: 'prep',
    trainingPoints: [],
    dimensionWeights: evenlyDistributedWeights(enabledDimensionIds),
    updatedAt: timestamp,
  }
}

function newDimension(): TrainingScenarioDimension {
  const timestamp = nowIso()
  return {
    id: `local-dimension-${Date.now().toString(36)}`,
    name: 'New scoring dimension',
    description: '',
    enabled: true,
    source: 'local',
    updatedAt: timestamp,
  }
}

function localizeDimension(
  dimension: TrainingScenarioDimension,
  localize: Localize
): Pick<TrainingScenarioDimension, 'name' | 'description'> {
  const defaultDimension = DEFAULT_DIMENSION_LOCALIZATION[dimension.id]

  if (
    dimension.source !== 'default' ||
    !defaultDimension ||
    dimension.name !== defaultDimension.name[0] ||
    dimension.description !== defaultDimension.description[0]
  ) {
    return {
      name: dimension.name,
      description: dimension.description,
    }
  }

  return {
    name: localize(...defaultDimension.name),
    description: localize(...defaultDimension.description),
  }
}

function scenarioLabel(
  scenario: TrainingScenarioConfigDraft,
  localize: (english: string, chinese: string) => string
): string {
  const labels: Record<TrainingScenarioCategory, [string, string]> = {
    sales: ['Sales', '销售'],
    customer_service: ['Customer service', '客户服务'],
    negotiation: ['Negotiation', '谈判'],
    interview: ['Interview', '面试'],
    product_management: ['Product management', '产品管理'],
    workplace: ['Workplace', '职场'],
  }
  return localize(...labels[scenario.category])
}

function difficultyLabel(
  difficulty: TrainingScenarioDifficulty,
  localize: (english: string, chinese: string) => string
): string {
  const labels: Record<TrainingScenarioDifficulty, [string, string]> = {
    easy: ['Easy', '简单'],
    medium: ['Medium', '中等'],
    hard: ['Hard', '困难'],
    expert: ['Expert', '专家'],
  }
  return localize(...labels[difficulty])
}

function frameworkLabel(framework: string, localize: Localize): string {
  const labels: Record<string, readonly [string, string]> = {
    prep: ['PREP framework', 'PREP 表达法'],
    star: ['STAR framework', 'STAR 法则'],
    scqa: ['SCQA framework', 'SCQA 表达法'],
    pyramid: ['Pyramid principle', '金字塔原理'],
  }
  const label = labels[framework]
  return label ? localize(...label) : framework.toUpperCase()
}

function learnerRoleLabel(role: string, localize: Localize): string {
  const label = LEARNER_ROLE_LOCALIZATION[role]
  return label ? localize(...label) : role
}

export function TrainingSettings() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<SettingsTab>('scenarios')
  const [draft, setDraft] = useState<TrainingScenarioConfigState | null>(null)
  const canManage = canManageTrainingScenarioConfig(host.role)
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  const configQuery = useQuery({
    queryKey: ['training', 'scenario-config', host.apiBase],
    queryFn: () => getTrainingScenarioConfig(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })

  useEffect(() => {
    if (configQuery.data) setDraft(configQuery.data)
  }, [configQuery.data])

  const saveMutation = useMutation({
    mutationFn: (state: TrainingScenarioConfigState) =>
      saveTrainingScenarioConfig(host.apiBase, state),
    onSuccess: (savedState) => {
      setDraft(savedState)
      queryClient.setQueryData(
        ['training', 'scenario-config', host.apiBase],
        savedState
      )
    },
  })

  const rubricDefaultsMutation = useMutation({
    mutationFn: async (input: {
      scenarioId: string
      category: TrainingScenarioCategory
      dimensions: TrainingScenarioDimension[]
    }) => {
      const defaults = await getTrainingRubricDefaults(
        host.apiBase,
        input.category
      )
      return {
        scenarioId: input.scenarioId,
        dimensionWeights: rubricDefaultsForConfiguredDimensions(
          defaults,
          input.dimensions
        ),
      }
    },
    onSuccess: ({ scenarioId, dimensionWeights }) => {
      saveMutation.reset()
      setDraft((current) =>
        current
          ? {
              ...current,
              scenarios: current.scenarios.map((scenario) =>
                scenario.id === scenarioId
                  ? { ...scenario, dimensionWeights, updatedAt: nowIso() }
                  : scenario
              ),
              updatedAt: nowIso(),
            }
          : current
      )
    },
  })

  const selectedScenario = useMemo(
    () =>
      draft?.scenarios.find(
        (scenario) => scenario.id === draft.selectedScenarioId
      ) ?? draft?.scenarios[0],
    [draft]
  )
  const selectedDimension = useMemo(
    () =>
      draft?.dimensions.find(
        (dimension) => dimension.id === draft.selectedDimensionId
      ) ?? draft?.dimensions[0],
    [draft]
  )
  const selectedWeightTotal = totalWeight(
    selectedScenario?.dimensionWeights ?? []
  )
  const isWeightValid =
    (selectedScenario?.dimensionWeights.length ?? 0) > 0 &&
    selectedWeightTotal === 100
  const canSave =
    host.authStatus === 'authenticated' &&
    canManage &&
    draft !== null &&
    !saveMutation.isPending &&
    !rubricDefaultsMutation.isPending &&
    draft.dimensions.every(
      (dimension) => dimension.id.trim() && dimension.name.trim()
    ) &&
    draft.scenarios.every(
      (scenario) =>
        scenario.title.trim() &&
        scenario.dimensionWeights.length > 0 &&
        totalWeight(scenario.dimensionWeights) === 100
    )

  const updateDraft = (
    updater: (
      current: TrainingScenarioConfigState
    ) => TrainingScenarioConfigState
  ) => {
    saveMutation.reset()
    rubricDefaultsMutation.reset()
    setDraft((current) => (current ? updater(current) : current))
  }

  const updateScenario = (
    scenarioId: string,
    updater: (
      scenario: TrainingScenarioConfigDraft
    ) => TrainingScenarioConfigDraft
  ) => {
    updateDraft((current) => ({
      ...current,
      scenarios: current.scenarios.map((scenario) =>
        scenario.id === scenarioId ? updater(scenario) : scenario
      ),
      updatedAt: nowIso(),
    }))
  }

  const updateDimension = (
    dimensionId: string,
    updater: (dimension: TrainingScenarioDimension) => TrainingScenarioDimension
  ) => {
    updateDraft((current) => ({
      ...current,
      dimensions: current.dimensions.map((dimension) =>
        dimension.id === dimensionId ? updater(dimension) : dimension
      ),
      updatedAt: nowIso(),
    }))
  }

  const selectScenario = (scenarioId: string | null) => {
    if (!scenarioId) return
    updateDraft((current) => ({
      ...current,
      selectedScenarioId: scenarioId,
    }))
  }

  const selectDimension = (dimensionId: string | null) => {
    if (!dimensionId) return
    updateDraft((current) => ({
      ...current,
      selectedDimensionId: dimensionId,
    }))
  }

  const createScenario = () => {
    if (!canManage) return
    updateDraft((current) => {
      const scenario = newScenario(current.dimensions)
      return {
        ...current,
        scenarios: [...current.scenarios, scenario],
        selectedScenarioId: scenario.id,
        updatedAt: nowIso(),
      }
    })
    setTab('scenarios')
  }

  const removeScenario = () => {
    if (
      !canManage ||
      !draft ||
      !selectedScenario ||
      draft.scenarios.length <= 1
    ) {
      return
    }
    const scenarios = draft.scenarios.filter(
      (scenario) => scenario.id !== selectedScenario.id
    )
    updateDraft((current) => ({
      ...current,
      scenarios,
      selectedScenarioId: scenarios[0]?.id ?? null,
      updatedAt: nowIso(),
    }))
  }

  const createDimension = () => {
    if (!canManage) return
    updateDraft((current) => {
      const dimension = newDimension()
      return {
        ...current,
        dimensions: [...current.dimensions, dimension],
        selectedDimensionId: dimension.id,
        updatedAt: nowIso(),
      }
    })
    setTab('dimensions')
  }

  const removeDimension = () => {
    if (
      !canManage ||
      !draft ||
      !selectedDimension ||
      selectedDimension.source !== 'local'
    ) {
      return
    }
    const dimensions = draft.dimensions.filter(
      (dimension) => dimension.id !== selectedDimension.id
    )
    updateDraft((current) => ({
      ...current,
      dimensions,
      scenarios: current.scenarios.map((scenario) => ({
        ...scenario,
        dimensionWeights: scenario.dimensionWeights.filter(
          (weight) => weight.dimensionId !== selectedDimension.id
        ),
      })),
      selectedDimensionId: dimensions[0]?.id ?? null,
      updatedAt: nowIso(),
    }))
  }

  const save = () => {
    if (draft && canSave) saveMutation.mutate(draft)
  }

  const applyCategoryDefaults = () => {
    if (!canManage || !draft || !selectedScenario) return
    rubricDefaultsMutation.reset()
    rubricDefaultsMutation.mutate({
      scenarioId: selectedScenario.id,
      category: selectedScenario.category,
      dimensions: draft.dimensions,
    })
  }

  const reset = () => {
    saveMutation.reset()
    rubricDefaultsMutation.reset()
    void configQuery.refetch()
  }

  if (host.authStatus === 'anonymous') {
    return (
      <SettingsPageFrame title={localize('Training settings', '训练设置')}>
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>{localize('Sign-in required', '需要登录')}</AlertTitle>
          <AlertDescription>
            {localize(
              'Sign in to view the training configuration.',
              '登录后才能查看训练配置。'
            )}
          </AlertDescription>
        </Alert>
      </SettingsPageFrame>
    )
  }

  return (
    <SettingsPageFrame title={localize('Training settings', '训练设置')}>
      <SettingsPageFormActions
        onSave={save}
        onReset={reset}
        isSaving={saveMutation.isPending}
        isSaveDisabled={!canSave}
        isResetDisabled={configQuery.isFetching}
        saveLabel={localize('Save changes', '保存更改')}
        savingLabel={localize('Saving...', '保存中...')}
        resetLabel={localize('Reload', '重新加载')}
      />
      <div className='space-y-4'>
        {configQuery.isError && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>
              {localize('Unable to load training settings', '无法加载训练设置')}
            </AlertTitle>
            <AlertDescription>
              {trainingConfigRequestErrorMessage(
                configQuery.error,
                localize('Request failed', '请求失败')
              )}
            </AlertDescription>
          </Alert>
        )}

        {saveMutation.isError && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>
              {localize('Unable to save training settings', '无法保存训练设置')}
            </AlertTitle>
            <AlertDescription>
              {trainingConfigRequestErrorMessage(
                saveMutation.error,
                localize('Request failed', '请求失败')
              )}
            </AlertDescription>
          </Alert>
        )}

        {rubricDefaultsMutation.isError && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>
              {localize(
                'Unable to load rubric defaults',
                '无法加载默认评分权重'
              )}
            </AlertTitle>
            <AlertDescription>
              {trainingConfigRequestErrorMessage(
                rubricDefaultsMutation.error,
                localize('Request failed', '请求失败')
              )}
            </AlertDescription>
          </Alert>
        )}

        {host.authStatus === 'authenticated' && !canManage && (
          <Alert>
            <CircleAlert />
            <AlertTitle>
              {localize('Read-only training settings', '训练设置为只读')}
            </AlertTitle>
            <AlertDescription>
              {localize(
                'Your account can view the published training configuration. An administrator is required to change it.',
                '当前账号可以查看已发布的训练配置，修改配置需要管理员权限。'
              )}
            </AlertDescription>
          </Alert>
        )}

        {saveMutation.isSuccess && (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>
              {localize('Training settings saved', '训练设置已保存')}
            </AlertTitle>
            <AlertDescription>
              {localize(
                'Published scenarios will use this configuration for new sessions.',
                '新建训练会话会使用这份已发布配置。'
              )}
            </AlertDescription>
          </Alert>
        )}

        {(configQuery.isPending || host.authStatus === 'loading') && (
          <div className='text-muted-foreground flex min-h-40 items-center justify-center text-sm'>
            <LoaderCircle className='mr-2 animate-spin' />
            {localize('Loading training settings...', '正在加载训练设置...')}
          </div>
        )}

        {!configQuery.isPending && !configQuery.isError && draft && (
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as SettingsTab)}
          >
            <TabsList variant='line'>
              <TabsTrigger value='scenarios'>
                {localize('Scenarios', '训练场景')}
                <Badge variant='secondary' className='ml-1'>
                  {draft.scenarios.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value='dimensions'>
                {localize('Scoring dimensions', '评分维度')}
                <Badge variant='secondary' className='ml-1'>
                  {draft.dimensions.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value='scenarios' className='mt-5'>
              <div className='space-y-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={selectedScenario?.id ?? null}
                    onValueChange={selectScenario}
                  >
                    <SelectTrigger className='w-full sm:w-80'>
                      <SelectValue
                        placeholder={localize(
                          'Select a scenario',
                          '选择训练场景'
                        )}
                      >
                        {selectedScenario?.title}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {draft.scenarios.map((scenario) => (
                          <SelectItem key={scenario.id} value={scenario.id}>
                            {scenario.title}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={createScenario}
                    disabled={!canManage}
                  >
                    <Plus data-icon='inline-start' />
                    {localize('Add scenario', '新建场景')}
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={removeScenario}
                    disabled={!canManage || draft.scenarios.length <= 1}
                  >
                    <Trash2 data-icon='inline-start' />
                    {localize('Remove', '删除')}
                  </Button>
                </div>

                {selectedScenario ? (
                  <ScenarioForm
                    scenario={selectedScenario}
                    dimensions={draft.dimensions}
                    isWeightValid={isWeightValid}
                    readOnly={!canManage}
                    isApplyingDefaults={rubricDefaultsMutation.isPending}
                    localize={localize}
                    onApplyCategoryDefaults={applyCategoryDefaults}
                    onChange={(updater) =>
                      updateScenario(selectedScenario.id, updater)
                    }
                  />
                ) : (
                  <NoConfiguration
                    localize={localize}
                    title='No scenarios'
                    titleZh='暂无训练场景'
                    description='Add a scenario to start configuring training.'
                    descriptionZh='新建场景后即可配置训练内容。'
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value='dimensions' className='mt-5'>
              <div className='space-y-4'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Select
                    value={selectedDimension?.id ?? null}
                    onValueChange={selectDimension}
                  >
                    <SelectTrigger className='w-full sm:w-80'>
                      <SelectValue
                        placeholder={localize(
                          'Select a dimension',
                          '选择评分维度'
                        )}
                      >
                        {selectedDimension
                          ? localizeDimension(selectedDimension, localize).name
                          : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {draft.dimensions.map((dimension) => {
                          const presentation = localizeDimension(
                            dimension,
                            localize
                          )
                          return (
                            <SelectItem key={dimension.id} value={dimension.id}>
                              {presentation.name}
                            </SelectItem>
                          )
                        })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={createDimension}
                    disabled={!canManage}
                  >
                    <Plus data-icon='inline-start' />
                    {localize('Add dimension', '新建维度')}
                  </Button>
                  <Button
                    variant='destructive'
                    size='sm'
                    onClick={removeDimension}
                    disabled={
                      !canManage || selectedDimension?.source !== 'local'
                    }
                  >
                    <Trash2 data-icon='inline-start' />
                    {localize('Remove', '删除')}
                  </Button>
                </div>

                {selectedDimension ? (
                  <DimensionForm
                    dimension={selectedDimension}
                    presentation={localizeDimension(
                      selectedDimension,
                      localize
                    )}
                    readOnly={!canManage}
                    localize={localize}
                    onChange={(updater) =>
                      updateDimension(selectedDimension.id, updater)
                    }
                  />
                ) : (
                  <NoConfiguration
                    localize={localize}
                    title='No scoring dimensions'
                    titleZh='暂无评分维度'
                    description='Add a scoring dimension before assigning rubric weights.'
                    descriptionZh='请先新建评分维度，再为场景分配权重。'
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </SettingsPageFrame>
  )
}

type ScenarioFormProps = {
  scenario: TrainingScenarioConfigDraft
  dimensions: TrainingScenarioDimension[]
  isWeightValid: boolean
  readOnly: boolean
  isApplyingDefaults: boolean
  localize: Localize
  onApplyCategoryDefaults: () => void
  onChange: (
    updater: (
      scenario: TrainingScenarioConfigDraft
    ) => TrainingScenarioConfigDraft
  ) => void
}

function ScenarioForm(props: ScenarioFormProps) {
  const scenarioWeightTotal = totalWeight(props.scenario.dimensionWeights)
  const selectedDimensionIds = new Set(
    props.scenario.dimensionWeights.map((weight) => weight.dimensionId)
  )

  const patch = (patchValue: Partial<TrainingScenarioConfigDraft>) => {
    props.onChange((scenario) => ({
      ...scenario,
      ...patchValue,
      updatedAt: nowIso(),
    }))
  }
  const patchPersona = (
    key: keyof TrainingScenarioConfigDraft['persona'],
    value: string
  ) => {
    props.onChange((scenario) => ({
      ...scenario,
      persona: { ...scenario.persona, [key]: value },
      updatedAt: nowIso(),
    }))
  }
  const toggleDimension = (dimensionId: string, checked: boolean) => {
    props.onChange((scenario) => ({
      ...scenario,
      dimensionWeights: checked
        ? [...scenario.dimensionWeights, { dimensionId, weight: 0 }]
        : scenario.dimensionWeights.filter(
            (weight) => weight.dimensionId !== dimensionId
          ),
      updatedAt: nowIso(),
    }))
  }
  const updateWeight = (dimensionId: string, value: string) => {
    props.onChange((scenario) => ({
      ...scenario,
      dimensionWeights: scenario.dimensionWeights.map((weight) =>
        weight.dimensionId === dimensionId
          ? { ...weight, weight: clampWeight(value) }
          : weight
      ),
      updatedAt: nowIso(),
    }))
  }
  const balanceWeights = () => {
    props.onChange((scenario) => ({
      ...scenario,
      dimensionWeights: evenlyDistributedWeights(
        scenario.dimensionWeights.map((weight) => weight.dimensionId)
      ),
      updatedAt: nowIso(),
    }))
  }

  return (
    <SettingsForm onSubmit={(event) => event.preventDefault()}>
      <div className='grid gap-4 md:grid-cols-2'>
        <SettingsSwitchField
          checked={props.scenario.enabled}
          disabled={props.readOnly}
          onCheckedChange={(enabled) => patch({ enabled })}
          label={props.localize('Publish scenario', '启用场景')}
          description={props.localize(
            'Only enabled scenarios appear in the practice catalog.',
            '只有启用的场景会显示在练习场景库中。'
          )}
        />
        <SettingsSwitchField
          checked={props.scenario.required}
          disabled={props.readOnly}
          onCheckedChange={(required) => patch({ required })}
          label={props.localize('Required practice', '标记为必练')}
          description={props.localize(
            'Mark this scenario as a required practice item.',
            '将此场景标记为必练项目。'
          )}
        />
      </div>

      <SettingsFormGrid>
        <SettingsFormGridItem>
          <Label htmlFor='training-scenario-title'>
            {props.localize('Scenario name', '场景名称')}
          </Label>
          <Input
            id='training-scenario-title'
            disabled={props.readOnly}
            value={props.scenario.title}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label htmlFor='training-scenario-learner-role'>
            {props.localize('Learner role', '练习者角色')}
          </Label>
          <Input
            id='training-scenario-learner-role'
            disabled={props.readOnly}
            value={learnerRoleLabel(props.scenario.learnerRole, props.localize)}
            onChange={(event) => patch({ learnerRole: event.target.value })}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label>{props.localize('Category', '分类')}</Label>
          <Select
            disabled={props.readOnly}
            value={props.scenario.category}
            onValueChange={(value) =>
              value && patch({ category: value as TrainingScenarioCategory })
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue>
                {scenarioLabel(props.scenario, props.localize)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {scenarioLabel(
                      { ...props.scenario, category },
                      props.localize
                    )}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label>{props.localize('Difficulty', '难度')}</Label>
          <Select
            disabled={props.readOnly}
            value={props.scenario.difficulty}
            onValueChange={(value) =>
              value &&
              patch({ difficulty: value as TrainingScenarioDifficulty })
            }
          >
            <SelectTrigger className='w-full'>
              <SelectValue>
                {difficultyLabel(props.scenario.difficulty, props.localize)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DIFFICULTIES.map((difficulty) => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {difficultyLabel(difficulty, props.localize)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label>{props.localize('Framework', '表达框架')}</Label>
          <Select
            disabled={props.readOnly}
            value={props.scenario.framework}
            onValueChange={(value) => value && patch({ framework: value })}
          >
            <SelectTrigger className='w-full'>
              <SelectValue>
                {frameworkLabel(props.scenario.framework, props.localize)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {FRAMEWORKS.map((framework) => (
                  <SelectItem key={framework} value={framework}>
                    {frameworkLabel(framework, props.localize)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label htmlFor='training-scenario-opening-line'>
            {props.localize('Counterpart opening line', '对手开场白')}
          </Label>
          <Input
            id='training-scenario-opening-line'
            disabled={props.readOnly}
            value={props.scenario.openingLine}
            onChange={(event) => patch({ openingLine: event.target.value })}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem span='full'>
          <Label htmlFor='training-scenario-description'>
            {props.localize('Scenario description', '场景描述')}
          </Label>
          <Textarea
            id='training-scenario-description'
            disabled={props.readOnly}
            rows={3}
            value={props.scenario.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem span='full'>
          <Label htmlFor='training-scenario-customer-profile'>
            {props.localize('Customer profile', '客户画像')}
          </Label>
          <Textarea
            id='training-scenario-customer-profile'
            disabled={props.readOnly}
            rows={3}
            value={props.scenario.customerProfile}
            onChange={(event) => patch({ customerProfile: event.target.value })}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem span='full'>
          <Label htmlFor='training-scenario-points'>
            {props.localize('Training points', '训练要点')}
          </Label>
          <Textarea
            id='training-scenario-points'
            disabled={props.readOnly}
            rows={4}
            value={props.scenario.trainingPoints.join('\n')}
            onChange={(event) =>
              patch({ trainingPoints: splitLines(event.target.value) })
            }
            placeholder={props.localize(
              'One training point per line',
              '每行一个训练要点'
            )}
          />
        </SettingsFormGridItem>
      </SettingsFormGrid>

      <SettingsFormGrid>
        <SettingsFormGridItem>
          <Label htmlFor='training-scenario-persona-name'>
            {props.localize('Counterpart name', '对练角色名称')}
          </Label>
          <Input
            id='training-scenario-persona-name'
            disabled={props.readOnly}
            value={props.scenario.persona.name}
            onChange={(event) => patchPersona('name', event.target.value)}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label htmlFor='training-scenario-persona-role'>
            {props.localize('Counterpart role', '对练角色身份')}
          </Label>
          <Input
            id='training-scenario-persona-role'
            disabled={props.readOnly}
            value={props.scenario.persona.role}
            onChange={(event) => patchPersona('role', event.target.value)}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem span='full'>
          <Label htmlFor='training-scenario-persona-style'>
            {props.localize('Counterpart style', '对练角色风格')}
          </Label>
          <Textarea
            id='training-scenario-persona-style'
            disabled={props.readOnly}
            rows={2}
            value={props.scenario.persona.style}
            onChange={(event) => patchPersona('style', event.target.value)}
          />
        </SettingsFormGridItem>
      </SettingsFormGrid>

      <SettingsControlGroup>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='space-y-0.5'>
            <p className='text-sm font-medium'>
              {props.localize('Scoring dimensions', '评分维度')}
            </p>
            <p
              className={
                props.isWeightValid
                  ? 'text-muted-foreground text-xs'
                  : 'text-destructive text-xs'
              }
            >
              {props.isWeightValid
                ? props.localize('Weights total 100%.', '评分权重合计为 100%。')
                : props.localize(
                    `Weights must total 100%. Current total: ${scenarioWeightTotal}%.`,
                    `评分权重必须合计为 100%，当前为 ${scenarioWeightTotal}%。`
                  )}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={props.onApplyCategoryDefaults}
              disabled={props.readOnly || props.isApplyingDefaults}
            >
              {props.isApplyingDefaults ? (
                <LoaderCircle
                  className='animate-spin'
                  data-icon='inline-start'
                />
              ) : (
                <RotateCcw data-icon='inline-start' />
              )}
              {props.localize('Category defaults', '分类默认值')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={balanceWeights}
              disabled={
                props.readOnly || props.scenario.dimensionWeights.length === 0
              }
            >
              {props.localize('Balance weights', '平均分配')}
            </Button>
          </div>
        </div>
        <div className='divide-y'>
          {props.dimensions.map((dimension) => {
            const presentation = localizeDimension(dimension, props.localize)
            const selected = selectedDimensionIds.has(dimension.id)
            const weight = props.scenario.dimensionWeights.find(
              (item) => item.dimensionId === dimension.id
            )?.weight
            const disabled = !dimension.enabled && !selected
            return (
              <div
                key={dimension.id}
                className='grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3 py-3'
              >
                <div className='min-w-0 space-y-1'>
                  <SettingsSwitchField
                    checked={selected}
                    disabled={props.readOnly || disabled}
                    onCheckedChange={(checked) =>
                      toggleDimension(dimension.id, checked)
                    }
                    label={presentation.name}
                    description={presentation.description}
                    className='py-0'
                  />
                </div>
                <div className='relative'>
                  <Input
                    aria-label={props.localize(
                      `${presentation.name} weight`,
                      `${presentation.name} 权重`
                    )}
                    type='number'
                    min='0'
                    max='100'
                    disabled={props.readOnly || !selected}
                    value={weight ?? 0}
                    onChange={(event) =>
                      updateWeight(dimension.id, event.target.value)
                    }
                    className='pr-6 text-right tabular-nums'
                  />
                  <span className='text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs'>
                    %
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </SettingsControlGroup>
    </SettingsForm>
  )
}

type DimensionFormProps = {
  dimension: TrainingScenarioDimension
  presentation: Pick<TrainingScenarioDimension, 'name' | 'description'>
  readOnly: boolean
  localize: Localize
  onChange: (
    updater: (dimension: TrainingScenarioDimension) => TrainingScenarioDimension
  ) => void
}

function DimensionForm(props: DimensionFormProps) {
  const patch = (patchValue: Partial<TrainingScenarioDimension>) => {
    props.onChange((dimension) => ({
      ...dimension,
      ...patchValue,
      updatedAt: nowIso(),
    }))
  }

  return (
    <SettingsForm onSubmit={(event) => event.preventDefault()}>
      <SettingsControlGroup>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>{props.presentation.name}</span>
          <Badge variant='outline'>
            {props.dimension.source === 'local'
              ? props.localize('Custom', '自定义')
              : props.localize('Default', '默认')}
          </Badge>
        </div>
      </SettingsControlGroup>
      <SettingsFormGrid>
        <SettingsFormGridItem>
          <Label htmlFor='training-dimension-id'>
            {props.localize('Dimension ID', '维度 ID')}
          </Label>
          <Input
            id='training-dimension-id'
            value={props.dimension.id}
            disabled
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem>
          <Label htmlFor='training-dimension-name'>
            {props.localize('Dimension name', '维度名称')}
          </Label>
          <Input
            id='training-dimension-name'
            disabled={props.readOnly}
            value={props.presentation.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </SettingsFormGridItem>
        <SettingsFormGridItem span='full'>
          <Label htmlFor='training-dimension-description'>
            {props.localize('Scoring guidance', '评分说明')}
          </Label>
          <Textarea
            id='training-dimension-description'
            disabled={props.readOnly}
            rows={3}
            value={props.presentation.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </SettingsFormGridItem>
      </SettingsFormGrid>
      <SettingsControlGroup>
        <SettingsSwitchField
          checked={props.dimension.enabled}
          disabled={props.readOnly}
          onCheckedChange={(enabled) => patch({ enabled })}
          label={props.localize('Enable this dimension', '启用此维度')}
          description={props.localize(
            'Disabled dimensions are unavailable for new rubric assignments.',
            '禁用后，新的场景评分规则不能再选择此维度。'
          )}
        />
      </SettingsControlGroup>
    </SettingsForm>
  )
}

type NoConfigurationProps = {
  localize: Localize
  title: string
  titleZh: string
  description: string
  descriptionZh: string
}

function NoConfiguration(props: NoConfigurationProps) {
  return (
    <Empty className='rounded-lg border py-10'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>{props.localize(props.title, props.titleZh)}</EmptyTitle>
        <EmptyDescription>
          {props.localize(props.description, props.descriptionZh)}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

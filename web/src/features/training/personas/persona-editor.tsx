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
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Archive,
  ArrowLeft,
  CircleAlert,
  History,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { TrainingHostProvider, useTrainingHost } from '../host'
import { trainingPrepWorkspaceHandoff } from '../prep/handoff'
import {
  archivePersona,
  buildPersona,
  getPersona,
  getPersonaV2,
  patchPersonaV2,
  personaRequestErrorMessage,
  startPersonaTraining,
  updatePersona,
} from './api'
import type {
  PersonaDetail,
  PersonaEvidence,
  PersonaHardRule,
  PersonaV2,
  PersonaV2Patch,
} from './types'

type Localize = (english: string, chinese: string) => string
type EditableVisibility = 'private' | 'team'

interface EditorBackup {
  readonly draft: PersonaV2
  readonly visibility: EditableVisibility
}

function emptyPersonaV2(detail: PersonaDetail): PersonaV2 {
  return {
    id: detail.id,
    name: detail.name,
    role: detail.role,
    avatar_color: detail.avatarColor,
    visibility: detail.visibility,
    version: detail.version,
    can_manage: detail.canManage,
    read_only: detail.readOnly,
    hard_rules: [],
    identity: null,
    expression: null,
    decision: null,
    interpersonal: null,
    user_context: detail.content || detail.profileSummary,
    evidence: [],
    rejected_features: {},
    source_materials: [],
    training_snapshot: {},
  }
}

function stringLines(value: readonly string[]): string {
  return value.join('\n')
}

function parseLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function draftPatch(draft: PersonaV2): PersonaV2Patch {
  return {
    name: draft.name.trim(),
    role: draft.role.trim(),
    avatar_color: draft.avatar_color,
    hard_rules: draft.hard_rules,
    identity: draft.identity,
    expression: draft.expression,
    decision: draft.decision,
    interpersonal: draft.interpersonal,
    user_context: draft.user_context,
    rejected_features: draft.rejected_features,
  }
}

function serializedDraft(
  draft: PersonaV2 | null,
  visibility: EditableVisibility
): string {
  return draft ? JSON.stringify({ patch: draftPatch(draft), visibility }) : ''
}

function changedSectionCount(previous: PersonaV2, next: PersonaV2): number {
  const keys: Array<keyof PersonaV2Patch> = [
    'name',
    'role',
    'avatar_color',
    'hard_rules',
    'identity',
    'expression',
    'decision',
    'interpersonal',
    'user_context',
    'rejected_features',
  ]
  return keys.filter(
    (key) =>
      JSON.stringify(draftPatch(previous)[key]) !==
      JSON.stringify(draftPatch(next)[key])
  ).length
}

function personaScopeLabel(
  detail: PersonaDetail | undefined,
  visibility: EditableVisibility,
  localize: Localize
): string {
  if (detail?.visibility === 'system') {
    return localize('System template', '系统模板')
  }
  if (visibility === 'team') {
    return localize('Team', '团队')
  }
  return localize('Private', '仅自己')
}

function TextListField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: readonly string[]
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  return (
    <div className='grid gap-2'>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        className='min-h-24 resize-y'
        value={stringLines(value)}
        disabled={disabled}
        onChange={(event) => onChange(parseLines(event.target.value))}
      />
    </div>
  )
}

function HardRulesEditor({
  rules,
  disabled,
  localize,
  onChange,
}: {
  rules: PersonaHardRule[]
  disabled: boolean
  localize: Localize
  onChange: (rules: PersonaHardRule[]) => void
}) {
  return (
    <div className='space-y-3'>
      {rules.map((rule, index) => (
        <div
          key={`hard-rule-${index + 1}`}
          className='grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_9rem_auto]'
        >
          <div className='grid gap-2'>
            <Label htmlFor={`hard-rule-${index}`}>
              {localize('Rule', '规则')} {index + 1}
            </Label>
            <Input
              id={`hard-rule-${index}`}
              value={rule.statement}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  rules.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, statement: event.target.value }
                      : item
                  )
                )
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor={`hard-rule-severity-${index}`}>
              {localize('Severity', '严重程度')}
            </Label>
            <Select
              value={rule.severity}
              disabled={disabled}
              onValueChange={(value) => {
                if (!value) return
                onChange(
                  rules.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, severity: value } : item
                  )
                )
              }}
            >
              <SelectTrigger
                id={`hard-rule-severity-${index}`}
                className='w-full'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='low'>{localize('Low', '低')}</SelectItem>
                <SelectItem value='medium'>
                  {localize('Medium', '中')}
                </SelectItem>
                <SelectItem value='high'>{localize('High', '高')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className='self-end'
            size='icon'
            variant='ghost'
            disabled={disabled}
            aria-label={localize('Remove rule', '移除规则')}
            onClick={() =>
              onChange(rules.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      {!disabled && (
        <Button
          size='sm'
          variant='outline'
          onClick={() =>
            onChange([...rules, { statement: '', severity: 'medium' }])
          }
        >
          <Plus />
          {localize('Add rule', '添加规则')}
        </Button>
      )}
    </div>
  )
}

function EvidenceList({
  draft,
  disabled,
  localize,
  onChange,
}: {
  draft: PersonaV2
  disabled: boolean
  localize: Localize
  onChange: (draft: PersonaV2) => void
}) {
  const layerIndexes = new Map<string, number>()
  if (draft.evidence.length === 0) {
    return (
      <Alert>
        <History />
        <AlertTitle>{localize('No evidence attached', '暂无证据')}</AlertTitle>
        <AlertDescription>
          {localize(
            'Evidence will appear after the persona is built or enhanced from source material.',
            '从素材构建或增强角色后，证据将显示在这里。'
          )}
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <div className='divide-y rounded-lg border'>
      {draft.evidence.map((evidence: PersonaEvidence) => {
        const layerIndex = layerIndexes.get(evidence.layer) ?? 0
        layerIndexes.set(evidence.layer, layerIndex + 1)
        const rejected =
          draft.rejected_features[evidence.layer]?.includes(layerIndex) ?? false
        return (
          <div
            key={`${evidence.layer}-${evidence.source_material_id}-${evidence.claim}`}
            className='space-y-2 p-3'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge
                    label={evidence.layer}
                    variant='info'
                    copyable={false}
                  />
                  <StatusBadge
                    label={`${Math.round(evidence.confidence * 100)}%`}
                    variant={evidence.confidence >= 0.7 ? 'success' : 'warning'}
                    copyable={false}
                  />
                  {rejected && (
                    <StatusBadge
                      label={localize('Rejected', '已排除')}
                      variant='danger'
                      copyable={false}
                    />
                  )}
                </div>
                <p className='mt-2 text-sm font-medium'>{evidence.claim}</p>
              </div>
              {!disabled && (
                <Button
                  size='xs'
                  variant='outline'
                  onClick={() => {
                    const current =
                      draft.rejected_features[evidence.layer] ?? []
                    const updated = rejected
                      ? current.filter((item) => item !== layerIndex)
                      : [...current, layerIndex].sort((a, b) => a - b)
                    onChange({
                      ...draft,
                      rejected_features: {
                        ...draft.rejected_features,
                        [evidence.layer]: updated,
                      },
                    })
                  }}
                >
                  {rejected
                    ? localize('Restore', '恢复')
                    : localize('Reject', '排除')}
                </Button>
              )}
            </div>
            <p className='text-muted-foreground text-xs'>
              {evidence.citations.join(' · ') || evidence.source_material_id}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function PersonaEditorContent({ personaId }: { personaId: string }) {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<PersonaV2 | null>(null)
  const [visibility, setVisibility] = useState<EditableVisibility>('private')
  const [savedState, setSavedState] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [enhancementMaterial, setEnhancementMaterial] = useState('')
  const [enhancementStage, setEnhancementStage] = useState('')
  const [enhancementBackup, setEnhancementBackup] =
    useState<EditorBackup | null>(null)
  const [enhancementChanges, setEnhancementChanges] = useState(0)
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const detailQuery = useQuery({
    queryKey: ['training', 'personas', personaId, 'detail'],
    queryFn: () => getPersona(personaId),
    enabled: host.authStatus === 'authenticated' && Boolean(personaId),
  })
  const isAsset = detailQuery.data?.source === 'persona_asset'
  const v2Query = useQuery({
    queryKey: ['training', 'personas', personaId, 'v2'],
    queryFn: () => getPersonaV2(personaId),
    enabled: host.authStatus === 'authenticated' && isAsset,
  })

  useEffect(() => {
    const detail = detailQuery.data
    if (!detail || draft) return
    if (detail.source === 'persona_asset' && !v2Query.data) return
    const loaded = v2Query.data ?? emptyPersonaV2(detail)
    const loadedVisibility: EditableVisibility =
      detail.visibility === 'team' ? 'team' : 'private'
    setDraft(loaded)
    setVisibility(loadedVisibility)
    setSavedState(serializedDraft(loaded, loadedVisibility))
  }, [detailQuery.data, draft, v2Query.data])

  const dirty = serializedDraft(draft, visibility) !== savedState
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  const saveMutation = useMutation({
    mutationFn: async (current: PersonaV2) => {
      if (!current.name.trim() || !current.role.trim()) {
        throw new Error(
          localize('Name and role are required', '名称和角色必填')
        )
      }
      await updatePersona(personaId, {
        name: current.name.trim(),
        role: current.role.trim(),
        avatar_color: current.avatar_color || '#888888',
        content: current.user_context ?? '',
        visibility,
      })
      return patchPersonaV2(personaId, draftPatch(current))
    },
    onSuccess: (saved) => {
      setDraft(saved)
      setSavedState(serializedDraft(saved, visibility))
      queryClient.setQueryData(['training', 'personas', personaId, 'v2'], saved)
      void queryClient.invalidateQueries({ queryKey: ['training', 'personas'] })
      toast.success(localize('Persona saved', '角色已保存'))
    },
    onError: (error) => toast.error(personaRequestErrorMessage(error)),
  })
  const archiveMutation = useMutation({
    mutationFn: () => archivePersona(personaId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['training', 'personas'],
      })
      toast.success(localize('Persona archived', '角色已归档'))
      void navigate({ to: '/training/personas' })
    },
    onError: (error) => toast.error(personaRequestErrorMessage(error)),
  })
  const startMutation = useMutation({
    mutationFn: () => startPersonaTraining(personaId),
    onSuccess: (result) => {
      const handoff = trainingPrepWorkspaceHandoff(result)
      if (!handoff) {
        toast.error(
          localize(
            'Training started without a conversation workspace binding',
            '训练已启动，但未返回对话工作区绑定'
          )
        )
        return
      }
      void navigate({ to: handoff.to, search: handoff.search })
    },
    onError: (error) => toast.error(personaRequestErrorMessage(error)),
  })
  const enhanceMutation = useMutation({
    mutationFn: async () => {
      if (!draft || !enhancementMaterial.trim()) {
        throw new Error(localize('Add enhancement material', '请添加增强素材'))
      }
      const backup: EditorBackup = {
        draft: structuredClone(draft),
        visibility,
      }
      await buildPersona(
        {
          materials: [enhancementMaterial],
          targetPersonaId: personaId,
        },
        {
          onEvent: (event) => setEnhancementStage(event.type),
        }
      )
      const updated = await getPersonaV2(personaId)
      return { backup, updated }
    },
    onSuccess: ({ backup, updated }) => {
      setEnhancementBackup(backup)
      setEnhancementChanges(changedSectionCount(backup.draft, updated))
      setDraft(updated)
      setSavedState(serializedDraft(updated, visibility))
      setEnhancementMaterial('')
      setEnhancementStage('')
      queryClient.setQueryData(
        ['training', 'personas', personaId, 'v2'],
        updated
      )
      void queryClient.invalidateQueries({ queryKey: ['training', 'personas'] })
      toast.success(localize('Persona enhanced', '角色已增强'))
    },
    onError: (error) => toast.error(personaRequestErrorMessage(error)),
  })
  const restoreMutation = useMutation({
    mutationFn: async (backup: EditorBackup) => {
      await updatePersona(personaId, {
        name: backup.draft.name,
        role: backup.draft.role,
        avatar_color: backup.draft.avatar_color || '#888888',
        content: backup.draft.user_context ?? '',
        visibility: backup.visibility,
      })
      return patchPersonaV2(personaId, draftPatch(backup.draft))
    },
    onSuccess: (restored) => {
      const restoredVisibility = enhancementBackup?.visibility ?? visibility
      setDraft(restored)
      setVisibility(restoredVisibility)
      setSavedState(serializedDraft(restored, restoredVisibility))
      setEnhancementBackup(null)
      setEnhancementChanges(0)
      queryClient.setQueryData(
        ['training', 'personas', personaId, 'v2'],
        restored
      )
      void queryClient.invalidateQueries({ queryKey: ['training', 'personas'] })
      toast.success(localize('Previous profile restored', '已恢复增强前画像'))
    },
    onError: (error) => toast.error(personaRequestErrorMessage(error)),
  })

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
  if (detailQuery.isError || v2Query.isError) {
    const error = detailQuery.error || v2Query.error
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Failed to load persona', '角色加载失败')}
        </AlertTitle>
        <AlertDescription>{personaRequestErrorMessage(error)}</AlertDescription>
        <div className='col-start-2 mt-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              void detailQuery.refetch()
              if (isAsset) void v2Query.refetch()
            }}
          >
            <RefreshCw />
            {localize('Retry', '重试')}
          </Button>
        </div>
      </Alert>
    )
  }
  if (!draft || detailQuery.isPending || (isAsset && v2Query.isPending)) {
    return (
      <div className='mx-auto max-w-5xl space-y-4'>
        <Skeleton className='h-16 w-full' />
        <Skeleton className='h-8 w-3/4' />
        <Skeleton className='h-72 w-full' />
      </div>
    )
  }

  const detail = detailQuery.data
  const readOnly = detail?.readOnly || draft.read_only
  const identity = draft.identity ?? {
    background: '',
    core_values: [],
    hidden_agenda: null,
    information_preference: null,
  }
  const expression = draft.expression ?? {
    tone: '',
    catchphrases: [],
    interruption_tendency: 'medium',
  }
  const decision = draft.decision ?? {
    style: '',
    risk_tolerance: 'medium',
    typical_questions: [],
  }
  const interpersonal = draft.interpersonal ?? {
    authority_mode: '',
    triggers: [],
    emotion_states: [],
    escalation_chains: [],
  }

  return (
    <div className='mx-auto w-full max-w-5xl space-y-5'>
      <div className='flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='flex min-w-0 items-start gap-3'>
          <span
            className='mt-0.5 size-10 shrink-0 rounded-lg border'
            style={{ backgroundColor: draft.avatar_color || '#888888' }}
            aria-hidden='true'
          />
          <div className='min-w-0'>
            <h2 className='truncate text-lg font-semibold'>{draft.name}</h2>
            <p className='text-muted-foreground mt-0.5 truncate text-sm'>
              {draft.role}
            </p>
            <div className='mt-2 flex flex-wrap gap-1.5'>
              <StatusBadge
                label={personaScopeLabel(detail, visibility, localize)}
                variant='info'
                copyable={false}
              />
              <StatusBadge
                label={
                  readOnly
                    ? localize('Read only', '只读')
                    : localize('Editable', '可编辑')
                }
                variant={readOnly ? 'neutral' : 'success'}
                copyable={false}
              />
              {dirty && !readOnly && (
                <StatusBadge
                  label={localize('Unsaved', '未保存')}
                  variant='warning'
                  copyable={false}
                />
              )}
            </div>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            variant='outline'
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate()}
          >
            {startMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Play />
            )}
            {localize('Start training', '开始训练')}
          </Button>
          {!readOnly && (
            <>
              <Button
                disabled={!dirty || saveMutation.isPending}
                onClick={() => saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Save />
                )}
                {localize('Save', '保存')}
              </Button>
              <Button
                size='icon'
                variant='destructive'
                aria-label={localize('Archive persona', '归档角色')}
                onClick={() => setArchiveOpen(true)}
              >
                <Archive />
              </Button>
            </>
          )}
        </div>
      </div>

      {readOnly && (
        <Alert>
          <CircleAlert />
          <AlertTitle>{localize('Read-only persona', '只读角色')}</AlertTitle>
          <AlertDescription>
            {detail?.source === 'system_template'
              ? localize(
                  'System templates can be viewed and used for training, but cannot be changed.',
                  '系统模板可查看并用于训练，但不能修改。'
                )
              : localize(
                  'You can use this shared persona for training, but only its owner or a team manager can change it.',
                  '你可以使用该共享角色进行训练，但只有所有者或团队管理者可修改。'
                )}
          </AlertDescription>
        </Alert>
      )}

      {enhancementBackup && (
        <Alert>
          <Sparkles />
          <AlertTitle>
            {localize(
              `${enhancementChanges} profile sections changed`,
              `${enhancementChanges} 个画像区域已变更`
            )}
          </AlertTitle>
          <AlertDescription>
            {localize(
              'The pre-enhancement profile is available for rollback.',
              '增强前画像可随时回滚。'
            )}
          </AlertDescription>
          <div className='col-start-2 mt-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={restoreMutation.isPending}
              onClick={() => restoreMutation.mutate(enhancementBackup)}
            >
              {restoreMutation.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <RotateCcw />
              )}
              {localize('Restore previous profile', '恢复增强前画像')}
            </Button>
          </div>
        </Alert>
      )}

      <Tabs defaultValue='basic' className='gap-4'>
        <div className='overflow-x-auto pb-1'>
          <TabsList variant='line'>
            <TabsTrigger value='basic'>{localize('Basic', '基础')}</TabsTrigger>
            <TabsTrigger value='rules'>{localize('Rules', '规则')}</TabsTrigger>
            <TabsTrigger value='identity'>
              {localize('Identity', '身份')}
            </TabsTrigger>
            <TabsTrigger value='expression'>
              {localize('Expression', '表达')}
            </TabsTrigger>
            <TabsTrigger value='decision'>
              {localize('Decision', '决策')}
            </TabsTrigger>
            <TabsTrigger value='interpersonal'>
              {localize('Interpersonal', '人际')}
            </TabsTrigger>
            <TabsTrigger value='evidence'>
              {localize('Evidence', '证据')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value='basic' className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='editor-name'>{localize('Name', '名称')}</Label>
              <Input
                id='editor-name'
                value={draft.name}
                maxLength={100}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='editor-role'>
                {localize('Role', '职位或身份')}
              </Label>
              <Input
                id='editor-role'
                value={draft.role}
                maxLength={200}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({ ...draft, role: event.target.value })
                }
              />
            </div>
            {detail?.visibility !== 'system' && (
              <div className='grid gap-2'>
                <Label htmlFor='editor-visibility'>
                  {localize('Visibility', '可见范围')}
                </Label>
                <Select
                  value={visibility}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    if (value === 'private' || value === 'team') {
                      setVisibility(value)
                    }
                  }}
                >
                  <SelectTrigger id='editor-visibility' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='private'>
                      {localize('Private', '仅自己')}
                    </SelectItem>
                    <SelectItem value='team'>
                      {localize('Team', '团队')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className='grid gap-2'>
              <Label htmlFor='editor-color'>
                {localize('Color', '标识颜色')}
              </Label>
              <div className='flex items-center gap-2'>
                <Input
                  type='color'
                  className='size-8 shrink-0 cursor-pointer p-1'
                  value={draft.avatar_color || '#888888'}
                  disabled={readOnly}
                  aria-label={localize('Choose persona color', '选择角色颜色')}
                  onChange={(event) =>
                    setDraft({ ...draft, avatar_color: event.target.value })
                  }
                />
                <Input
                  id='editor-color'
                  value={draft.avatar_color || ''}
                  maxLength={7}
                  disabled={readOnly}
                  onChange={(event) =>
                    setDraft({ ...draft, avatar_color: event.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='editor-context'>
              {localize('Training context', '训练背景')}
            </Label>
            <Textarea
              id='editor-context'
              className='min-h-52 resize-y'
              value={draft.user_context || ''}
              disabled={readOnly}
              onChange={(event) =>
                setDraft({ ...draft, user_context: event.target.value })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value='rules'>
          <HardRulesEditor
            rules={draft.hard_rules}
            disabled={readOnly}
            localize={localize}
            onChange={(hard_rules) => setDraft({ ...draft, hard_rules })}
          />
        </TabsContent>

        <TabsContent value='identity' className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-2 sm:col-span-2'>
            <Label htmlFor='identity-background'>
              {localize('Background', '背景')}
            </Label>
            <Textarea
              id='identity-background'
              className='min-h-32 resize-y'
              value={identity.background}
              disabled={readOnly}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  identity: { ...identity, background: event.target.value },
                })
              }
            />
          </div>
          <TextListField
            id='identity-values'
            label={localize('Core values', '核心价值观')}
            value={identity.core_values}
            disabled={readOnly}
            onChange={(core_values) =>
              setDraft({ ...draft, identity: { ...identity, core_values } })
            }
          />
          <div className='grid gap-4'>
            <div className='grid gap-2'>
              <Label htmlFor='identity-agenda'>
                {localize('Hidden agenda', '隐性诉求')}
              </Label>
              <Input
                id='identity-agenda'
                value={identity.hidden_agenda || ''}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    identity: {
                      ...identity,
                      hidden_agenda: event.target.value,
                    },
                  })
                }
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='identity-information'>
                {localize('Information preference', '信息偏好')}
              </Label>
              <Input
                id='identity-information'
                value={identity.information_preference || ''}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    identity: {
                      ...identity,
                      information_preference: event.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value='expression' className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label htmlFor='expression-tone'>{localize('Tone', '语气')}</Label>
            <Input
              id='expression-tone'
              value={expression.tone}
              disabled={readOnly}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  expression: { ...expression, tone: event.target.value },
                })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='expression-interruption'>
              {localize('Interruption tendency', '打断倾向')}
            </Label>
            <Select
              value={expression.interruption_tendency}
              disabled={readOnly}
              onValueChange={(value) => {
                if (value) {
                  setDraft({
                    ...draft,
                    expression: { ...expression, interruption_tendency: value },
                  })
                }
              }}
            >
              <SelectTrigger id='expression-interruption' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='low'>{localize('Low', '低')}</SelectItem>
                <SelectItem value='medium'>
                  {localize('Medium', '中')}
                </SelectItem>
                <SelectItem value='high'>{localize('High', '高')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='sm:col-span-2'>
            <TextListField
              id='expression-catchphrases'
              label={localize('Catchphrases', '常用表达')}
              value={expression.catchphrases}
              disabled={readOnly}
              onChange={(catchphrases) =>
                setDraft({
                  ...draft,
                  expression: { ...expression, catchphrases },
                })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value='decision' className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label htmlFor='decision-style'>
              {localize('Decision style', '决策风格')}
            </Label>
            <Input
              id='decision-style'
              value={decision.style}
              disabled={readOnly}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  decision: { ...decision, style: event.target.value },
                })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='decision-risk'>
              {localize('Risk tolerance', '风险偏好')}
            </Label>
            <Select
              value={decision.risk_tolerance}
              disabled={readOnly}
              onValueChange={(value) => {
                if (value) {
                  setDraft({
                    ...draft,
                    decision: { ...decision, risk_tolerance: value },
                  })
                }
              }}
            >
              <SelectTrigger id='decision-risk' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='low'>{localize('Low', '低')}</SelectItem>
                <SelectItem value='medium'>
                  {localize('Medium', '中')}
                </SelectItem>
                <SelectItem value='high'>{localize('High', '高')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='sm:col-span-2'>
            <TextListField
              id='decision-questions'
              label={localize('Typical questions', '典型追问')}
              value={decision.typical_questions}
              disabled={readOnly}
              onChange={(typical_questions) =>
                setDraft({
                  ...draft,
                  decision: { ...decision, typical_questions },
                })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value='interpersonal' className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2 sm:col-span-2'>
              <Label htmlFor='interpersonal-authority'>
                {localize('Authority mode', '权威模式')}
              </Label>
              <Input
                id='interpersonal-authority'
                value={interpersonal.authority_mode}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    interpersonal: {
                      ...interpersonal,
                      authority_mode: event.target.value,
                    },
                  })
                }
              />
            </div>
            <TextListField
              id='interpersonal-triggers'
              label={localize('Triggers', '触发因素')}
              value={interpersonal.triggers}
              disabled={readOnly}
              onChange={(triggers) =>
                setDraft({
                  ...draft,
                  interpersonal: { ...interpersonal, triggers },
                })
              }
            />
            <TextListField
              id='interpersonal-emotions'
              label={localize('Emotion states', '情绪状态')}
              value={interpersonal.emotion_states}
              disabled={readOnly}
              onChange={(emotion_states) =>
                setDraft({
                  ...draft,
                  interpersonal: { ...interpersonal, emotion_states },
                })
              }
            />
          </div>
          <Separator />
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold'>
              {localize('Escalation chains', '升级链路')}
            </h3>
            {interpersonal.escalation_chains.map((chain, index) => (
              <div
                key={`escalation-${index + 1}`}
                className='grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]'
              >
                <div className='grid gap-2'>
                  <Label htmlFor={`escalation-trigger-${index}`}>
                    {localize('Trigger', '触发点')}
                  </Label>
                  <Input
                    id={`escalation-trigger-${index}`}
                    value={chain.trigger}
                    disabled={readOnly}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        interpersonal: {
                          ...interpersonal,
                          escalation_chains:
                            interpersonal.escalation_chains.map(
                              (item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, trigger: event.target.value }
                                  : item
                            ),
                        },
                      })
                    }
                  />
                </div>
                <TextListField
                  id={`escalation-steps-${index}`}
                  label={localize('Steps', '步骤')}
                  value={chain.steps}
                  disabled={readOnly}
                  onChange={(steps) =>
                    setDraft({
                      ...draft,
                      interpersonal: {
                        ...interpersonal,
                        escalation_chains: interpersonal.escalation_chains.map(
                          (item, itemIndex) =>
                            itemIndex === index ? { ...item, steps } : item
                        ),
                      },
                    })
                  }
                />
                {!readOnly && (
                  <Button
                    className='self-end'
                    size='icon'
                    variant='ghost'
                    aria-label={localize(
                      'Remove escalation chain',
                      '移除升级链路'
                    )}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        interpersonal: {
                          ...interpersonal,
                          escalation_chains:
                            interpersonal.escalation_chains.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                        },
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  setDraft({
                    ...draft,
                    interpersonal: {
                      ...interpersonal,
                      escalation_chains: [
                        ...interpersonal.escalation_chains,
                        { trigger: '', steps: [] },
                      ],
                    },
                  })
                }
              >
                <Plus />
                {localize('Add escalation chain', '添加升级链路')}
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value='evidence'>
          <EvidenceList
            draft={draft}
            disabled={readOnly}
            localize={localize}
            onChange={setDraft}
          />
        </TabsContent>
      </Tabs>

      {!readOnly && (
        <section className='space-y-3 border-t pt-5'>
          <div>
            <h2 className='text-base font-semibold'>
              {localize('Enhance from material', '从素材增强')}
            </h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {localize(
                'Merge new behavioral evidence into this persona. The previous profile remains available for rollback.',
                '将新的行为证据合并到该角色，并保留增强前画像以便回滚。'
              )}
            </p>
          </div>
          <Textarea
            className='min-h-32 resize-y'
            value={enhancementMaterial}
            disabled={enhanceMutation.isPending}
            onChange={(event) => setEnhancementMaterial(event.target.value)}
          />
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-muted-foreground text-xs'>
              {enhancementStage
                ? `${localize('Current stage', '当前阶段')}: ${enhancementStage}`
                : ''}
            </span>
            <Button
              variant='outline'
              disabled={
                !enhancementMaterial.trim() || enhanceMutation.isPending
              }
              onClick={() => enhanceMutation.mutate()}
            >
              {enhanceMutation.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Sparkles />
              )}
              {localize('Enhance persona', '增强角色')}
            </Button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={localize('Archive persona', '归档角色')}
        desc={localize(
          `Archive ${draft.name}? It will no longer be available for new training sessions.`,
          `确认归档 ${draft.name}？归档后将不再用于新的训练会话。`
        )}
        confirmText={localize('Archive', '归档')}
        destructive
        isLoading={archiveMutation.isPending}
        handleConfirm={() => archiveMutation.mutate()}
      />
    </div>
  )
}

export function PersonaEditorPage({ personaId }: { personaId: string }) {
  const { i18n, t } = useTranslation()
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {localize('Persona editor', '角色编辑器')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            size='sm'
            variant='outline'
            render={<Link to='/training/personas' />}
          >
            <ArrowLeft />
            {localize('Personas', '角色资产')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <PersonaEditorContent personaId={personaId} />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

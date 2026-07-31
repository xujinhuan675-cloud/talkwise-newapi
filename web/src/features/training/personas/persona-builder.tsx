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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Plus,
  ScanSearch,
  Sparkles,
  Trash2,
  UserRoundSearch,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  buildPersona,
  detectPersonaSpeakers,
  personaRequestErrorMessage,
} from './api'
import type {
  DetectedSpeaker,
  PersonaBuildEvent,
  PersonaBuildEventType,
} from './types'

type Localize = (english: string, chinese: string) => string

interface BuildTarget {
  readonly name?: string
  readonly role?: string
}

interface MaterialDraft {
  readonly id: string
  readonly content: string
}

interface BuildProgressItem {
  readonly key: string
  readonly name: string
  stage: PersonaBuildEventType | 'queued' | 'complete' | 'failed'
  message: string
  personaId?: string
}

function stagePercent(stage: BuildProgressItem['stage']): number {
  const values: Record<BuildProgressItem['stage'], number> = {
    queued: 0,
    workspace_ready: 12,
    agent_tool_use: 30,
    agent_message: 42,
    parse_done: 62,
    adversarialize_start: 72,
    adversarialize_done: 84,
    enhancement_start: 70,
    enhancement_merge: 88,
    persist_done: 96,
    heartbeat: 45,
    error: 100,
    complete: 100,
    failed: 100,
  }
  return values[stage]
}

function stageMessage(event: PersonaBuildEvent, localize: Localize): string {
  const serverMessage =
    typeof event.data.message === 'string' ? event.data.message.trim() : ''
  if (serverMessage) return serverMessage
  const labels: Record<PersonaBuildEventType, readonly [string, string]> = {
    workspace_ready: ['Workspace ready', '工作区已就绪'],
    agent_tool_use: ['Reading source material', '正在读取素材'],
    agent_message: ['Extracting behavioral evidence', '正在提取行为证据'],
    parse_done: ['Structured profile extracted', '结构化画像已提取'],
    adversarialize_start: ['Calibrating training pressure', '正在校准训练压力'],
    adversarialize_done: ['Training behavior calibrated', '训练行为已校准'],
    enhancement_start: ['Enhancement started', '已开始增强'],
    enhancement_merge: ['Evidence merged', '证据已合并'],
    persist_done: ['Saving persona', '正在保存角色'],
    heartbeat: ['Build in progress', '正在构建'],
    error: ['Build failed', '构建失败'],
  }
  return localize(...labels[event.type])
}

function BuildStageIcon({ stage }: { stage: BuildProgressItem['stage'] }) {
  if (stage === 'complete') {
    return <CheckCircle2 className='text-success size-4' />
  }
  if (stage === 'failed') {
    return <CircleAlert className='text-destructive size-4' />
  }
  return <LoaderCircle className='size-4 animate-spin' />
}

function BuildActionIcon({
  pending,
  hasSpeakers,
}: {
  pending: boolean
  hasSpeakers: boolean
}) {
  if (pending) {
    return <LoaderCircle className='animate-spin' />
  }
  if (hasSpeakers) {
    return <UserRoundSearch />
  }
  return <Sparkles />
}

function PersonaBuilderContent() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const nextMaterialId = useRef(2)
  const [materials, setMaterials] = useState<MaterialDraft[]>([
    { id: 'material-1', content: '' },
  ])
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [speakers, setSpeakers] = useState<DetectedSpeaker[]>([])
  const [selectedSpeakers, setSelectedSpeakers] = useState<Set<number>>(
    new Set()
  )
  const [progress, setProgress] = useState<BuildProgressItem[]>([])
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const cleanedMaterials = useMemo(
    () => materials.map((item) => item.content.trim()).filter(Boolean),
    [materials]
  )
  const totalCharacters = cleanedMaterials.reduce(
    (total, material) => total + material.length,
    0
  )
  const detectMutation = useMutation({
    mutationFn: detectPersonaSpeakers,
    onSuccess: (detected) => {
      setSpeakers(detected)
      setSelectedSpeakers(new Set(detected.map((_, index) => index)))
      if (detected.length === 0) {
        toast.info(
          localize('No distinct speakers detected', '未检测到明确的说话人')
        )
      }
    },
    onError: (error) =>
      toast.error(
        personaRequestErrorMessage(
          error,
          localize('Speaker detection failed', '说话人检测失败')
        )
      ),
  })
  const buildMutation = useMutation({
    mutationFn: async (targets: BuildTarget[]) => {
      const controller = new AbortController()
      abortRef.current = controller
      const initial = targets.map((target, index) => ({
        key: `${target.name || 'persona'}-${index}`,
        name: target.name || localize('Inferred persona', '自动识别角色'),
        stage: 'queued' as const,
        message: localize('Queued', '等待中'),
      }))
      setProgress(initial)
      const results: string[] = []
      for (const [index, target] of targets.entries()) {
        try {
          const personaId = await buildPersona(
            {
              materials: cleanedMaterials,
              name: target.name,
              role: target.role,
            },
            {
              signal: controller.signal,
              onEvent: (event) => {
                setProgress((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          stage: event.type,
                          message: stageMessage(event, localize),
                        }
                      : item
                  )
                )
              },
            }
          )
          results.push(personaId)
          setProgress((current) =>
            current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    stage: 'complete',
                    message: localize('Persona saved', '角色已保存'),
                    personaId,
                  }
                : item
            )
          )
        } catch (error) {
          setProgress((current) =>
            current.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    stage: 'failed',
                    message: personaRequestErrorMessage(error),
                  }
                : item
            )
          )
          throw error
        }
      }
      return results
    },
    onSuccess: async (ids) => {
      await queryClient.invalidateQueries({
        queryKey: ['training', 'personas'],
      })
      toast.success(
        localize(
          `${ids.length} persona${ids.length === 1 ? '' : 's'} built`,
          `已构建 ${ids.length} 个角色`
        )
      )
    },
    onError: (error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.info(localize('Build monitoring stopped', '已停止等待构建结果'))
        return
      }
      toast.error(
        personaRequestErrorMessage(
          error,
          localize('Persona build failed', '角色构建失败')
        )
      )
    },
    onSettled: () => {
      abortRef.current = null
    },
  })

  const startBuild = () => {
    if (cleanedMaterials.length === 0) {
      toast.error(
        localize('Add at least one source material', '请至少添加一份素材')
      )
      return
    }
    if (totalCharacters > 400_000) {
      toast.error(
        localize(
          'Source material exceeds 400,000 characters',
          '素材超过 400,000 字符限制'
        )
      )
      return
    }
    if (speakers.length > 0 && selectedSpeakers.size === 0) {
      toast.error(
        localize('Select at least one speaker', '请至少选择一位说话人')
      )
      return
    }
    const selected = [...selectedSpeakers]
      .sort((a, b) => a - b)
      .map((index) => speakers[index])
      .filter(Boolean)
      .map((speaker) => ({ name: speaker.name, role: speaker.role }))
    const targets = selected.length > 0 ? selected : [{ name, role }]
    buildMutation.mutate(targets)
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
    <div className='mx-auto w-full max-w-5xl space-y-6'>
      <section className='space-y-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h2 className='text-base font-semibold'>
              {localize('Source material', '素材')}
            </h2>
            <p className='text-muted-foreground mt-1 text-sm'>
              {localize(
                'Add meeting notes, transcripts, or observed behavior.',
                '添加会议记录、对话转写或行为观察。'
              )}
            </p>
          </div>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {totalCharacters.toLocaleString()} / 400,000
          </span>
        </div>
        <div className='space-y-3'>
          {materials.map((material, index) => (
            <div key={material.id} className='flex items-start gap-2'>
              <div className='min-w-0 flex-1 space-y-1.5'>
                <Label htmlFor={`persona-material-${index}`}>
                  {localize('Material', '素材')} {index + 1}
                </Label>
                <Textarea
                  id={`persona-material-${index}`}
                  className='min-h-32 resize-y'
                  value={material.content}
                  disabled={buildMutation.isPending}
                  onChange={(event) =>
                    setMaterials((current) =>
                      current.map((item) =>
                        item.id === material.id
                          ? { ...item, content: event.target.value }
                          : item
                      )
                    )
                  }
                />
              </div>
              {materials.length > 1 && (
                <Button
                  className='mt-7'
                  size='icon-sm'
                  variant='ghost'
                  disabled={buildMutation.isPending}
                  aria-label={localize('Remove material', '移除素材')}
                  onClick={() =>
                    setMaterials((current) =>
                      current.filter((item) => item.id !== material.id)
                    )
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={materials.length >= 5 || buildMutation.isPending}
            onClick={() => {
              const id = `material-${nextMaterialId.current}`
              nextMaterialId.current += 1
              setMaterials((current) => [...current, { id, content: '' }])
            }}
          >
            <Plus />
            {localize('Add material', '添加素材')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={
              cleanedMaterials.length === 0 ||
              totalCharacters > 400_000 ||
              detectMutation.isPending ||
              buildMutation.isPending
            }
            onClick={() => detectMutation.mutate(cleanedMaterials)}
          >
            {detectMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <ScanSearch />
            )}
            {localize('Detect speakers', '检测说话人')}
          </Button>
        </div>
      </section>

      <Separator />

      <section className='space-y-4'>
        <h2 className='text-base font-semibold'>
          {speakers.length > 0
            ? localize('Detected speakers', '已检测的说话人')
            : localize('Persona identity', '角色身份')}
        </h2>
        {speakers.length > 0 ? (
          <div className='grid gap-2 sm:grid-cols-2'>
            {speakers.map((speaker, index) => {
              const checked = selectedSpeakers.has(index)
              return (
                <label
                  key={`${speaker.name}-${speaker.role}`}
                  className='hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3'
                >
                  <Checkbox
                    checked={checked}
                    disabled={buildMutation.isPending}
                    onCheckedChange={(next) =>
                      setSelectedSpeakers((current) => {
                        const updated = new Set(current)
                        if (next) updated.add(index)
                        else updated.delete(index)
                        return updated
                      })
                    }
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-sm font-medium'>
                      {speaker.name}
                    </span>
                    <span className='text-muted-foreground mt-0.5 block truncate text-xs'>
                      {speaker.role ||
                        localize('Role not detected', '未识别职位')}
                    </span>
                    {speaker.sampleQuote && (
                      <span className='text-muted-foreground mt-2 line-clamp-2 block text-xs'>
                        {speaker.sampleQuote}
                      </span>
                    )}
                  </span>
                  <StatusBadge
                    label={`${speaker.speakingTurns}`}
                    variant='neutral'
                    copyable={false}
                  />
                </label>
              )
            })}
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='grid gap-2'>
              <Label htmlFor='builder-name'>{localize('Name', '名称')}</Label>
              <Input
                id='builder-name'
                value={name}
                maxLength={100}
                disabled={buildMutation.isPending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='builder-role'>
                {localize('Role', '职位或身份')}
              </Label>
              <Input
                id='builder-role'
                value={role}
                maxLength={200}
                disabled={buildMutation.isPending}
                onChange={(event) => setRole(event.target.value)}
              />
            </div>
          </div>
        )}
      </section>

      {progress.length > 0 && (
        <>
          <Separator />
          <section className='space-y-3'>
            <h2 className='text-base font-semibold'>
              {localize('Build progress', '构建进度')}
            </h2>
            {progress.map((item) => (
              <div key={item.key} className='rounded-lg border p-3'>
                <Progress value={stagePercent(item.stage)}>
                  <ProgressLabel>
                    <span className='flex min-w-0 items-center gap-2'>
                      <BuildStageIcon stage={item.stage} />
                      <span className='truncate'>{item.name}</span>
                    </span>
                  </ProgressLabel>
                  <ProgressValue>
                    {() => <span>{stagePercent(item.stage)}%</span>}
                  </ProgressValue>
                </Progress>
                <div className='mt-2 flex items-center justify-between gap-3'>
                  <p className='text-muted-foreground min-w-0 truncate text-xs'>
                    {item.message}
                  </p>
                  {item.personaId && (
                    <Button
                      size='xs'
                      variant='outline'
                      render={
                        <Link
                          to='/training/personas/$personaId'
                          params={{ personaId: item.personaId }}
                        />
                      }
                    >
                      {localize('Open', '打开')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        {buildMutation.isPending && (
          <Button variant='outline' onClick={() => abortRef.current?.abort()}>
            <X />
            {localize('Stop waiting', '停止等待')}
          </Button>
        )}
        <Button
          disabled={
            host.authStatus !== 'authenticated' ||
            cleanedMaterials.length === 0 ||
            totalCharacters > 400_000 ||
            (speakers.length > 0 && selectedSpeakers.size === 0) ||
            buildMutation.isPending
          }
          onClick={startBuild}
        >
          <BuildActionIcon
            pending={buildMutation.isPending}
            hasSpeakers={speakers.length > 0}
          />
          {speakers.length > 0
            ? localize(
                `Build ${selectedSpeakers.size} selected`,
                `构建已选 ${selectedSpeakers.size} 人`
              )
            : localize('Build persona', '构建角色')}
        </Button>
      </div>
    </div>
  )
}

export function PersonaBuilderPage() {
  const { i18n, t } = useTranslation()
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {localize('Persona builder', '角色构建器')}
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
          <PersonaBuilderContent />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

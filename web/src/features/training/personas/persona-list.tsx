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
import type { ColumnDef } from '@tanstack/react-table'
import {
  Archive,
  Bot,
  CircleAlert,
  Eye,
  FilePlus2,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  archivePersona,
  createPersona,
  listPersonas,
  personaRequestErrorMessage,
} from './api'
import type {
  CreatePersonaInput,
  PersonaSummary,
  PersonaVisibility,
} from './types'

type Localize = (english: string, chinese: string) => string

const DEFAULT_PERSONA: CreatePersonaInput = {
  id: '',
  name: '',
  role: '',
  avatar_color: '#0f766e',
  content: '',
  visibility: 'private',
}

function PersonaActions({
  persona,
  localize,
  onArchive,
}: {
  persona: PersonaSummary
  localize: Localize
  onArchive: (persona: PersonaSummary) => void
}) {
  const detailLabel = persona.canManage
    ? localize('Edit persona', '编辑角色')
    : localize('View persona', '查看角色')
  return (
    <div className='flex items-center justify-end gap-1'>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size='icon-sm'
              variant='ghost'
              render={
                <Link
                  to='/training/personas/$personaId'
                  params={{ personaId: persona.id }}
                />
              }
            />
          }
        >
          {persona.canManage ? <Pencil /> : <Eye />}
          <span className='sr-only'>{detailLabel}</span>
        </TooltipTrigger>
        <TooltipContent>{detailLabel}</TooltipContent>
      </Tooltip>
      {persona.canManage && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size='icon-sm'
                variant='ghost'
                onClick={() => onArchive(persona)}
              />
            }
          >
            <Archive />
            <span className='sr-only'>
              {localize('Archive persona', '归档角色')}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {localize('Archive persona', '归档角色')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function PersonaCreateDialog({
  open,
  onOpenChange,
  localize,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  localize: Localize
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CreatePersonaInput>(DEFAULT_PERSONA)
  const [validation, setValidation] = useState('')
  const createMutation = useMutation({
    mutationFn: createPersona,
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({
        queryKey: ['training', 'personas'],
      })
      toast.success(localize('Persona created', '角色已创建'))
      setForm(DEFAULT_PERSONA)
      setValidation('')
      onOpenChange(false)
      void navigate({
        to: '/training/personas/$personaId',
        params: { personaId: id },
      })
    },
    onError: (error) =>
      toast.error(
        personaRequestErrorMessage(
          error,
          localize('Failed to create persona', '创建角色失败')
        )
      ),
  })

  const submit = () => {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(form.id.trim())) {
      setValidation(
        localize(
          'ID must start with a letter and use only letters, numbers, hyphens, or underscores.',
          'ID 必须以字母开头，且只能包含字母、数字、连字符或下划线。'
        )
      )
      return
    }
    if (!form.name.trim() || !form.role.trim()) {
      setValidation(localize('Name and role are required.', '名称和角色必填。'))
      return
    }
    setValidation('')
    createMutation.mutate({
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      role: form.role.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{localize('Create persona', '创建角色')}</DialogTitle>
          <DialogDescription>
            {localize(
              'Create a concise training counterpart, then refine the five-layer profile in the editor.',
              '先创建简明的训练对手，再在编辑器中完善五层画像。'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 py-2 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label htmlFor='persona-id'>
              {localize('Persona ID', '角色 ID')}
            </Label>
            <Input
              id='persona-id'
              value={form.id}
              maxLength={50}
              autoComplete='off'
              onChange={(event) => setForm({ ...form, id: event.target.value })}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='persona-name'>{localize('Name', '名称')}</Label>
            <Input
              id='persona-name'
              value={form.name}
              maxLength={100}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </div>
          <div className='grid gap-2 sm:col-span-2'>
            <Label htmlFor='persona-role'>
              {localize('Role', '职位或身份')}
            </Label>
            <Input
              id='persona-role'
              value={form.role}
              maxLength={200}
              onChange={(event) =>
                setForm({ ...form, role: event.target.value })
              }
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='persona-visibility'>
              {localize('Visibility', '可见范围')}
            </Label>
            <Select
              value={form.visibility}
              onValueChange={(value) => {
                if (value === 'private' || value === 'team') {
                  setForm({ ...form, visibility: value })
                }
              }}
            >
              <SelectTrigger id='persona-visibility' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='private'>
                  {localize('Private', '仅自己')}
                </SelectItem>
                <SelectItem value='team'>{localize('Team', '团队')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='persona-color'>
              {localize('Color', '标识颜色')}
            </Label>
            <div className='flex items-center gap-2'>
              <Input
                id='persona-color-swatch'
                type='color'
                className='size-8 shrink-0 cursor-pointer p-1'
                value={form.avatar_color}
                aria-label={localize('Choose persona color', '选择角色颜色')}
                onChange={(event) =>
                  setForm({ ...form, avatar_color: event.target.value })
                }
              />
              <Input
                id='persona-color'
                value={form.avatar_color}
                maxLength={7}
                onChange={(event) =>
                  setForm({ ...form, avatar_color: event.target.value })
                }
              />
            </div>
          </div>
          <div className='grid gap-2 sm:col-span-2'>
            <Label htmlFor='persona-context'>
              {localize('Training context', '训练背景')}
            </Label>
            <Textarea
              id='persona-context'
              className='min-h-28 resize-y'
              value={form.content}
              onChange={(event) =>
                setForm({ ...form, content: event.target.value })
              }
            />
          </div>
          {validation && (
            <p className='text-destructive text-sm sm:col-span-2'>
              {validation}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant='outline' />}>
            {localize('Cancel', '取消')}
          </DialogClose>
          <Button onClick={submit} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Plus />
            )}
            {localize('Create', '创建')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PersonaListContent() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<PersonaSummary | null>(
    null
  )
  const localize: Localize = useCallback(
    (english, chinese) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const personasQuery = useQuery({
    queryKey: ['training', 'personas'],
    queryFn: listPersonas,
    enabled: host.authStatus === 'authenticated',
  })
  const archiveMutation = useMutation({
    mutationFn: archivePersona,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['training', 'personas'],
      })
      setArchiveTarget(null)
      toast.success(localize('Persona archived', '角色已归档'))
    },
    onError: (error) =>
      toast.error(
        personaRequestErrorMessage(
          error,
          localize('Failed to archive persona', '归档角色失败')
        )
      ),
  })
  const personas = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return personasQuery.data ?? []
    return (personasQuery.data ?? []).filter((persona) =>
      [persona.id, persona.name, persona.role].some((value) =>
        value.toLocaleLowerCase().includes(search)
      )
    )
  }, [personasQuery.data, query])
  const columns = useMemo<ColumnDef<PersonaSummary>[]>(
    () => [
      {
        id: 'persona',
        header: localize('Persona', '角色'),
        cell: ({ row }) => (
          <div className='flex min-w-0 items-center gap-2.5'>
            <span
              className='size-7 shrink-0 rounded-md border'
              style={{ backgroundColor: row.original.avatarColor || '#888888' }}
              aria-hidden='true'
            />
            <div className='min-w-0'>
              <Link
                to='/training/personas/$personaId'
                params={{ personaId: row.original.id }}
                className='hover:text-primary block truncate font-medium'
              >
                {row.original.name}
              </Link>
              <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                {row.original.role}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'scope',
        header: localize('Scope', '范围'),
        cell: ({ row }) => {
          const labels: Record<PersonaVisibility, string> = {
            private: localize('Private', '仅自己'),
            team: localize('Team', '团队'),
            system: localize('System', '系统模板'),
          }
          return (
            <StatusBadge
              label={labels[row.original.visibility]}
              variant={
                row.original.visibility === 'system' ? 'neutral' : 'info'
              }
              copyable={false}
            />
          )
        },
      },
      {
        id: 'profile',
        header: localize('Profile', '画像'),
        cell: ({ row }) => (
          <span className='text-muted-foreground text-sm'>
            {row.original.supportsV2
              ? localize('Five-layer', '五层画像')
              : localize('Basic', '基础画像')}
          </span>
        ),
      },
      {
        id: 'access',
        header: localize('Access', '权限'),
        cell: ({ row }) => (
          <StatusBadge
            label={
              row.original.canManage
                ? localize('Manage', '可管理')
                : localize('Read only', '只读')
            }
            variant={row.original.canManage ? 'success' : 'neutral'}
            copyable={false}
          />
        ),
      },
      {
        id: 'actions',
        header: () => (
          <span className='sr-only'>{localize('Actions', '操作')}</span>
        ),
        cell: ({ row }) => (
          <PersonaActions
            persona={row.original}
            localize={localize}
            onArchive={setArchiveTarget}
          />
        ),
      },
    ],
    [localize]
  )
  const { table } = useDataTable({
    data: personas,
    columns,
    getRowId: (persona) => persona.id,
    enableRowSelection: false,
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
  if (personasQuery.isError) {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Failed to load personas', '角色加载失败')}
        </AlertTitle>
        <AlertDescription>
          {personaRequestErrorMessage(personasQuery.error)}
        </AlertDescription>
        <div className='col-start-2 mt-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void personasQuery.refetch()}
          >
            <RefreshCw />
            {localize('Retry', '重试')}
          </Button>
        </div>
      </Alert>
    )
  }

  return (
    <>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={host.authStatus === 'loading' || personasQuery.isPending}
        isFetching={personasQuery.isFetching}
        fixedHeight={false}
        showPagination={false}
        toolbar={
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='relative w-full sm:max-w-xs'>
              <Search className='text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
              <Input
                value={query}
                className='pl-8'
                placeholder={localize('Search personas', '搜索角色')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                render={<Link to='/training/personas/new' />}
              >
                <Sparkles />
                {localize('Build from materials', '从素材构建')}
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                {localize('Create persona', '创建角色')}
              </Button>
            </div>
          </div>
        }
        emptyIcon={query ? <Search /> : <Bot />}
        emptyTitle={
          query
            ? localize('No matching personas', '没有匹配的角色')
            : localize('No personas yet', '暂无角色')
        }
        emptyDescription={
          query
            ? localize('Try a different search.', '请尝试其他搜索词。')
            : localize(
                'Create a persona manually or build one from source materials.',
                '可以手动创建角色，或从素材构建。'
              )
        }
        emptyAction={
          !query ? (
            <Button size='sm' onClick={() => setCreateOpen(true)}>
              <FilePlus2 />
              {localize('Create persona', '创建角色')}
            </Button>
          ) : undefined
        }
        tableClassName='min-w-180'
        getColumnClassName={(columnId) => {
          if (columnId === 'persona') return 'max-w-80 whitespace-normal'
          if (columnId === 'actions') return 'w-24 text-right'
          return undefined
        }}
      />
      <PersonaCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        localize={localize}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={localize('Archive persona', '归档角色')}
        desc={localize(
          `Archive ${archiveTarget?.name ?? ''}? It will no longer be available for new training sessions.`,
          `确认归档 ${archiveTarget?.name ?? ''}？归档后将不再用于新的训练会话。`
        )}
        confirmText={localize('Archive', '归档')}
        destructive
        isLoading={archiveMutation.isPending}
        handleConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget.id)
        }}
      />
    </>
  )
}

export function PersonaListPage() {
  const { i18n, t } = useTranslation()
  const title = t('Personas', {
    defaultValue: i18n.language.startsWith('zh') ? '角色资产' : 'Personas',
  })
  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>{title}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <PersonaListContent />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

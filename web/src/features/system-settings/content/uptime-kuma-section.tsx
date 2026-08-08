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
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Dialog } from '@/components/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

import { SettingsSwitchField } from '../components/settings-form-layout'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  resolveUptimeMonitorUrl,
  UPTIME_KUMA_MONITOR_TARGETS,
} from './uptime-kuma-monitor-targets'

type UptimeKumaGroup = {
  id: number
  categoryName: string
  url: string
  slug: string
}

type UptimeKumaSectionProps = {
  enabled: boolean
  data: string
}

const createUptimeKumaSchema = (t: (key: string) => string) =>
  z.object({
    categoryName: z
      .string()
      .min(1, { error: t('Category name is required') })
      .max(50, { error: t('Category name must be less than 50 characters') }),
    url: z.string().url({ error: t('Must be a valid URL') }),
    slug: z
      .string()
      .min(1, { error: t('Slug is required') })
      .max(100, { error: t('Slug must be less than 100 characters') })
      .regex(/^[a-zA-Z0-9_-]+$/, {
        error: t(
          'Slug can only contain letters, numbers, hyphens, and underscores'
        ),
      }),
  })

type UptimeKumaFormValues = z.infer<ReturnType<typeof createUptimeKumaSchema>>

const UPTIME_KUMA_FORM_ID = 'uptime-kuma-form'

export function UptimeKumaSection({ enabled, data }: UptimeKumaSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const uptimeKumaSchema = createUptimeKumaSchema(t)
  const [groups, setGroups] = useState<UptimeKumaGroup[]>([])
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingGroup, setEditingGroup] = useState<UptimeKumaGroup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<'single' | 'batch'>('single')

  const form = useForm<UptimeKumaFormValues>({
    resolver: zodResolver(uptimeKumaSchema),
    defaultValues: {
      categoryName: '',
      url: '',
      slug: '',
    },
  })

  useEffect(() => {
    try {
      const parsed = JSON.parse(data || '[]')
      if (Array.isArray(parsed)) {
        setGroups(
          parsed.map((item, idx) => ({
            ...item,
            id: item.id || idx + 1,
          }))
        )
      }
    } catch {
      setGroups([])
    }
  }, [data])

  useEffect(() => {
    setIsEnabled(enabled)
  }, [enabled])

  const handleToggleEnabled = async (checked: boolean) => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.uptime_kuma_enabled',
        value: checked,
      })
      setIsEnabled(checked)
      toast.success(t('Setting saved'))
    } catch {
      toast.error(t('Failed to update setting'))
    }
  }

  const handleAdd = () => {
    setEditingGroup(null)
    form.reset({
      categoryName: '',
      url: '',
      slug: '',
    })
    setShowDialog(true)
  }

  const handleEdit = (group: UptimeKumaGroup) => {
    setEditingGroup(group)
    form.reset({
      categoryName: group.categoryName,
      url: group.url,
      slug: group.slug,
    })
    setShowDialog(true)
  }

  const handleDelete = (group: UptimeKumaGroup) => {
    setEditingGroup(group)
    setDeleteTarget('single')
    setShowDeleteDialog(true)
  }

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error(t('Please select items to delete'))
      return
    }
    setDeleteTarget('batch')
    setShowDeleteDialog(true)
  }

  const confirmDelete = () => {
    if (deleteTarget === 'single' && editingGroup) {
      setGroups((prev) => prev.filter((item) => item.id !== editingGroup.id))
      setHasChanges(true)
      toast.success(t('Group deleted. Click "Save Settings" to apply.'))
    } else if (deleteTarget === 'batch') {
      setGroups((prev) => prev.filter((item) => !selectedIds.includes(item.id)))
      setSelectedIds([])
      setHasChanges(true)
      toast.success(
        t('{{count}} groups deleted. Click "Save Settings" to apply.', {
          count: selectedIds.length,
        })
      )
    }
    setShowDeleteDialog(false)
    setEditingGroup(null)
  }

  const handleSubmitForm = (values: UptimeKumaFormValues) => {
    if (editingGroup) {
      setGroups((prev) =>
        prev.map((item) =>
          item.id === editingGroup.id ? { ...item, ...values } : item
        )
      )
      toast.success(t('Group updated. Click "Save Settings" to apply.'))
    } else {
      const newId = Math.max(...groups.map((item) => item.id), 0) + 1
      setGroups((prev) => [...prev, { id: newId, ...values }])
      toast.success(t('Group added. Click "Save Settings" to apply.'))
    }
    setHasChanges(true)
    setShowDialog(false)
  }

  const handleSaveAll = async () => {
    try {
      await updateOption.mutateAsync({
        key: 'console_setting.uptime_kuma_groups',
        value: JSON.stringify(groups),
      })
      setHasChanges(false)
      toast.success(t('Uptime Kuma groups saved successfully'))
    } catch {
      toast.error(t('Failed to save Uptime Kuma groups'))
    }
  }

  const handleCopyMonitorTarget = async (path: string) => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    const copied = await copyToClipboard(resolveUptimeMonitorUrl(origin, path))
    if (copied) {
      toast.success(t('Monitor target copied'))
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? groups.map((item) => item.id) : [])
  }

  const toggleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    )
  }

  return (
    <SettingsSection title={t('Uptime Kuma')}>
      <div className='space-y-4'>
        <div className='space-y-3'>
          <div>
            <h4 className='text-sm font-medium'>{t('Recommended monitors')}</h4>
            <p className='text-muted-foreground mt-1 text-sm leading-6'>
              {t(
                'After deploying Uptime Kuma, create HTTP(S) monitors for these same-origin targets, publish them on one status page, then add that page URL and slug below.'
              )}
            </p>
          </div>
          <div className='divide-border overflow-hidden rounded-lg border'>
            {UPTIME_KUMA_MONITOR_TARGETS.map((target) => {
              const origin =
                typeof window === 'undefined' ? '' : window.location.origin
              const monitorUrl = resolveUptimeMonitorUrl(origin, target.path)
              return (
                <div
                  key={target.id}
                  className='flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between'
                >
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-sm font-medium'>
                        {t(target.titleKey)}
                      </span>
                      <Badge variant='secondary'>HTTP 200</Badge>
                      {target.requiresHealthToken && (
                        <Badge variant='outline'>HEALTH__ACCESS_TOKEN</Badge>
                      )}
                    </div>
                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                      {t(target.descriptionKey)}
                    </p>
                    <code className='text-foreground mt-1 block text-xs break-all'>
                      {monitorUrl}
                    </code>
                  </div>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-sm'
                          aria-label={t('Copy monitor target')}
                          onClick={() =>
                            void handleCopyMonitorTarget(target.path)
                          }
                        />
                      }
                    >
                      <Copy />
                    </TooltipTrigger>
                    <TooltipContent>{t('Copy monitor target')}</TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </div>
          <p className='text-muted-foreground text-xs leading-5'>
            {t(
              'For backend and voice monitors, configure Authorization: Bearer <HEALTH__ACCESS_TOKEN> in Uptime Kuma. Use the same token configured on the TalkWise backend.'
            )}
          </p>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button onClick={handleAdd} size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              {t('Add Group')}
            </Button>
            <Button
              onClick={handleBatchDelete}
              size='sm'
              variant='destructive'
              disabled={selectedIds.length === 0}
            >
              <Trash2 className='mr-2 h-4 w-4' />
              {t('Delete (')}
              {selectedIds.length})
            </Button>
            <Button
              onClick={handleSaveAll}
              size='sm'
              variant='secondary'
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save className='mr-2 h-4 w-4' />
              {updateOption.isPending ? t('Saving...') : t('Save Settings')}
            </Button>
          </div>
          <SettingsSwitchField
            checked={isEnabled}
            onCheckedChange={handleToggleEnabled}
            label={t('Enabled')}
            className='py-0'
          />
        </div>

        <StaticDataTable
          data={groups}
          getRowKey={(group) => group.id}
          emptyContent={t(
            'No Uptime Kuma groups yet. Click "Add Group" to create one.'
          )}
          columns={[
            {
              id: 'select',
              header: (
                <Checkbox
                  checked={
                    selectedIds.length === groups.length && groups.length > 0
                  }
                  onCheckedChange={toggleSelectAll}
                />
              ),
              className: 'w-12',
              cell: (group) => (
                <Checkbox
                  checked={selectedIds.includes(group.id)}
                  onCheckedChange={(checked) =>
                    toggleSelectOne(group.id, checked as boolean)
                  }
                />
              ),
            },
            {
              id: 'category',
              header: t('Category Name'),
              cellClassName: 'font-medium',
              cell: (group) => group.categoryName,
            },
            {
              id: 'url',
              header: t('Uptime Kuma URL'),
              cellClassName: 'text-primary max-w-xs truncate font-mono text-sm',
              cell: (group) => group.url,
            },
            {
              id: 'slug',
              header: t('Status Page Slug'),
              cellClassName: 'text-muted-foreground font-mono text-sm',
              cell: (group) => group.slug,
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (group) => (
                <StaticRowActions
                  editLabel={t('Edit')}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  onEdit={() => handleEdit(group)}
                  onDelete={() => handleDelete(group)}
                />
              ),
            },
          ]}
        />
      </div>

      <Dialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title={
          editingGroup
            ? t('Edit Uptime Kuma Group')
            : t('Add Uptime Kuma Group')
        }
        description={t(
          'Configure monitoring status page groups for the dashboard'
        )}
        contentHeight='auto'
        bodyClassName='space-y-4'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDialog(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' form={UPTIME_KUMA_FORM_ID}>
              {editingGroup ? t('Update') : t('Add')}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id={UPTIME_KUMA_FORM_ID}
            onSubmit={form.handleSubmit(handleSubmitForm)}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='categoryName'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Category Name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('e.g., Core APIs, OpenAI, Claude')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Display name for this monitoring group (max 50 characters)'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Uptime Kuma URL')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('https://status.example.com')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('Base URL of your Uptime Kuma instance')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='slug'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Status Page Slug')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('my-status')} {...field} />
                  </FormControl>
                  <FormDescription>
                    {t('The slug is appended to the URL:')} {'{url}'}
                    {t('/status/')}
                    {'{slug}'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === 'single'
                ? t('This Uptime Kuma group will be removed from the list.')
                : t(
                    '{{count}} Uptime Kuma groups will be removed from the list.',
                    { count: selectedIds.length }
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={confirmDelete}>
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}

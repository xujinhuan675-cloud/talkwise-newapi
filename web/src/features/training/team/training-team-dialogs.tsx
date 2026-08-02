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
import { CircleAlert, LoaderCircle, Search, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  addTrainingTeamMember,
  createTrainingTeam,
  retryTrainingTeamQuery,
  searchTrainingTeamUsers,
  teamAnalyticsRequestErrorMessage,
} from './api'
import type { TrainingTeam, TrainingTeamRole } from './types'

type Localize = (english: string, chinese: string) => string

export function CreateTrainingTeamDialog(props: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onCreated: (team: TrainingTeam) => void
}) {
  const { i18n, t } = useTranslation()
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const mutation = useMutation({
    mutationFn: () => createTrainingTeam(name),
    onSuccess: (team) => {
      void queryClient.invalidateQueries({ queryKey: ['training', 'teams'] })
      props.onCreated(team)
      props.onOpenChange(false)
      setName('')
      toast.success(
        localize(
          'Training team created',
          '\u8bad\u7ec3\u56e2\u961f\u5df2\u521b\u5efa'
        )
      )
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim()) mutation.mutate()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <form className='contents' onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {localize(
                'Create training team',
                '\u521b\u5efa\u8bad\u7ec3\u56e2\u961f'
              )}
            </DialogTitle>
            <DialogDescription>
              {localize(
                'Training membership is independent from gateway groups and billing.',
                '\u8bad\u7ec3\u6210\u5458\u5173\u7cfb\u4e0e\u7f51\u5173\u5206\u7ec4\u548c\u8ba1\u8d39\u72ec\u7acb\u3002'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='training-team-name'>
              {localize('Team name', '\u56e2\u961f\u540d\u79f0')}
            </Label>
            <Input
              id='training-team-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoFocus
            />
          </div>
          {mutation.isError && (
            <Alert variant='destructive'>
              <CircleAlert />
              <AlertDescription>
                {teamAnalyticsRequestErrorMessage(
                  mutation.error,
                  localize(
                    'Unable to create the team.',
                    '\u65e0\u6cd5\u521b\u5efa\u56e2\u961f\u3002'
                  )
                )}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type='submit' disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending && <LoaderCircle className='animate-spin' />}
              {localize('Create team', '\u521b\u5efa\u56e2\u961f')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AddTrainingTeamMemberDialog(props: {
  readonly team: TrainingTeam | null
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const localize: Localize = (english, chinese) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [role, setRole] = useState<TrainingTeamRole>('member')
  const teamId = props.team?.id ?? ''
  const searchQuery = useQuery({
    queryKey: ['training', 'team-user-search', teamId, submittedKeyword],
    queryFn: () => searchTrainingTeamUsers(teamId, submittedKeyword),
    enabled: props.open && Boolean(teamId) && submittedKeyword.length >= 2,
    retry: retryTrainingTeamQuery,
  })
  const addMutation = useMutation({
    mutationFn: (userId: number) => addTrainingTeamMember(teamId, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['training', 'team-members', teamId],
      })
      void searchQuery.refetch()
      toast.success(
        localize(
          'Team member added',
          '\u56e2\u961f\u6210\u5458\u5df2\u6dfb\u52a0'
        )
      )
    },
  })
  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const normalized = keyword.trim()
    if (normalized.length < 2) return
    if (normalized === submittedKeyword) {
      void searchQuery.refetch()
    } else {
      setSubmittedKeyword(normalized)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {localize(
              'Add team member',
              '\u6dfb\u52a0\u56e2\u961f\u6210\u5458'
            )}
          </DialogTitle>
          <DialogDescription>
            {props.team?.name ||
              localize(
                'Select a team first',
                '\u8bf7\u5148\u9009\u62e9\u56e2\u961f'
              )}
          </DialogDescription>
        </DialogHeader>
        <form className='flex gap-2' onSubmit={submitSearch}>
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={localize(
              'Search username, display name, or email',
              '\u641c\u7d22\u7528\u6237\u540d\u3001\u663e\u793a\u540d\u6216\u90ae\u7bb1'
            )}
            aria-label={localize('Search users', '\u641c\u7d22\u7528\u6237')}
          />
          <Button
            type='submit'
            variant='outline'
            size='icon'
            disabled={keyword.trim().length < 2 || searchQuery.isFetching}
            aria-label={localize('Search users', '\u641c\u7d22\u7528\u6237')}
          >
            {searchQuery.isFetching ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Search />
            )}
          </Button>
        </form>
        <div className='flex items-center justify-between gap-3'>
          <Label>{localize('Training role', '\u8bad\u7ec3\u89d2\u8272')}</Label>
          <Select
            value={role}
            onValueChange={(value) => setRole(value as TrainingTeamRole)}
          >
            <SelectTrigger size='sm'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='member'>
                  {localize('Member', '\u6210\u5458')}
                </SelectItem>
                <SelectItem value='admin'>
                  {localize('Team admin', '\u56e2\u961f\u7ba1\u7406\u5458')}
                </SelectItem>
                <SelectItem value='owner'>
                  {localize('Owner', '\u8d1f\u8d23\u4eba')}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {(searchQuery.isError || addMutation.isError) && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertDescription>
              {teamAnalyticsRequestErrorMessage(
                addMutation.error || searchQuery.error,
                localize('Request failed.', '\u8bf7\u6c42\u5931\u8d25\u3002')
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className='max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1'>
          {!submittedKeyword && (
            <div className='text-muted-foreground p-6 text-center text-sm'>
              {localize(
                'Enter at least two characters to search enabled users.',
                '\u8f93\u5165\u81f3\u5c11\u4e24\u4e2a\u5b57\u7b26\u641c\u7d22\u53ef\u7528\u7528\u6237\u3002'
              )}
            </div>
          )}
          {submittedKeyword &&
            !searchQuery.isPending &&
            searchQuery.data?.items.length === 0 && (
              <div className='text-muted-foreground p-6 text-center text-sm'>
                {localize(
                  'No users found.',
                  '\u672a\u627e\u5230\u7528\u6237\u3002'
                )}
              </div>
            )}
          {searchQuery.data?.items.map((user) => {
            const inCurrentTeam = user.membershipTeamId === teamId
            const inAnotherTeam = Boolean(
              user.membershipTeamId && !inCurrentTeam
            )
            return (
              <div
                key={user.userId}
                className='hover:bg-muted/50 flex min-h-14 items-center justify-between gap-3 rounded-md px-2'
              >
                <div className='min-w-0'>
                  <div className='truncate text-sm font-medium'>
                    {user.displayName || user.username}
                  </div>
                  <div className='text-muted-foreground truncate text-xs'>
                    @{user.username}
                    {user.email ? ` · ${user.email}` : ''}
                  </div>
                  {inAnotherTeam && (
                    <Badge variant='outline' className='mt-1'>
                      {localize('Member of', '\u5df2\u52a0\u5165')}{' '}
                      {user.membershipTeamName}
                    </Badge>
                  )}
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    inCurrentTeam || inAnotherTeam || addMutation.isPending
                  }
                  onClick={() => addMutation.mutate(user.userId)}
                >
                  {addMutation.isPending &&
                  addMutation.variables === user.userId ? (
                    <LoaderCircle className='animate-spin' />
                  ) : (
                    <UserPlus />
                  )}
                  {inCurrentTeam
                    ? localize('Added', '\u5df2\u6dfb\u52a0')
                    : localize('Add', '\u6dfb\u52a0')}
                </Button>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

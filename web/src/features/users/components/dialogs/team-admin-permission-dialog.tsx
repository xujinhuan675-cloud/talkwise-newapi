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
import { CircleAlert, LoaderCircle, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  getUserTrainingTeamAssignment,
  listTrainingTeams,
  retryTrainingTeamQuery,
  teamAnalyticsRequestErrorMessage,
} from '@/features/training/team/api'

import type { User } from '../../types'

export function TeamAdminPermissionDialog(props: {
  readonly user: User
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const queryClient = useQueryClient()
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const assignmentQuery = useQuery({
    queryKey: ['training', 'user-team-assignment', props.user.id],
    queryFn: () => getUserTrainingTeamAssignment(props.user.id),
    enabled: props.open,
    retry: retryTrainingTeamQuery,
  })
  const teamsQuery = useQuery({
    queryKey: ['training', 'teams'],
    queryFn: listTrainingTeams,
    enabled: props.open,
    retry: retryTrainingTeamQuery,
  })
  const assignment = assignmentQuery.data
  const teams = teamsQuery.data?.items ?? []
  const selectedTeam = teams.find((team) => team.id === selectedTeamId)
  const effectiveTeamId =
    assignment?.teamId ?? selectedTeam?.id ?? teams[0]?.id ?? ''
  const isTeamOwner = assignment?.teamRole === 'owner'
  const isTeamAdmin = assignment?.teamRole === 'admin'
  const nextRole = isTeamAdmin ? 'member' : 'admin'
  const mutation = useMutation({
    mutationFn: () =>
      addTrainingTeamMember(effectiveTeamId, props.user.id, nextRole),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['training', 'user-team-assignment', props.user.id],
      })
      void queryClient.invalidateQueries({
        queryKey: ['training', 'team-members', effectiveTeamId],
      })
      toast.success(
        isTeamAdmin
          ? localize(
              'Team administrator access removed',
              '\u5df2\u53d6\u6d88\u56e2\u961f\u7ba1\u7406\u5458\u6743\u9650'
            )
          : localize(
              'User set as team administrator',
              '\u5df2\u8bbe\u4e3a\u56e2\u961f\u7ba1\u7406\u5458'
            )
      )
      props.onOpenChange(false)
    },
  })
  const queryError = assignmentQuery.error || teamsQuery.error
  const isLoading = assignmentQuery.isPending || teamsQuery.isPending

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {localize(
              'Team administrator permission',
              '\u56e2\u961f\u7ba1\u7406\u5458\u6743\u9650'
            )}
          </DialogTitle>
          <DialogDescription>
            {localize(
              `Manage the training-team permission for ${props.user.username}. This does not change the user's platform role.`,
              `\u7ba1\u7406 ${props.user.username} \u7684\u8bad\u7ec3\u56e2\u961f\u6743\u9650\uff0c\u4e0d\u4f1a\u6539\u53d8\u5176\u5e73\u53f0\u89d2\u8272\u3002`
            )}
          </DialogDescription>
        </DialogHeader>

        {queryError || mutation.isError ? (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertTitle>
              {localize(
                'Unable to update permission',
                '\u65e0\u6cd5\u66f4\u65b0\u6743\u9650'
              )}
            </AlertTitle>
            <AlertDescription>
              {teamAnalyticsRequestErrorMessage(
                mutation.error || queryError,
                localize('Request failed.', '\u8bf7\u6c42\u5931\u8d25\u3002')
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {isTeamOwner ? (
          <Alert>
            <UsersRound />
            <AlertTitle>
              {localize('Team owner', '\u56e2\u961f\u8d1f\u8d23\u4eba')}
            </AlertTitle>
            <AlertDescription>
              {localize(
                `${props.user.username} owns ${assignment?.teamName}. Team ownership must be changed from the training-team workspace.`,
                `${props.user.username} \u662f ${assignment?.teamName} \u7684\u56e2\u961f\u8d1f\u8d23\u4eba\uff0c\u56e2\u961f\u6240\u6709\u6743\u9700\u5728\u8bad\u7ec3\u56e2\u961f\u5de5\u4f5c\u53f0\u4e2d\u8c03\u6574\u3002`
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {!isLoading && !queryError && !teams.length ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>
              {localize(
                'No training teams available',
                '\u6682\u65e0\u53ef\u7528\u7684\u8bad\u7ec3\u56e2\u961f'
              )}
            </AlertTitle>
            <AlertDescription>
              {localize(
                'Create a training team before assigning team administrator access.',
                '\u8bf7\u5148\u521b\u5efa\u8bad\u7ec3\u56e2\u961f\uff0c\u518d\u5206\u914d\u56e2\u961f\u7ba1\u7406\u5458\u6743\u9650\u3002'
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className='space-y-2'>
          <label className='text-sm font-medium'>
            {localize('Training team', '\u8bad\u7ec3\u56e2\u961f')}
          </label>
          <Select
            value={effectiveTeamId || null}
            onValueChange={(value) => setSelectedTeamId(value ?? '')}
            disabled={isLoading || Boolean(assignment) || !teams.length}
          >
            <SelectTrigger className='w-full'>
              <SelectValue
                placeholder={localize(
                  'Select team',
                  '\u9009\u62e9\u56e2\u961f'
                )}
              >
                {assignment?.teamName ||
                  teams.find((team) => team.id === effectiveTeamId)?.name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {assignment ? (
            <p className='text-muted-foreground text-xs'>
              {localize(
                'An account can belong to one active training team. Change team membership from the training-team workspace.',
                '\u4e00\u4e2a\u8d26\u53f7\u53ea\u80fd\u5c5e\u4e8e\u4e00\u4e2a\u6709\u6548\u8bad\u7ec3\u56e2\u961f\uff0c\u5982\u9700\u6362\u7ec4\uff0c\u8bf7\u5728\u8bad\u7ec3\u56e2\u961f\u5de5\u4f5c\u53f0\u64cd\u4f5c\u3002'
              )}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {localize('Cancel', '\u53d6\u6d88')}
          </Button>
          <Button
            type='button'
            disabled={
              isLoading || isTeamOwner || !effectiveTeamId || mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : null}
            {isTeamAdmin
              ? localize(
                  'Change to team member',
                  '\u8bbe\u4e3a\u56e2\u961f\u6210\u5458'
                )
              : localize(
                  'Set as team administrator',
                  '\u8bbe\u4e3a\u56e2\u961f\u7ba1\u7406\u5458'
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
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
import { canManageAllTrainingTeams } from '@/lib/training-team-permissions'
import { useAuthStore } from '@/stores/auth-store'

import { TrainingHostProvider } from '../host'
import {
  isTrainingTeamQueryLoading,
  listTrainingTeamMembers,
  listTrainingTeams,
  removeTrainingTeamMember,
  retryTrainingTeamQuery,
  teamAnalyticsRequestErrorMessage,
} from './api'
import {
  AddTrainingTeamMemberDialog,
  CreateTrainingTeamDialog,
} from './training-team-dialogs'
import type { TrainingTeam, TrainingTeamMember } from './types'

function TrainingTeamMembersContent() {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const canManageAllTeams = canManageAllTrainingTeams(user)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [removeMember, setRemoveMember] = useState<TrainingTeamMember | null>(
    null
  )
  const teamsQuery = useQuery({
    queryKey: ['training', 'teams'],
    queryFn: listTrainingTeams,
    enabled: canManageAllTeams,
    retry: retryTrainingTeamQuery,
  })
  let effectiveTeamId = user?.team_id ?? ''
  let selectedTeam: TrainingTeam | null = effectiveTeamId
    ? {
        id: effectiveTeamId,
        name: user?.team_name || effectiveTeamId,
        createdTime: 0,
        updatedTime: 0,
      }
    : null
  if (canManageAllTeams) {
    const teams = teamsQuery.data?.items ?? []
    effectiveTeamId = teams.some((team) => team.id === selectedTeamId)
      ? selectedTeamId
      : (teams[0]?.id ?? '')
    selectedTeam = teams.find((team) => team.id === effectiveTeamId) ?? null
  }
  let visibleTeams = teamsQuery.data?.items ?? []
  if (!canManageAllTeams) {
    visibleTeams = selectedTeam ? [selectedTeam] : []
  }
  const membersQuery = useQuery({
    queryKey: ['training', 'team-members', effectiveTeamId],
    queryFn: () => listTrainingTeamMembers(effectiveTeamId),
    enabled: Boolean(effectiveTeamId),
    retry: retryTrainingTeamQuery,
  })
  const removeMutation = useMutation({
    mutationFn: (member: TrainingTeamMember) =>
      removeTrainingTeamMember(effectiveTeamId, member.userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['training', 'team-members', effectiveTeamId],
      })
      setRemoveMember(null)
      toast.success(
        localize(
          'Team member removed',
          '\u56e2\u961f\u6210\u5458\u5df2\u79fb\u9664'
        )
      )
    },
  })

  const pageError =
    (canManageAllTeams ? teamsQuery.error : null) || membersQuery.error

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {localize('Training teams', '\u8bad\u7ec3\u56e2\u961f')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          {canManageAllTeams && (
            <Button variant='outline' onClick={() => setCreateOpen(true)}>
              <Plus />
              {localize('Create team', '\u521b\u5efa\u56e2\u961f')}
            </Button>
          )}
          <Button
            onClick={() => setAddMemberOpen(true)}
            disabled={!selectedTeam}
          >
            <UserPlus />
            {localize('Add member', '\u6dfb\u52a0\u6210\u5458')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-3'>
            <Alert>
              <UsersRound />
              <AlertTitle>
                {localize(
                  'Independent training membership',
                  '\u72ec\u7acb\u7684\u8bad\u7ec3\u6210\u5458\u5173\u7cfb'
                )}
              </AlertTitle>
              <AlertDescription>
                {localize(
                  'Changes here never modify gateway groups, model access, quota, balance, or billing.',
                  '\u6b64\u5904\u53d8\u66f4\u4e0d\u4f1a\u4fee\u6539\u7f51\u5173\u5206\u7ec4\u3001\u6a21\u578b\u6743\u9650\u3001\u989d\u5ea6\u3001\u4f59\u989d\u6216\u8ba1\u8d39\u3002'
                )}
              </AlertDescription>
            </Alert>
            {Boolean(pageError) && (
              <Alert variant='destructive'>
                <CircleAlert />
                <AlertTitle>
                  {localize(
                    'Unable to load training teams',
                    '\u65e0\u6cd5\u52a0\u8f7d\u8bad\u7ec3\u56e2\u961f'
                  )}
                </AlertTitle>
                <AlertDescription className='flex flex-wrap items-center gap-3'>
                  <span>
                    {teamAnalyticsRequestErrorMessage(
                      pageError,
                      localize(
                        'Request failed.',
                        '\u8bf7\u6c42\u5931\u8d25\u3002'
                      )
                    )}
                  </span>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      void teamsQuery.refetch()
                      if (effectiveTeamId) void membersQuery.refetch()
                    }}
                  >
                    <RefreshCw />
                    {localize('Retry', '\u91cd\u8bd5')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{localize('Members', '\u6210\u5458')}</CardTitle>
                <CardDescription>
                  {selectedTeam
                    ? localize(
                        `${membersQuery.data?.total ?? 0} members in ${selectedTeam.name}`,
                        `${selectedTeam.name} \u5171 ${membersQuery.data?.total ?? 0} \u540d\u6210\u5458`
                      )
                    : localize(
                        'Create or select a training team',
                        '\u521b\u5efa\u6216\u9009\u62e9\u4e00\u4e2a\u8bad\u7ec3\u56e2\u961f'
                      )}
                </CardDescription>
                {canManageAllTeams ? (
                  <div className='mt-2'>
                    <Select
                      value={effectiveTeamId || null}
                      onValueChange={(value) => setSelectedTeamId(value ?? '')}
                      disabled={
                        teamsQuery.isPending || !teamsQuery.data?.items.length
                      }
                    >
                      <SelectTrigger className='w-full sm:w-72'>
                        <SelectValue
                          placeholder={localize(
                            'Select team',
                            '\u9009\u62e9\u56e2\u961f'
                          )}
                        >
                          {selectedTeam?.name}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {teamsQuery.data?.items.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent>
                <TrainingTeamMemberList
                  teamsPending={isTrainingTeamQueryLoading(
                    canManageAllTeams,
                    teamsQuery.isPending,
                    teamsQuery.isError
                  )}
                  teams={visibleTeams}
                  selectedTeam={selectedTeam}
                  membersPending={isTrainingTeamQueryLoading(
                    Boolean(effectiveTeamId),
                    membersQuery.isPending,
                    membersQuery.isError
                  )}
                  members={membersQuery.data?.items ?? []}
                  onCreate={() => setCreateOpen(true)}
                  onAdd={() => setAddMemberOpen(true)}
                  onRemove={(member) => {
                    removeMutation.reset()
                    setRemoveMember(member)
                  }}
                  canCreateTeams={canManageAllTeams}
                  localize={localize}
                />
              </CardContent>
            </Card>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {canManageAllTeams && (
        <CreateTrainingTeamDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(team) => setSelectedTeamId(team.id)}
        />
      )}
      <AddTrainingTeamMemberDialog
        team={selectedTeam}
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
      />
      <RemoveMemberDialog
        member={removeMember}
        isPending={removeMutation.isPending}
        error={removeMutation.error}
        onOpenChange={(open) => !open && setRemoveMember(null)}
        onConfirm={() => removeMember && removeMutation.mutate(removeMember)}
        localize={localize}
      />
    </>
  )
}

type Localize = (english: string, chinese: string) => string

function TrainingTeamMemberList(props: {
  readonly teamsPending: boolean
  readonly teams: readonly TrainingTeam[]
  readonly selectedTeam: TrainingTeam | null
  readonly membersPending: boolean
  readonly members: readonly TrainingTeamMember[]
  readonly onCreate: () => void
  readonly onAdd: () => void
  readonly onRemove: (member: TrainingTeamMember) => void
  readonly canCreateTeams: boolean
  readonly localize: Localize
}) {
  if (props.teamsPending || props.membersPending) {
    return (
      <div className='space-y-2'>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton
            key={`training-team-member-${index + 1}`}
            className='h-12 w-full'
          />
        ))}
      </div>
    )
  }
  if (!props.teams.length) {
    return (
      <MemberEmptyState
        title={props.localize(
          'No training teams',
          '\u6682\u65e0\u8bad\u7ec3\u56e2\u961f'
        )}
        description={props.localize(
          'Create a team before adding members.',
          '\u521b\u5efa\u56e2\u961f\u540e\u5373\u53ef\u6dfb\u52a0\u6210\u5458\u3002'
        )}
        actionLabel={props.localize('Create team', '\u521b\u5efa\u56e2\u961f')}
        onAction={props.onCreate}
        showAction={props.canCreateTeams}
      />
    )
  }
  if (props.selectedTeam && !props.members.length) {
    return (
      <MemberEmptyState
        title={props.localize(
          'No team members',
          '\u6682\u65e0\u56e2\u961f\u6210\u5458'
        )}
        description={props.localize(
          'Search enabled platform users and add them to this training team.',
          '\u641c\u7d22\u53ef\u7528\u5e73\u53f0\u7528\u6237\u5e76\u5c06\u5176\u52a0\u5165\u8be5\u8bad\u7ec3\u56e2\u961f\u3002'
        )}
        actionLabel={props.localize('Add member', '\u6dfb\u52a0\u6210\u5458')}
        onAction={props.onAdd}
      />
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{props.localize('User', '\u7528\u6237')}</TableHead>
          <TableHead>
            {props.localize('Training role', '\u8bad\u7ec3\u89d2\u8272')}
          </TableHead>
          <TableHead>
            {props.localize('Gateway group', '\u7f51\u5173\u5206\u7ec4')}
          </TableHead>
          <TableHead className='text-right'>
            {props.localize('Actions', '\u64cd\u4f5c')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.members.map((member) => (
          <TableRow key={member.userId}>
            <TableCell>
              <div className='font-medium'>
                {member.displayName || member.username}
              </div>
              <div className='text-muted-foreground text-xs'>
                @{member.username}
                {member.email ? ` · ${member.email}` : ''}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant='secondary'>
                {trainingTeamRoleLabel(member, props.localize)}
              </Badge>
            </TableCell>
            <TableCell>
              <span className='text-muted-foreground text-xs'>
                {member.gatewayGroup || '-'}
              </span>
            </TableCell>
            <TableCell className='text-right'>
              <Button
                size='icon-sm'
                variant='ghost'
                onClick={() => props.onRemove(member)}
                aria-label={props.localize(
                  'Remove member',
                  '\u79fb\u9664\u6210\u5458'
                )}
              >
                <Trash2 />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function trainingTeamRoleLabel(
  member: TrainingTeamMember,
  localize: Localize
): string {
  if (member.teamRole === 'owner') {
    return localize('Owner', '\u8d1f\u8d23\u4eba')
  }
  if (member.teamRole === 'admin') {
    return localize('Team admin', '\u56e2\u961f\u7ba1\u7406\u5458')
  }
  return localize('Member', '\u6210\u5458')
}

function MemberEmptyState(props: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
  showAction?: boolean
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <UsersRound />
        </EmptyMedia>
        <EmptyTitle>{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      {props.showAction !== false && (
        <Button onClick={props.onAction}>
          <Plus />
          {props.actionLabel}
        </Button>
      )}
    </Empty>
  )
}

function RemoveMemberDialog(props: {
  member: TrainingTeamMember | null
  isPending: boolean
  error: unknown
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  localize: Localize
}) {
  return (
    <AlertDialog open={Boolean(props.member)} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {props.localize(
              'Remove team member?',
              '\u79fb\u9664\u56e2\u961f\u6210\u5458\uff1f'
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {props.localize(
              'This only removes training membership. Gateway access and billing remain unchanged.',
              '\u4ec5\u79fb\u9664\u8bad\u7ec3\u6210\u5458\u5173\u7cfb\uff0c\u7f51\u5173\u6743\u9650\u548c\u8ba1\u8d39\u4fdd\u6301\u4e0d\u53d8\u3002'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {Boolean(props.error) && (
          <Alert variant='destructive'>
            <CircleAlert />
            <AlertDescription>
              {teamAnalyticsRequestErrorMessage(
                props.error,
                props.localize(
                  'Unable to remove the member.',
                  '\u65e0\u6cd5\u79fb\u9664\u6210\u5458\u3002'
                )
              )}
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.isPending}>
            {props.localize('Cancel', '\u53d6\u6d88')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            disabled={props.isPending || !props.member}
            onClick={props.onConfirm}
          >
            {props.isPending && <LoaderCircle className='animate-spin' />}
            {props.localize('Remove', '\u79fb\u9664')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function TrainingTeamMembersPage() {
  return (
    <TrainingHostProvider>
      <TrainingTeamMembersContent />
    </TrainingHostProvider>
  )
}

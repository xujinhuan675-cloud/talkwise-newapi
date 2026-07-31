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
import { CircleAlert, LoaderCircle, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  launchTextScenarioTrainingSession,
  listTrainingScenarios,
  trainingRequestErrorMessage,
} from '@/features/training/scenarios/api'
import type { TrainingScenario } from '@/features/training/scenarios/types'

type NewTrainingConversationDialogProps = {
  apiBase: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSessionCreated: (sessionId: string) => void
}

export function NewTrainingConversationDialog({
  apiBase,
  open,
  onOpenChange,
  onSessionCreated,
}: NewTrainingConversationDialogProps) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null
  )
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const scenariosQuery = useQuery({
    queryKey: ['training', 'scenarios', apiBase],
    queryFn: () => listTrainingScenarios(apiBase),
    enabled: open,
  })
  const scenarios = scenariosQuery.data ?? []
  const selectedScenario = useMemo(
    () =>
      scenarios.find((scenario) => scenario.id === selectedScenarioId) ??
      scenarios[0] ??
      null,
    [scenarios, selectedScenarioId]
  )
  const launchMutation = useMutation({
    mutationFn: (scenario: TrainingScenario) =>
      launchTextScenarioTrainingSession(apiBase, scenario),
    onSuccess: async (session) => {
      await queryClient.refetchQueries({
        queryKey: ['training', 'conversation-sessions', apiBase],
        type: 'active',
      })
      onSessionCreated(session.sessionId)
      onOpenChange(false)
    },
  })

  useEffect(() => {
    if (!open) return
    if (
      scenarios.length > 0 &&
      !scenarios.some((scenario) => scenario.id === selectedScenarioId)
    ) {
      setSelectedScenarioId(scenarios[0].id)
    }
  }, [open, scenarios, selectedScenarioId])

  const closeDialog = () => {
    if (launchMutation.isPending) return
    launchMutation.reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeDialog()
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {localize('New training conversation', '新建训练会话')}
          </DialogTitle>
          <DialogDescription>
            {localize(
              'Choose a scenario to start a text training conversation.',
              '选择训练场景后，立即开始一段文本训练会话。'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
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
            </Alert>
          )}

          {!scenariosQuery.isError && (
            <div className='space-y-2'>
              <Label>{localize('Training scenario', '训练场景')}</Label>
              <Select
                value={selectedScenario?.id ?? null}
                onValueChange={setSelectedScenarioId}
                disabled={scenariosQuery.isPending || launchMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={localize('Select a scenario', '选择训练场景')}
                  >
                    {selectedScenario?.title}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {scenarios.map((scenario) => (
                      <SelectItem key={scenario.id} value={scenario.id}>
                        {scenario.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          {scenariosQuery.isPending && (
            <div className='text-muted-foreground flex min-h-36 items-center justify-center gap-2 text-sm'>
              <LoaderCircle className='size-4 animate-spin' />
              {localize('Loading scenarios...', '正在加载训练场景...')}
            </div>
          )}

          {selectedScenario && !scenariosQuery.isPending && (
            <div className='bg-muted/30 space-y-3 rounded-lg border p-3'>
              <div className='space-y-1'>
                <div className='font-medium'>{selectedScenario.title}</div>
                <p className='text-muted-foreground text-xs leading-5'>
                  {selectedScenario.description}
                </p>
              </div>
              <div className='flex flex-wrap gap-1.5'>
                <Badge variant='secondary'>
                  {selectedScenario.persona.name}
                </Badge>
                <Badge variant='outline'>{selectedScenario.learnerRole}</Badge>
              </div>
              {selectedScenario.trainingPoints.length > 0 && (
                <div className='space-y-1.5'>
                  <div className='text-muted-foreground text-xs'>
                    {localize('Training focus', '训练重点')}
                  </div>
                  <div className='flex flex-wrap gap-1.5'>
                    {selectedScenario.trainingPoints.map((point) => (
                      <Badge key={point} variant='outline'>
                        {point}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {launchMutation.isError && (
            <Alert variant='destructive'>
              <CircleAlert />
              <AlertTitle>
                {localize('Session not started', '会话未启动')}
              </AlertTitle>
              <AlertDescription>
                {trainingRequestErrorMessage(
                  launchMutation.error,
                  localize('Request failed', '请求失败')
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={launchMutation.isPending}
            variant='outline'
            onClick={closeDialog}
          >
            {localize('Cancel', '取消')}
          </Button>
          <Button
            disabled={!selectedScenario || launchMutation.isPending}
            onClick={() =>
              selectedScenario && launchMutation.mutate(selectedScenario)
            }
          >
            {launchMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Play />
            )}
            {launchMutation.isPending
              ? localize('Starting...', '正在启动...')
              : localize('Start text training', '开始文本训练')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
import { SendIcon, SquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import { ModelGroupSelector } from '@/components/model-group-selector'

import { getInputControlState } from '../../lib'
import type { GroupOption, ModelOption } from '../../types'

type PlaygroundInputControlsProps = {
  actions?: ReactNode
  disabled?: boolean
  hideSubmitButton?: boolean
  hideModelSelector?: boolean
  primaryAction?: PlaygroundInputPrimaryAction
  groups: GroupOption[]
  groupValue: string
  isGenerating?: boolean
  isModelLoading?: boolean
  models: ModelOption[]
  modelValue: string
  onGroupChange: (value: string) => void
  onModelChange: (value: string) => void
  onStop?: () => void
  selectorPlacement?: 'end' | 'start'
  text: string
  tools: ReactNode
}

export interface PlaygroundInputPrimaryAction {
  active?: boolean
  disabled?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
  title?: string
  tone?: 'default' | 'destructive' | 'secondary'
}

export function PlaygroundInputControls({
  actions,
  disabled,
  hideSubmitButton = false,
  hideModelSelector = false,
  primaryAction,
  groups,
  groupValue,
  isGenerating,
  isModelLoading = false,
  models,
  modelValue,
  onGroupChange,
  onModelChange,
  onStop,
  selectorPlacement = 'end',
  text,
  tools,
}: PlaygroundInputControlsProps) {
  const { t } = useTranslation()
  const {
    canSubmit: defaultCanSubmit,
    isSelectorDisabled,
    shouldShowStop,
  } = getInputControlState({
    disabled,
    groups,
    hasStopHandler: Boolean(onStop),
    isGenerating,
    isModelLoading,
    models,
    text,
  })

  const canSubmit = hideModelSelector
    ? !disabled && Boolean(text.trim()) && !isGenerating
    : defaultCanSubmit

  const renderSelector = () => {
    if (hideModelSelector) return null
    return (
      <ModelGroupSelector
        selectedModel={modelValue}
        models={models}
        onModelChange={onModelChange}
        selectedGroup={groupValue}
        groups={groups}
        onGroupChange={onGroupChange}
        disabled={isSelectorDisabled}
      />
    )
  }

  const renderSubmitButton = () => {
    if (hideSubmitButton) return null
    if (primaryAction) {
      const tone = primaryAction.tone ?? 'default'
      return (
        <PromptInputButton
          aria-label={primaryAction.label}
          aria-pressed={primaryAction.active}
          className={
            tone === 'destructive'
              ? 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 min-w-24 border px-3 font-medium'
              : tone === 'secondary'
                ? 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 min-w-24 border px-3 font-medium'
                : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 min-w-24 border px-3 font-medium shadow-sm'
          }
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
          title={primaryAction.title}
          type='button'
          variant={tone}
        >
          {primaryAction.icon}
          <span className='truncate'>{primaryAction.label}</span>
        </PromptInputButton>
      )
    }
    if (shouldShowStop) {
      return (
        <PromptInputButton
          className='border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15 font-medium'
          onClick={onStop}
          variant='secondary'
        >
          <SquareIcon className='fill-current' size={16} />
          <span className='truncate'>{t('Stop')}</span>
        </PromptInputButton>
      )
    }
    return (
      <PromptInputButton
        className='border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:border-border disabled:bg-muted/70 disabled:text-foreground/50 h-8 border px-3 font-medium shadow-sm disabled:opacity-100'
        disabled={!canSubmit}
        type='submit'
        variant='default'
      >
        <SendIcon size={16} />
        <span className='truncate'>{t('Send')}</span>
      </PromptInputButton>
    )
  }

  if (selectorPlacement === 'start') {
    return (
      <div className='flex w-full flex-col gap-2.5 md:flex-row md:items-center'>
        {!hideModelSelector && (
          <div className='flex min-w-0 shrink-0 items-center'>
            {renderSelector()}
          </div>
        )}

        <div className='flex min-w-0 flex-1 items-center justify-between gap-2 md:justify-end'>
          {tools}
          <div className='ml-auto flex min-w-0 flex-1 items-center justify-end gap-1.5'>
            {actions}
            {renderSubmitButton()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='flex w-full flex-col gap-2.5 md:flex-row md:items-center md:justify-between'>
      {!hideModelSelector && (
        <div className='flex min-w-0 items-center justify-end md:hidden'>
          {renderSelector()}
        </div>
      )}

      <div className='flex items-center justify-between gap-2 md:justify-start'>
        {tools}
        <div className='flex items-center gap-1.5 md:hidden'>
          {actions}
          {renderSubmitButton()}
        </div>
      </div>

      {!hideModelSelector && (
        <div className='hidden min-w-0 items-center gap-2 md:flex'>
          {renderSelector()}
          {actions}
          {renderSubmitButton()}
        </div>
      )}
      {hideModelSelector && (
        <div className='hidden min-w-0 items-center gap-2 md:flex'>
          {actions}
          {renderSubmitButton()}
        </div>
      )}
    </div>
  )
}

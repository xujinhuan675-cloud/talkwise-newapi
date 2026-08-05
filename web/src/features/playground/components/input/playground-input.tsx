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
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PromptInput,
  PromptInputFooter,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'

import { getSubmittableInputText } from '../../lib'
import type {
  ModelOption,
  GroupOption,
  ParameterEnabled,
  PlaygroundConfig,
} from '../../types'
import type { PlaygroundInputCapabilities } from './playground-input-capabilities'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'

interface PlaygroundInputProps {
  compact?: boolean
  capabilities?: Partial<PlaygroundInputCapabilities>
  config: PlaygroundConfig
  onSubmit: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  extraTools?: ReactNode
  extraActions?: ReactNode
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  hasMessages?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onClearMessages?: () => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInput({
  compact = false,
  capabilities,
  config,
  onSubmit,
  onStop,
  disabled,
  extraTools,
  extraActions,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  hasMessages = false,
  onConfigChange,
  onClearMessages,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const handleSubmit = (message: PromptInputMessage) => {
    const submittableText = getSubmittableInputText(message, disabled)

    if (!submittableText) return
    onSubmit(submittableText)
    setText('')
  }

  return (
    <div className='grid shrink-0 gap-4 px-1 md:pb-4'>
      <PromptInput
        className='relative'
        groupClassName='bg-card text-card-foreground border-border rounded-lg border shadow-md overflow-hidden transition-[border-color,box-shadow] duration-200 has-disabled:bg-card has-disabled:opacity-100 focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/20'
        onSubmit={handleSubmit}
      >
        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className={
            compact
              ? 'bg-card text-foreground placeholder:text-muted-foreground/80 max-h-32 min-h-11 px-4 py-3 leading-5 opacity-100 md:min-h-11 md:text-base'
              : 'bg-card text-foreground placeholder:text-muted-foreground/80 min-h-20 px-5 pt-4 pb-3 leading-7 opacity-100 md:min-h-24 md:text-base'
          }
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('Ask anything')}
          rows={compact ? 1 : undefined}
          value={text}
        />

        <PromptInputFooter className='border-border bg-card text-foreground px-3 py-2.5'>
          <PlaygroundInputControls
            actions={extraActions}
            disabled={disabled}
            groups={groups}
            groupValue={groupValue}
            isGenerating={isGenerating}
            isModelLoading={isModelLoading}
            models={models}
            modelValue={modelValue}
            onGroupChange={onGroupChange}
            onModelChange={onModelChange}
            onStop={onStop}
            text={text}
            tools={
              <PlaygroundInputTools
                capabilities={capabilities}
                config={config}
                disabled={disabled}
                extraTools={extraTools}
                hasMessages={hasMessages}
                onConfigChange={onConfigChange}
                onClearMessages={onClearMessages}
                onParameterEnabledChange={onParameterEnabledChange}
                parameterEnabled={parameterEnabled}
              />
            }
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  )
}

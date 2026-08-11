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
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface TrainingConversationHeaderActionsProps {
  readonly children?: ReactNode
  readonly desktopExpanded: boolean
  readonly onDesktopExpandedChange: (expanded: boolean) => void
  readonly onMobileOpenChange: (open: boolean) => void
  readonly target?: HTMLElement | null
}

export function TrainingConversationHeaderActions({
  children,
  desktopExpanded,
  onDesktopExpandedChange,
  onMobileOpenChange,
  target,
}: TrainingConversationHeaderActionsProps) {
  const { i18n, t } = useTranslation()
  const localize = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )

  if (!target) return null

  const mobileLabel = localize('Training insights', '训练洞察')
  const desktopLabel = desktopExpanded
    ? localize('Collapse insights', '收起洞察')
    : localize('Expand insights', '展开洞察')

  return createPortal(
    <>
      {children}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-haspopup='dialog'
              aria-label={mobileLabel}
              className='order-last bg-transparent lg:hidden'
              size='icon-sm'
              variant='ghost'
              onClick={() => onMobileOpenChange(true)}
            />
          }
        >
          <PanelRightOpen />
        </TooltipTrigger>
        <TooltipContent>{mobileLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-expanded={desktopExpanded}
              aria-label={desktopLabel}
              className='order-last hidden bg-transparent aria-expanded:bg-transparent lg:inline-flex'
              size='icon-sm'
              variant='ghost'
              onClick={() => onDesktopExpandedChange(!desktopExpanded)}
            />
          }
        >
          {desktopExpanded ? <PanelRightClose /> : <PanelRightOpen />}
        </TooltipTrigger>
        <TooltipContent>{desktopLabel}</TooltipContent>
      </Tooltip>
    </>,
    target
  )
}

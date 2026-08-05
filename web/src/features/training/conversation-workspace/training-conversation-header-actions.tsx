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

  return createPortal(
    <>
      {children}
      <Button
        className='order-last lg:hidden'
        size='sm'
        variant='outline'
        onClick={() => onMobileOpenChange(true)}
      >
        <PanelRightOpen />
        <span className='hidden sm:inline'>
          {localize('Training insights', '训练洞察')}
        </span>
        <span className='sr-only sm:hidden'>
          {localize('Training insights', '训练洞察')}
        </span>
      </Button>
      <Button
        aria-expanded={desktopExpanded}
        className='order-last hidden lg:inline-flex'
        size='sm'
        variant='outline'
        onClick={() => onDesktopExpandedChange(!desktopExpanded)}
      >
        {desktopExpanded ? <PanelRightClose /> : <PanelRightOpen />}
        {desktopExpanded
          ? localize('Collapse insights', '收起洞察')
          : localize('Expand insights', '展开洞察')}
      </Button>
    </>,
    target
  )
}

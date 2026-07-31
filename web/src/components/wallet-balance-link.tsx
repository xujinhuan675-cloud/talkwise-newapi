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
import { Link } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { headerActionIconClassName } from '@/components/header-action-styles'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

export function WalletBalanceLink() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')

  if (!isWalletVisible) return null

  const balance = formatQuota(Number(user?.quota ?? 0))
  const label = t('Wallet balance: {{balance}}', { balance })

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='ghost'
            size='sm'
            className='hidden tabular-nums md:inline-flex'
            aria-label={label}
            render={<Link to='/wallet' />}
          />
        }
      >
        <Wallet
          className={headerActionIconClassName}
          data-icon='inline-start'
          aria-hidden='true'
        />
        <span>{balance}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

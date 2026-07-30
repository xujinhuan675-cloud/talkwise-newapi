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
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/theme-provider'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { createTrainingHostValue } from './contract'
import type {
  TrainingHostContextValue,
  TrainingHostFeatureFlags,
  TrainingHostTeam,
} from './types'

interface TrainingHostProviderProps {
  children: ReactNode
  apiBase?: string
  team?: TrainingHostTeam | null
  featureFlags?: Partial<TrainingHostFeatureFlags>
}

const TrainingHostContext = createContext<TrainingHostContextValue | null>(null)

export function TrainingHostProvider(props: TrainingHostProviderProps) {
  const bootstrapState = useAuthStore((state) => state.auth.bootstrapState)
  const user = useAuthStore((state) => state.auth.user)
  const demoSiteEnabled = useSystemConfigStore(
    (state) => state.config.demoSiteEnabled
  )
  const displayTokenStatEnabled = useSystemConfigStore(
    (state) => state.config.displayTokenStatEnabled
  )
  const { i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const locale = i18n.resolvedLanguage || i18n.language

  const value = useMemo(
    () =>
      createTrainingHostValue({
        bootstrapState,
        user,
        team: props.team,
        locale,
        theme: resolvedTheme,
        apiBase: props.apiBase,
        demoSiteEnabled,
        displayTokenStatEnabled,
        featureFlags: props.featureFlags,
      }),
    [
      bootstrapState,
      demoSiteEnabled,
      displayTokenStatEnabled,
      locale,
      props.apiBase,
      props.featureFlags,
      props.team,
      resolvedTheme,
      user,
    ]
  )

  return (
    <TrainingHostContext value={value}>{props.children}</TrainingHostContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTrainingHost(): TrainingHostContextValue {
  const context = useContext(TrainingHostContext)
  if (!context) {
    throw new Error('useTrainingHost must be used within TrainingHostProvider')
  }
  return context
}

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
import { toIntlLocale } from '@/i18n/languages'
import { ROLE } from '@/lib/roles'
import type { AuthBootstrapState, AuthUser } from '@/stores/auth-store'

import type {
  TrainingHostContextValue,
  TrainingHostFeatureFlags,
  TrainingHostRole,
  TrainingHostTeam,
  TrainingHostTheme,
  TrainingHostUser,
} from './types'

export interface TrainingHostSource {
  readonly bootstrapState: AuthBootstrapState
  readonly user: AuthUser | null
  readonly team?: TrainingHostTeam | null
  readonly locale?: string | null
  readonly theme: TrainingHostTheme
  readonly apiBase?: string | null
  readonly demoSiteEnabled?: boolean
  readonly displayTokenStatEnabled?: boolean
  readonly featureFlags?: Partial<TrainingHostFeatureFlags>
}

export function normalizeTrainingApiBase(value?: string | null): string {
  const apiBase = value?.trim() ?? ''
  if (!apiBase || apiBase === '/') return ''
  return apiBase.replace(/\/+$/, '')
}

export function resolveTrainingHostRole(
  user: AuthUser | null
): TrainingHostRole {
  const sourceValue = user?.role ?? null
  if (sourceValue === null) {
    return {
      kind: 'anonymous',
      sourceValue,
      isAdmin: false,
      isSuperAdmin: false,
    }
  }
  if (sourceValue === ROLE.SUPER_ADMIN) {
    return {
      kind: 'super_admin',
      sourceValue,
      isAdmin: true,
      isSuperAdmin: true,
    }
  }
  if (sourceValue >= ROLE.ADMIN) {
    return {
      kind: 'admin',
      sourceValue,
      isAdmin: true,
      isSuperAdmin: false,
    }
  }
  return {
    kind: sourceValue >= ROLE.USER ? 'user' : 'guest',
    sourceValue,
    isAdmin: false,
    isSuperAdmin: false,
  }
}

export function createTrainingHostValue(
  source: TrainingHostSource
): TrainingHostContextValue {
  let authStatus: TrainingHostContextValue['authStatus'] = 'loading'
  if (source.user) {
    authStatus = 'authenticated'
  } else if (source.bootstrapState === 'complete') {
    authStatus = 'anonymous'
  }

  let user: TrainingHostUser | null = null
  if (source.user) {
    user = {
      id: source.user.id,
      username: source.user.username,
      displayName: source.user.display_name?.trim() || null,
      email: source.user.email?.trim() || null,
      group: source.user.group?.trim() || null,
    }
  }

  return {
    authStatus,
    user,
    // NewAPI group membership is not a verified TalkWise team identity.
    team: source.team ?? null,
    role: resolveTrainingHostRole(source.user),
    locale: toIntlLocale(source.locale) ?? 'en',
    theme: source.theme,
    apiBase: normalizeTrainingApiBase(source.apiBase),
    featureFlags: {
      demoSite:
        source.featureFlags?.demoSite ?? source.demoSiteEnabled === true,
      displayTokenStats:
        source.featureFlags?.displayTokenStats ??
        source.displayTokenStatEnabled === true,
    },
  }
}

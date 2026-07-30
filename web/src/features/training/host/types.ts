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
export type TrainingHostAuthStatus = 'anonymous' | 'authenticated' | 'loading'

export type TrainingHostRoleKind =
  | 'anonymous'
  | 'guest'
  | 'user'
  | 'admin'
  | 'super_admin'

export interface TrainingHostUser {
  readonly id: number
  readonly username: string
  readonly displayName: string | null
  readonly email: string | null
  readonly group: string | null
}

export interface TrainingHostTeam {
  readonly id: string
  readonly name: string
}

export interface TrainingHostRole {
  readonly kind: TrainingHostRoleKind
  readonly sourceValue: number | null
  readonly isAdmin: boolean
  readonly isSuperAdmin: boolean
}

export interface TrainingHostFeatureFlags {
  readonly demoSite: boolean
  readonly displayTokenStats: boolean
}

export type TrainingHostTheme = 'dark' | 'light'

export interface TrainingHostContextValue {
  readonly authStatus: TrainingHostAuthStatus
  readonly user: TrainingHostUser | null
  readonly team: TrainingHostTeam | null
  readonly role: TrainingHostRole
  readonly locale: string
  readonly theme: TrainingHostTheme
  readonly apiBase: string
  readonly featureFlags: TrainingHostFeatureFlags
}

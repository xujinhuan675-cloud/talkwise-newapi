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
import { ROLE } from '@/lib/roles'

export type ManagementPermissionId = 'platform-admin' | 'training-team-admin'

export type ManagementPermissionDefinition = {
  readonly id: ManagementPermissionId
  readonly scope: 'platform' | 'training-team'
  readonly englishLabel: string
  readonly chineseLabel: string
  readonly minimumAssignerRole: number
  readonly maximumTargetRole: number
}

export const MANAGEMENT_PERMISSION_DEFINITIONS = [
  {
    id: 'platform-admin',
    scope: 'platform',
    englishLabel: 'Platform administrator',
    chineseLabel: '\u5e73\u53f0\u7ba1\u7406\u5458',
    minimumAssignerRole: ROLE.SUPER_ADMIN,
    maximumTargetRole: ROLE.ADMIN,
  },
  {
    id: 'training-team-admin',
    scope: 'training-team',
    englishLabel: 'Team administrator',
    chineseLabel: '\u56e2\u961f\u7ba1\u7406\u5458',
    minimumAssignerRole: ROLE.ADMIN,
    maximumTargetRole: ROLE.USER,
  },
] as const satisfies readonly ManagementPermissionDefinition[]

export function getAssignableManagementPermissions(
  assignerRole: number,
  targetRole: number
): readonly ManagementPermissionDefinition[] {
  return MANAGEMENT_PERMISSION_DEFINITIONS.filter(
    (permission) =>
      assignerRole >= permission.minimumAssignerRole &&
      targetRole <= permission.maximumTargetRole
  )
}

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
import type { ManageUserAction } from '../types'

export type UserActionMessage = {
  english: string
  chinese: string
}

// ============================================================================
// User Action Messages
// ============================================================================

const ACTION_MESSAGES: Record<ManageUserAction, UserActionMessage> = {
  enable: { english: 'User enabled successfully', chinese: '用户已启用' },
  disable: { english: 'User disabled successfully', chinese: '用户已禁用' },
  promote: {
    english: 'User set as platform admin successfully',
    chinese: '已设为平台管理员',
  },
  demote: {
    english: 'Platform admin access removed successfully',
    chinese: '已取消平台管理员权限',
  },
  delete: { english: 'User deleted successfully', chinese: '用户已删除' },
  add_quota: { english: 'Quota adjusted successfully', chinese: '配额已调整' },
}

/**
 * Get success message for user management action
 */
export function getUserActionMessageDetails(
  action: ManageUserAction
): UserActionMessage {
  return ACTION_MESSAGES[action]
}

export function getUserActionMessage(action: ManageUserAction): string {
  return getUserActionMessageDetails(action).english
}

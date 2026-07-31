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
import {
  parseTrainingConversationStartResult,
  trainingConversationWorkspaceSearch,
  type TrainingConversationWorkspaceSearch,
} from '../conversations/workspace-handoff'

export const TRAINING_PREP_WORKSPACE_PATH = '/training/conversations' as const

export interface TrainingPrepWorkspaceHandoff {
  readonly to: typeof TRAINING_PREP_WORKSPACE_PATH
  readonly search: TrainingConversationWorkspaceSearch
}

/**
 * Converts a successful, scoped preparation start response into the native
 * conversation workspace target. A missing identifier keeps the preparation
 * flow unavailable instead of navigating into an unrelated session.
 */
export function trainingPrepWorkspaceHandoff(
  startResult: unknown
): TrainingPrepWorkspaceHandoff | null {
  const result = parseTrainingConversationStartResult(startResult)
  if (!result) return null

  return {
    to: TRAINING_PREP_WORKSPACE_PATH,
    search: trainingConversationWorkspaceSearch(result),
  }
}

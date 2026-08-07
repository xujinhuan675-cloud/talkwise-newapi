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
  TRAINING_CONVERSATION_DATE_GROUP_KEYS,
  type TrainingConversationDateGroupKey,
} from './conversation-date-groups'

export const TRAINING_CONVERSATION_LIST_PREFERENCE_KEY =
  'talkwise.training-conversation.list'
export const TRAINING_CONVERSATION_GROUPS_PREFERENCE_KEY =
  'talkwise.training-conversation.groups'

export type TrainingConversationGroupExpandedState = Partial<
  Record<TrainingConversationDateGroupKey, boolean>
>

type PreferenceStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function loadTrainingConversationListExpanded(
  storage: PreferenceStorage | null | undefined
): boolean {
  try {
    return (
      storage?.getItem(TRAINING_CONVERSATION_LIST_PREFERENCE_KEY) !==
      'collapsed'
    )
  } catch {
    return true
  }
}

export function saveTrainingConversationListExpanded(
  storage: PreferenceStorage | null | undefined,
  expanded: boolean
): void {
  try {
    storage?.setItem(
      TRAINING_CONVERSATION_LIST_PREFERENCE_KEY,
      expanded ? 'expanded' : 'collapsed'
    )
  } catch {
    // A blocked preference store must not interrupt the conversation.
  }
}

export function loadTrainingConversationGroupsExpanded(
  storage: PreferenceStorage | null | undefined
): TrainingConversationGroupExpandedState {
  try {
    const rawValue = storage?.getItem(
      TRAINING_CONVERSATION_GROUPS_PREFERENCE_KEY
    )
    if (!rawValue) return {}

    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return TRAINING_CONVERSATION_DATE_GROUP_KEYS.reduce<TrainingConversationGroupExpandedState>(
      (result, key) => {
        const value = (parsed as Record<string, unknown>)[key]
        if (typeof value === 'boolean') result[key] = value
        return result
      },
      {}
    )
  } catch {
    return {}
  }
}

export function saveTrainingConversationGroupsExpanded(
  storage: PreferenceStorage | null | undefined,
  expanded: TrainingConversationGroupExpandedState
): void {
  try {
    storage?.setItem(
      TRAINING_CONVERSATION_GROUPS_PREFERENCE_KEY,
      JSON.stringify(expanded)
    )
  } catch {
    // A blocked preference store must not interrupt the conversation.
  }
}

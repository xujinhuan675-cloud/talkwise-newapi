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
export const TRAINING_CONVERSATION_LIST_PREFERENCE_KEY =
  'talkwise.training-conversation.list'

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

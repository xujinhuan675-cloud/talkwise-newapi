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
import type { Message } from '@/features/playground/types'

import type { TrainingConversationMessage } from '../conversation-workspace/api'
import type { TrainingRoomMessage } from './training-room-client'

function timestampMillis(value: string | null): number | undefined {
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

export function trainingRoomPlaygroundMessages(
  messages: readonly TrainingRoomMessage[],
  emptyContent: (videoAnswer: boolean) => string
): Message[] {
  return messages.map((message) => {
    const content =
      message.content || emptyContent(message.videoAnswer !== null)
    const timestamp = timestampMillis(message.timestamp)
    return {
      key: message.id,
      from: message.senderType === 'user' ? 'user' : 'assistant',
      versions: [{ id: message.id, content }],
      ...(timestamp === undefined
        ? {}
        : { createdAt: timestamp, completedAt: timestamp }),
      isContentComplete: true,
      status: 'complete',
    }
  })
}

function trainingConversationRole(
  senderType: TrainingRoomMessage['senderType']
): TrainingConversationMessage['role'] {
  if (senderType === 'persona') return 'assistant'
  if (senderType === 'system') return 'system'
  return 'user'
}

function metadataText(
  metadata: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export function trainingRoomConversationMessages(
  messages: readonly TrainingRoomMessage[],
  emptyContent: (videoAnswer: boolean) => string
): TrainingConversationMessage[] {
  return messages.map((message) => ({
    publicId: message.id,
    role: trainingConversationRole(message.senderType),
    content: message.content || emptyContent(message.videoAnswer !== null),
    parentMessageId: metadataText(
      message.metadata,
      'parentMessageId',
      'parent_message_id'
    ),
    branchId: metadataText(message.metadata, 'branchId', 'branch_id'),
    createdAt: message.timestamp,
  }))
}

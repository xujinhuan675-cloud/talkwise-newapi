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
import type { TrainingConversationMessage } from './api'

export interface TrainingConversationBranchOption {
  readonly message: TrainingConversationMessage
  readonly selected: boolean
}

export interface TrainingConversationBranchStep {
  readonly parentMessageId: string | null
  readonly selectedMessageId: string
  readonly options: readonly TrainingConversationBranchOption[]
}

export interface TrainingConversationTreeProjection {
  readonly path: readonly TrainingConversationMessage[]
  readonly selectedTailId: string | null
  readonly branchSteps: readonly TrainingConversationBranchStep[]
  readonly excludedMessageIds: readonly string[]
}

type MessageTreeIndex = {
  readonly byId: ReadonlyMap<string, TrainingConversationMessage>
  readonly childrenByParent: ReadonlyMap<
    string | null,
    readonly TrainingConversationMessage[]
  >
  readonly excludedMessageIds: readonly string[]
}

function createdAtMillis(message: TrainingConversationMessage): number | null {
  if (!message.createdAt) return null
  const timestamp = Date.parse(message.createdAt)
  return Number.isFinite(timestamp) ? timestamp : null
}

function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function compareMessages(
  left: TrainingConversationMessage,
  right: TrainingConversationMessage
): number {
  const leftTimestamp = createdAtMillis(left)
  const rightTimestamp = createdAtMillis(right)

  if (leftTimestamp !== rightTimestamp) {
    if (leftTimestamp === null) return -1
    if (rightTimestamp === null) return 1
    return leftTimestamp - rightTimestamp
  }

  return compareText(left.publicId, right.publicId)
}

function compareDuplicateMessages(
  left: TrainingConversationMessage,
  right: TrainingConversationMessage
): number {
  const messageOrder = compareMessages(left, right)
  if (messageOrder !== 0) return messageOrder

  const leftSignature = [
    left.parentMessageId ?? '',
    left.branchId ?? '',
    left.role,
    left.content,
  ].join('\u0000')
  const rightSignature = [
    right.parentMessageId ?? '',
    right.branchId ?? '',
    right.role,
    right.content,
  ].join('\u0000')
  return compareText(leftSignature, rightSignature)
}

function buildMessageTreeIndex(
  messages: readonly TrainingConversationMessage[]
): MessageTreeIndex {
  const duplicateGroups = new Map<string, TrainingConversationMessage[]>()
  for (const message of messages) {
    const group = duplicateGroups.get(message.publicId) ?? []
    group.push(message)
    duplicateGroups.set(message.publicId, group)
  }

  const allById = new Map<string, TrainingConversationMessage>()
  for (const [publicId, group] of duplicateGroups) {
    allById.set(publicId, [...group].sort(compareDuplicateMessages)[0])
  }

  const validById = new Map<string, TrainingConversationMessage>()
  const invalidIds = new Set<string>()

  const pathReachesRoot = (startId: string): boolean => {
    const visited = new Set<string>()
    let currentId: string | null = startId

    while (currentId) {
      if (visited.has(currentId)) return false
      visited.add(currentId)

      const current = allById.get(currentId)
      if (!current) return false
      if (!current.parentMessageId) return true
      currentId = current.parentMessageId
    }

    return true
  }

  for (const [publicId, message] of allById) {
    if (pathReachesRoot(publicId)) validById.set(publicId, message)
    else invalidIds.add(publicId)
  }

  const mutableChildren = new Map<
    string | null,
    TrainingConversationMessage[]
  >()
  for (const message of validById.values()) {
    const parentId = message.parentMessageId
    const children = mutableChildren.get(parentId) ?? []
    children.push(message)
    mutableChildren.set(parentId, children)
  }

  const childrenByParent = new Map<
    string | null,
    readonly TrainingConversationMessage[]
  >()
  for (const [parentId, children] of mutableChildren) {
    childrenByParent.set(parentId, children.sort(compareMessages))
  }

  return {
    byId: validById,
    childrenByParent,
    excludedMessageIds: [...invalidIds].sort(),
  }
}

function pathToMessage(
  index: MessageTreeIndex,
  messageId: string
): TrainingConversationMessage[] {
  const path: TrainingConversationMessage[] = []
  let current = index.byId.get(messageId)

  while (current) {
    path.unshift(current)
    current = current.parentMessageId
      ? index.byId.get(current.parentMessageId)
      : undefined
  }

  return path
}

function latestDescendantId(
  index: MessageTreeIndex,
  startId?: string
): string | null {
  let current: TrainingConversationMessage | undefined = startId
    ? index.byId.get(startId)
    : index.childrenByParent.get(null)?.at(-1)
  if (!current) return null

  while (true) {
    const child: TrainingConversationMessage | undefined =
      index.childrenByParent.get(current.publicId)?.at(-1)
    if (!child) return current.publicId
    current = child
  }
}

function projectIndexedTree(
  index: MessageTreeIndex,
  preferredTailId?: string | null
): TrainingConversationTreeProjection {
  const normalizedTailId = preferredTailId?.trim() || null
  const selectedTailId =
    normalizedTailId && index.byId.has(normalizedTailId)
      ? normalizedTailId
      : latestDescendantId(index)
  const path = selectedTailId ? pathToMessage(index, selectedTailId) : []
  const branchSteps = path.map((message) => {
    const options = index.childrenByParent.get(message.parentMessageId) ?? []
    return {
      parentMessageId: message.parentMessageId,
      selectedMessageId: message.publicId,
      options: options.map((option) => ({
        message: option,
        selected: option.publicId === message.publicId,
      })),
    }
  })

  return {
    path,
    selectedTailId,
    branchSteps,
    excludedMessageIds: index.excludedMessageIds,
  }
}

export function projectTrainingConversationTree(
  messages: readonly TrainingConversationMessage[],
  preferredTailId?: string | null
): TrainingConversationTreeProjection {
  return projectIndexedTree(buildMessageTreeIndex(messages), preferredTailId)
}

export function selectTrainingConversationBranch(
  messages: readonly TrainingConversationMessage[],
  currentTailId: string | null | undefined,
  selectedMessageId: string
): TrainingConversationTreeProjection {
  const index = buildMessageTreeIndex(messages)
  const current = projectIndexedTree(index, currentTailId)
  const normalizedMessageId = selectedMessageId.trim()
  if (!normalizedMessageId || normalizedMessageId === current.selectedTailId) {
    return current
  }

  const selectedStep = current.branchSteps.find((step) =>
    step.options.some(
      (option) => option.message.publicId === normalizedMessageId
    )
  )
  if (!selectedStep) return current

  const selectedOption = selectedStep.options.find(
    (option) => option.message.publicId === normalizedMessageId
  )
  if (selectedOption?.selected) return current

  const nextTailId = latestDescendantId(index, normalizedMessageId)
  return nextTailId ? projectIndexedTree(index, nextTailId) : current
}

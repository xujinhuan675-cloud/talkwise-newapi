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
import type { TrainingConversationSession } from './api'

export const TRAINING_CONVERSATION_DATE_GROUP_KEYS = [
  'today',
  'yesterday',
  'previous7Days',
  'previous30Days',
  'older',
] as const

export type TrainingConversationDateGroupKey =
  (typeof TRAINING_CONVERSATION_DATE_GROUP_KEYS)[number]

export type TrainingConversationDateGroup = {
  key: TrainingConversationDateGroupKey
  sessions: TrainingConversationSession[]
}

function startOfLocalDay(value: Date): Date {
  const start = new Date(value)
  start.setHours(0, 0, 0, 0)
  return start
}

function daysBefore(value: Date, days: number): Date {
  const result = new Date(value)
  result.setDate(result.getDate() - days)
  return result
}

export function trainingConversationDateGroup(
  updatedAt: string | null,
  now = new Date()
): TrainingConversationDateGroupKey {
  const parsed = updatedAt ? new Date(updatedAt) : now
  const date = Number.isNaN(parsed.getTime()) ? now : parsed
  const today = startOfLocalDay(now)

  if (date >= today) return 'today'
  if (date >= daysBefore(today, 1)) return 'yesterday'
  if (date >= daysBefore(today, 7)) return 'previous7Days'
  if (date >= daysBefore(today, 30)) return 'previous30Days'
  return 'older'
}

export function groupTrainingConversationsByDate(
  sessions: TrainingConversationSession[],
  now = new Date()
): TrainingConversationDateGroup[] {
  const groups = new Map<
    TrainingConversationDateGroupKey,
    TrainingConversationSession[]
  >(
    TRAINING_CONVERSATION_DATE_GROUP_KEYS.map((key) => [
      key,
      [] as TrainingConversationSession[],
    ])
  )

  sessions.forEach((session) => {
    groups
      .get(trainingConversationDateGroup(session.updatedAt, now))
      ?.push(session)
  })

  return TRAINING_CONVERSATION_DATE_GROUP_KEYS.flatMap((key) => {
    const groupedSessions = groups.get(key) ?? []
    return groupedSessions.length > 0
      ? [{ key, sessions: groupedSessions }]
      : []
  })
}

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
import { api } from '@/lib/http-client'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

interface TrainingPointEventDTO {
  id: number
  event_type: string
  points: number
  source_type: string
  source_id: string
  created_at: string
}

interface TrainingPointsSummaryDTO {
  unit: string
  unit_name: string
  total_points: number
  level: number
  level_title: string
  current_level_points: number
  next_level_points: number
  level_progress_percentage: number
  completed_sessions: number
  recent_events: TrainingPointEventDTO[]
}

export interface TrainingPointEvent {
  readonly id: number
  readonly eventType: string
  readonly points: number
  readonly sourceType: string
  readonly sourceId: string
  readonly createdAt: string
}

export interface TrainingPointsSummary {
  readonly unit: string
  readonly unitName: string
  readonly totalPoints: number
  readonly level: number
  readonly levelTitle: string
  readonly currentLevelPoints: number
  readonly nextLevelPoints: number
  readonly levelProgressPercentage: number
  readonly completedSessions: number
  readonly recentEvents: readonly TrainingPointEvent[]
}

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'

function nonNegativeInteger(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0
}

function requiredText(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(`Invalid Training Points ${field}`)
}

export function trainingPointsSummaryUrl(apiBase: string): string {
  const base = apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  return `${base}/growth/summary`
}

export function normalizeTrainingPointsSummary(
  value: TrainingPointsSummaryDTO
): TrainingPointsSummary {
  return {
    unit: requiredText(value.unit, 'unit'),
    unitName: requiredText(value.unit_name, 'unit name'),
    totalPoints: nonNegativeInteger(value.total_points),
    level: Math.max(1, nonNegativeInteger(value.level)),
    levelTitle: requiredText(value.level_title, 'level title'),
    currentLevelPoints: nonNegativeInteger(value.current_level_points),
    nextLevelPoints: nonNegativeInteger(value.next_level_points),
    levelProgressPercentage: Math.min(
      100,
      nonNegativeInteger(value.level_progress_percentage)
    ),
    completedSessions: nonNegativeInteger(value.completed_sessions),
    recentEvents: Array.isArray(value.recent_events)
      ? value.recent_events.flatMap((event) => {
          if (!event || typeof event !== 'object') return []
          try {
            return [
              {
                id: nonNegativeInteger(event.id),
                eventType: requiredText(event.event_type, 'event type'),
                points: nonNegativeInteger(event.points),
                sourceType: requiredText(event.source_type, 'source type'),
                sourceId: requiredText(event.source_id, 'source id'),
                createdAt: requiredText(event.created_at, 'event date'),
              },
            ]
          } catch {
            return []
          }
        })
      : [],
  }
}

export async function getTrainingPointsSummary(
  apiBase: string
): Promise<TrainingPointsSummary> {
  const response = await api.get<TalkWiseResponse<TrainingPointsSummaryDTO>>(
    trainingPointsSummaryUrl(apiBase),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  if (response.data.code !== 0 || response.data.data === null) {
    throw new Error(response.data.message || 'Training Points request failed')
  }
  return normalizeTrainingPointsSummary(response.data.data)
}

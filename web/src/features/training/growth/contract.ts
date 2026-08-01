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
import type {
  ReviewSession,
  ScenarioProgress,
  TrainingCompetencyRadar,
} from '../review/types'

export interface TrainingGrowthSummary {
  readonly trackedScenarios: number
  readonly completedScenarios: number
  readonly scoredScenarios: number
  readonly averageScore: number | null
  readonly completionPercentage: number
}

export type TrainingGrowthScoreState =
  | 'failed'
  | 'not_available'
  | 'pending'
  | 'ready'

export function getTrainingGrowthScoreState(
  progress: ScenarioProgress
): TrainingGrowthScoreState {
  if (progress.status === 'failed' || progress.failureReason) return 'failed'
  if (progress.scoreStatus === 'ready' && progress.score !== null) {
    return 'ready'
  }
  if (progress.status === 'completed' && progress.scoreStatus === 'pending') {
    return 'pending'
  }
  return 'not_available'
}

export type TrainingGrowthProfileState = 'empty' | 'ready'

export function getTrainingGrowthProfileState(
  radar: TrainingCompetencyRadar | null | undefined
): TrainingGrowthProfileState {
  return radar && radar.sampleSize > 0 && radar.dimensions.length >= 3
    ? 'ready'
    : 'empty'
}

function trainingActivityTimestamp(session: ReviewSession): number {
  const value = session.completedAt ?? session.startedAt
  if (!value) return Number.NEGATIVE_INFINITY
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp
}

export function selectRecentTrainingActivity(
  sessions: ReviewSession[],
  limit = 6
): ReviewSession[] {
  const normalizedLimit = Number.isSafeInteger(limit)
    ? Math.max(0, Math.min(20, limit))
    : 6
  return sessions
    .map((session, sourceIndex) => ({ session, sourceIndex }))
    .sort(
      (first, second) =>
        trainingActivityTimestamp(second.session) -
          trainingActivityTimestamp(first.session) ||
        first.sourceIndex - second.sourceIndex
    )
    .slice(0, normalizedLimit)
    .map(({ session }) => session)
}

export function buildTrainingGrowthSummary(
  progress: ScenarioProgress[]
): TrainingGrowthSummary {
  const scoredProgress = progress.filter(
    (item) => item.scoreStatus === 'ready' && item.score !== null
  )
  const completedScenarios = progress.filter(
    (item) => item.status === 'completed'
  ).length
  const averageScore =
    scoredProgress.length > 0
      ? Math.round(
          scoredProgress.reduce((total, item) => total + (item.score ?? 0), 0) /
            scoredProgress.length
        )
      : null

  return {
    trackedScenarios: progress.length,
    completedScenarios,
    scoredScenarios: scoredProgress.length,
    averageScore,
    completionPercentage:
      progress.length > 0
        ? Math.round((completedScenarios / progress.length) * 100)
        : 0,
  }
}

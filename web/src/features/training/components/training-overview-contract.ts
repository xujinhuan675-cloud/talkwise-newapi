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
import type { ScenarioProgress } from '../review/types'
import type { TrainingScenario } from '../scenarios/types'

export type TrainingOverviewRecommendationReason =
  | 'in_progress'
  | 'required'
  | 'not_started'
  | 'failed'
  | 'score_below_target'
  | 'warm_up'

export interface TrainingOverviewRecommendation {
  readonly scenario: TrainingScenario
  readonly progress: ScenarioProgress | null
  readonly reason: TrainingOverviewRecommendationReason
}

function timestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function latestProgressByScenario(
  progress: ScenarioProgress[]
): Map<string, ScenarioProgress> {
  const records = new Map<string, ScenarioProgress>()

  for (const item of progress) {
    const current = records.get(item.scenarioId)
    if (
      !current ||
      timestamp(item.lastPracticedAt) >= timestamp(current.lastPracticedAt)
    ) {
      records.set(item.scenarioId, item)
    }
  }

  return records
}

export function trainingOverviewRecommendationReason(
  scenario: TrainingScenario,
  progress: ScenarioProgress | null
): TrainingOverviewRecommendationReason {
  if (progress?.status === 'in_progress') return 'in_progress'
  if (scenario.required && (!progress || progress.status === 'not_started')) {
    return 'required'
  }
  if (!progress || progress.status === 'not_started') return 'not_started'
  if (progress.status === 'failed') return 'failed'
  if (
    progress.scoreStatus === 'ready' &&
    progress.score !== null &&
    progress.score < 80
  ) {
    return 'score_below_target'
  }
  return 'warm_up'
}

function recommendationPriority(reason: TrainingOverviewRecommendationReason) {
  const priorities: Record<TrainingOverviewRecommendationReason, number> = {
    in_progress: 0,
    required: 1,
    not_started: 2,
    failed: 3,
    score_below_target: 4,
    warm_up: 5,
  }
  return priorities[reason]
}

export function selectTrainingOverviewRecommendation(
  scenarios: TrainingScenario[],
  progress: ScenarioProgress[]
): TrainingOverviewRecommendation | null {
  const records = latestProgressByScenario(progress)
  const recommendations = scenarios.map((scenario) => {
    const record = records.get(scenario.id) ?? null
    return {
      scenario,
      progress: record,
      reason: trainingOverviewRecommendationReason(scenario, record),
    }
  })

  recommendations.sort((first, second) => {
    const firstPriority = recommendationPriority(first.reason)
    const secondPriority = recommendationPriority(second.reason)
    if (firstPriority !== secondPriority) {
      return firstPriority - secondPriority
    }
    if (first.scenario.required !== second.scenario.required) {
      return Number(second.scenario.required) - Number(first.scenario.required)
    }
    const firstTimestamp = timestamp(first.progress?.lastPracticedAt)
    const secondTimestamp = timestamp(second.progress?.lastPracticedAt)
    if (firstTimestamp !== secondTimestamp) {
      return firstTimestamp - secondTimestamp
    }
    return first.scenario.title.localeCompare(second.scenario.title)
  })

  return recommendations[0] ?? null
}

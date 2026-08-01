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
import type { TrainingHostRole } from '../host'
import type {
  TrainingRubricDefaults,
  TrainingScenarioDimension,
  TrainingScenarioDimensionWeight,
} from './types'

export function canManageTrainingScenarioConfig(
  role: Pick<TrainingHostRole, 'isAdmin'>
): boolean {
  return role.isAdmin
}

export function rubricDefaultsForConfiguredDimensions(
  defaults: TrainingRubricDefaults,
  dimensions: TrainingScenarioDimension[]
): TrainingScenarioDimensionWeight[] {
  const configuredIds = new Set(dimensions.map((dimension) => dimension.id))
  const weights = defaults.dimensionWeights.filter((weight) =>
    configuredIds.has(weight.dimensionId)
  )
  const total = weights.reduce((sum, weight) => sum + weight.weight, 0)

  if (weights.length === 0 || Math.abs(total - 100) > 0.0001) {
    throw new Error(
      'Backend rubric defaults do not match the configured scoring dimensions'
    )
  }

  return weights
}

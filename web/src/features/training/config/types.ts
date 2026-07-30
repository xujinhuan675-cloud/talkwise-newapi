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
export type TrainingScenarioCategory =
  | 'customer_service'
  | 'interview'
  | 'negotiation'
  | 'sales'
  | 'workplace'

export type TrainingScenarioDifficulty = 'easy' | 'expert' | 'hard' | 'medium'

export interface TrainingScenarioDimension {
  id: string
  name: string
  description: string
  enabled: boolean
  source: 'default' | 'local'
  updatedAt: string
}

export interface TrainingScenarioDimensionWeight {
  dimensionId: string
  weight: number
}

export interface TrainingScenarioConfigDraft {
  id: string
  title: string
  description: string
  customerProfile: string
  difficulty: TrainingScenarioDifficulty
  category: TrainingScenarioCategory
  required: boolean
  enabled: boolean
  openingLine: string
  persona: {
    name: string
    role: string
    style: string
  }
  learnerRole: string
  framework: string
  trainingPoints: string[]
  dimensionWeights: TrainingScenarioDimensionWeight[]
  sourceScenarioId?: string
  updatedAt: string
}

export interface TrainingScenarioConfigState {
  version: number
  dimensions: TrainingScenarioDimension[]
  scenarios: TrainingScenarioConfigDraft[]
  selectedScenarioId: string | null
  selectedDimensionId: string | null
  updatedAt: string
}

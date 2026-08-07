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
export type TrainingScenarioDifficulty = 'easy' | 'expert' | 'hard' | 'medium'

export type TrainingScenarioCategory =
  | 'customer_service'
  | 'interview'
  | 'negotiation'
  | 'sales'
  | 'workplace'

export type TrainingSessionMode = 'realtime' | 'text' | 'video' | 'voice'

export type TrainingModality = Exclude<TrainingSessionMode, 'realtime'>

export type TrainingInteractionMode = 'realtime' | 'turn_based'

export interface TrainingModeSelection {
  interactionMode: TrainingInteractionMode
  modality: TrainingModality
}

export interface TrainingScenarioPersona {
  avatarUrl?: string | null
  personaId?: string
  name: string
  role: string
  style: string
  voiceId?: string | null
  voiceSpeed?: number
  voiceLoudness?: number
  voiceEmotion?: string | null
  voiceEmotionScale?: number
  voiceStyle?: string | null
}

export interface TrainingScenarioDimensionWeight {
  dimensionId: string
  weight: number
}

export interface TrainingScenario {
  id: string
  title: string
  description: string
  customerProfile: string
  difficulty: TrainingScenarioDifficulty
  category: TrainingScenarioCategory
  required: boolean
  openingLine: string
  persona: TrainingScenarioPersona
  learnerRole: string
  framework: string
  trainingPoints: string[]
  dimensionWeights: TrainingScenarioDimensionWeight[]
}

export interface TrainingTaskConfig {
  role: string
  level: string
  tech_stack: string[]
  question_type_ratios: Record<string, number>
  question_count: number
  framework: string
  difficulty: string
  category: string
  rubric_weights?: Record<string, number>
  metadata: Record<string, unknown>
}

export interface CreateTrainingSessionRequest {
  mode: TrainingSessionMode
  scenario_template_id: string
  task_config: TrainingTaskConfig
}

export type TrainingSessionStatus =
  | 'active'
  | 'completed'
  | 'created'
  | 'failed'

export interface TrainingSession {
  sessionId: string
  mode: TrainingSessionMode
  scenarioTemplateId: string | null
  status: TrainingSessionStatus
  roomId: string | null
  createdForUserId: string | null
  createdForTeamId: string | null
}

export interface TrainingScenarioFilters {
  category: TrainingScenarioCategory | 'all'
  difficulty: TrainingScenarioDifficulty | 'all'
  query: string
}

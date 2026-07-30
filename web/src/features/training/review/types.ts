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
export type TrainingSessionStatus =
  | 'active'
  | 'completed'
  | 'created'
  | 'failed'

export type TrainingSessionMode = 'realtime' | 'text' | 'video' | 'voice'

export type ScenarioProgressStatus =
  | 'completed'
  | 'failed'
  | 'in_progress'
  | 'not_started'

export type ScenarioScoreStatus = 'pending' | 'ready'

export interface TrainingSessionDTO {
  session_id: string
  task_config: {
    role: string
    level: string
    tech_stack: string[]
    difficulty: string
    category: string
    metadata?: Record<string, unknown> | null
  }
  mode: TrainingSessionMode
  scenario_template_id?: string | null
  status: TrainingSessionStatus
  room_id?: string | number | null
  started_at?: string | null
  completed_at?: string | null
  report_id?: string | null
  score_id?: string | null
  message_count: number
  failure_reason?: string | null
}

export interface ScenarioProgressDTO {
  scenario_id: string
  status: ScenarioProgressStatus
  failure_reason?: string | null
  score?: number | null
  score_status: ScenarioScoreStatus
  overall_score?: number | null
  evaluation_id?: number | null
  last_practiced_at?: string | null
  training_session_id: string
  report_id?: string | null
  score_id?: string | null
}

export interface TrainingSessionReportDTO {
  id: string | number
  room_id: string | number
  summary: string
  content: Record<string, unknown>
  created_at?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ReviewSession {
  readonly id: string
  readonly scenarioId: string | null
  readonly title: string
  readonly description: string | null
  readonly role: string
  readonly category: string
  readonly difficulty: string
  readonly mode: TrainingSessionMode
  readonly status: TrainingSessionStatus
  readonly messageCount: number
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly reportId: string | null
  readonly failureReason: string | null
  readonly score: number | null
  readonly scoreStatus: ScenarioScoreStatus
}

export interface ScenarioProgress {
  readonly scenarioId: string
  readonly sessionId: string
  readonly status: ScenarioProgressStatus
  readonly score: number | null
  readonly scoreStatus: ScenarioScoreStatus
  readonly overallScore: number | null
  readonly lastPracticedAt: string | null
  readonly reportId: string | null
  readonly failureReason: string | null
}

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

export type ScenarioScoreStatus = 'pending' | 'ready' | 'unavailable'

export type ReviewReportStatus =
  | 'failed'
  | 'not_requested'
  | 'pending'
  | 'ready'
  | 'unavailable'

export interface ReviewReportState {
  readonly status: ReviewReportStatus
  readonly generation: string | null
  readonly message: string | null
  readonly completedWithoutReport: boolean
}

export type ReviewEvaluationStatus = 'failed' | 'ready' | 'unavailable'

export interface ReviewEvaluationState {
  readonly status: ReviewEvaluationStatus
  readonly evaluationId: string | null
  readonly rubricVersion: string | null
  readonly judgeVersion: string | null
  readonly judgeModel: string | null
  readonly effectiveness: ReviewOutcomeObservation | null
  readonly appropriateness: ReviewOutcomeObservation | null
  readonly competencies: Readonly<Record<string, ReviewCompetencyObservation>>
  readonly message: string | null
  readonly retryable: boolean
}

export interface ReviewEvidenceReference {
  readonly messageId: string
  readonly quote: string
}

export interface ReviewOutcomeObservation {
  readonly rating: number | null
  readonly evidence: readonly ReviewEvidenceReference[]
  readonly reason: string
}

export interface ReviewCompetencyObservation {
  readonly opportunityPresent: boolean
  readonly rating: number | null
  readonly evidence: readonly ReviewEvidenceReference[]
  readonly reason: string
  readonly suggestion: string
}

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

export type ReviewDataSource = 'progress' | 'report' | 'session'

export type ReviewPathTextState = 'id_only' | 'reference_only' | 'with_text'

export interface ReviewPathItem {
  readonly publicId: string
  readonly role: string
  readonly content: string
  readonly branchId: string | null
  readonly parentMessageId: string | null
}

export interface ReviewBranchContext {
  readonly source: ReviewDataSource
  readonly sourceDetail: string
  readonly provider: string | null
  readonly conversationId: string | null
  readonly branchId: string | null
  readonly selectedTailMessageId: string | null
  readonly forkPointMessageId: string | null
  readonly pathCount: number | null
  readonly pathSummary: string | null
  readonly lastReplyPreview: string | null
  readonly pathTextState: ReviewPathTextState
  readonly selectedPath: ReviewPathItem[]
}

export interface ScenarioProgressDTO {
  scenario_id: string
  status: ScenarioProgressStatus
  failure_reason?: string | null
  score?: number | null
  score_status: ScenarioScoreStatus
  outcome_rating?: number | null
  evaluation_id?: number | null
  last_practiced_at?: string | null
  training_session_id: string
  report_id?: string | null
  score_id?: string | null
  metadata?: Record<string, unknown> | null
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
  readonly trainingSource: string | null
  readonly status: TrainingSessionStatus
  readonly messageCount: number
  readonly roomId?: string | null
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly reportId: string | null
  readonly reportState: ReviewReportState
  readonly evaluationState: ReviewEvaluationState | null
  readonly failureReason: string | null
  readonly score: number | null
  readonly scoreStatus: ScenarioScoreStatus
  readonly progressLinked?: boolean
  readonly taskMetadata?: Record<string, unknown> | null
}

export interface ScenarioProgress {
  readonly scenarioId: string
  readonly sessionId: string
  readonly status: ScenarioProgressStatus
  readonly score: number | null
  readonly scoreStatus: ScenarioScoreStatus
  readonly outcomeRating: number | null
  readonly lastPracticedAt: string | null
  readonly reportId: string | null
  readonly failureReason: string | null
  readonly metadata?: Record<string, unknown> | null
}

export interface ScenarioProgressSummaryDTO {
  tracked_scenarios: number
  completed_scenarios: number
  scored_scenarios: number
  average_score: number | null
  completion_percentage: number
}

export interface ScenarioProgressSummary {
  readonly trackedScenarios: number
  readonly completedScenarios: number
  readonly scoredScenarios: number
  readonly averageScore: number | null
  readonly completionPercentage: number
}

export interface TrainingCompetencyRadarDimensionDTO {
  dimension_id: string
  score: number
  sample_count: number
  scenario_count: number
  state: TrainingCompetencyObservationState
}

export interface TrainingCompetencyRadarDTO {
  sample_size: number
  dimensions: TrainingCompetencyRadarDimensionDTO[]
}

export interface TrainingCompetencyRadarDimension {
  readonly dimensionId: string
  readonly score: number
  readonly sampleCount: number
  readonly scenarioCount: number
  readonly state: TrainingCompetencyObservationState
}

export type TrainingCompetencyObservationState = 'exploring' | 'stable'

export interface TrainingCompetencyRadar {
  readonly sampleSize: number
  readonly dimensions: TrainingCompetencyRadarDimension[]
}

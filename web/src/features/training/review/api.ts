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
import axios from 'axios'

import { api } from '@/lib/http-client'

import type {
  ReviewSession,
  ScenarioProgress,
  ScenarioProgressDTO,
  ScenarioProgressSummary,
  ScenarioProgressSummaryDTO,
  ScenarioScoreStatus,
  TrainingCompetencyRadar,
  TrainingCompetencyRadarDTO,
  TrainingSessionDTO,
  TrainingSessionReportDTO,
} from './types'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'

export interface TrainingListPage<T> {
  readonly items: T[]
  readonly total: number
}

export interface TrainingListRequest {
  readonly skip: number
  readonly limit: number
}

function requireTalkWiseData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeScore(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeScoreStatus(value: string): ScenarioScoreStatus {
  return value === 'ready' ? 'ready' : 'pending'
}

function scenarioMetadata(
  session: TrainingSessionDTO
): Record<string, unknown> | null {
  const metadata = asRecord(session.task_config.metadata)
  return asRecord(metadata?.scenario_training)
}

export function trainingReviewApiUrl(apiBase: string, path: string): string {
  const normalizedBase =
    apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  return `${normalizedBase}${path}`
}

function trainingListApiUrl(
  apiBase: string,
  path: string,
  request: TrainingListRequest
): string {
  const params = new URLSearchParams({
    skip: String(request.skip),
    limit: String(request.limit),
  })
  return trainingReviewApiUrl(apiBase, `${path}?${params.toString()}`)
}

function responseTotalCount(headers: unknown, fallback: number): number {
  const values = headers as
    | { get?: (name: string) => unknown; [key: string]: unknown }
    | undefined
  const raw = values?.get?.('x-total-count') ?? values?.['x-total-count']
  const total = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(total) && total >= 0 ? total : fallback
}

export function reviewRequestErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | {
          detail?: string | { message?: string }
          message?: string
        }
      | undefined
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.message
    return detail || payload?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export function toReviewSession(session: TrainingSessionDTO): ReviewSession {
  const metadata = scenarioMetadata(session)
  const title =
    asText(metadata?.title) ||
    session.task_config.tech_stack[0] ||
    session.task_config.role ||
    session.scenario_template_id ||
    session.session_id
  const description =
    session.task_config.tech_stack[1] || session.task_config.category || null

  return {
    id: session.session_id,
    scenarioId: session.scenario_template_id || asText(metadata?.id),
    title,
    description,
    role: session.task_config.role,
    category: session.task_config.category,
    difficulty: session.task_config.difficulty,
    mode: session.mode,
    status: session.status,
    messageCount: session.message_count,
    startedAt: session.started_at ?? null,
    completedAt: session.completed_at ?? null,
    reportId: session.report_id ?? null,
    failureReason: session.failure_reason ?? null,
    score: null,
    scoreStatus: 'pending',
  }
}

export function toScenarioProgress(dto: ScenarioProgressDTO): ScenarioProgress {
  return {
    scenarioId: dto.scenario_id,
    sessionId: dto.training_session_id,
    status: dto.status,
    score: normalizeScore(dto.score),
    scoreStatus: normalizeScoreStatus(dto.score_status),
    overallScore:
      typeof dto.overall_score === 'number' &&
      Number.isFinite(dto.overall_score)
        ? dto.overall_score
        : null,
    lastPracticedAt: dto.last_practiced_at ?? null,
    reportId: dto.report_id ?? null,
    failureReason: dto.failure_reason ?? null,
  }
}

export function toScenarioProgressSummary(
  dto: ScenarioProgressSummaryDTO
): ScenarioProgressSummary {
  return {
    trackedScenarios: dto.tracked_scenarios,
    completedScenarios: dto.completed_scenarios,
    scoredScenarios: dto.scored_scenarios,
    averageScore: normalizeScore(dto.average_score),
    completionPercentage: Math.max(
      0,
      Math.min(100, Math.round(dto.completion_percentage))
    ),
  }
}

export function toTrainingCompetencyRadar(
  dto: TrainingCompetencyRadarDTO
): TrainingCompetencyRadar {
  const sampleSize = Number.isSafeInteger(dto.sample_size)
    ? Math.max(0, dto.sample_size)
    : 0
  return {
    sampleSize,
    dimensions: dto.dimensions.flatMap((dimension) => {
      const dimensionId = asText(dimension.dimension_id)
      const score = normalizeScore(dimension.score)
      const sampleCount = Number.isSafeInteger(dimension.sample_count)
        ? Math.max(0, dimension.sample_count)
        : 0
      return dimensionId && score !== null && sampleCount > 0
        ? [{ dimensionId, score, sampleCount }]
        : []
    }),
  }
}

export function mergeReviewSessionScores(
  sessions: ReviewSession[],
  progress: ScenarioProgress[]
): ReviewSession[] {
  const progressBySession = new Map(
    progress.map((item) => [item.sessionId, item])
  )

  return sessions.map((session) => {
    const matchingProgress = progressBySession.get(session.id)
    if (!matchingProgress) return session

    return {
      ...session,
      score: matchingProgress.score,
      scoreStatus: matchingProgress.scoreStatus,
    }
  })
}

export function sortByLatestPractice<
  T extends { lastPracticedAt: string | null },
>(records: T[]): T[] {
  return [...records].sort((first, second) => {
    const firstTimestamp = first.lastPracticedAt
      ? Date.parse(first.lastPracticedAt)
      : 0
    const secondTimestamp = second.lastPracticedAt
      ? Date.parse(second.lastPracticedAt)
      : 0
    return secondTimestamp - firstTimestamp
  })
}

export async function listReviewSessions(
  apiBase: string,
  request: TrainingListRequest
): Promise<TrainingListPage<ReviewSession>> {
  const response = await api.get<TalkWiseResponse<TrainingSessionDTO[]>>(
    trainingListApiUrl(apiBase, '/sessions', request),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const items = requireTalkWiseData(response.data).map(toReviewSession)
  return { items, total: responseTotalCount(response.headers, items.length) }
}

export async function getReviewSession(
  apiBase: string,
  sessionId: string
): Promise<ReviewSession> {
  const response = await api.get<TalkWiseResponse<TrainingSessionDTO>>(
    trainingReviewApiUrl(apiBase, `/sessions/${encodeURIComponent(sessionId)}`),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return toReviewSession(requireTalkWiseData(response.data))
}

export async function getTrainingSessionReport(
  apiBase: string,
  sessionId: string
): Promise<TrainingSessionReportDTO> {
  const response = await api.get<TalkWiseResponse<TrainingSessionReportDTO>>(
    trainingReviewApiUrl(
      apiBase,
      `/sessions/${encodeURIComponent(sessionId)}/report`
    ),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return requireTalkWiseData(response.data)
}

export async function listScenarioProgress(
  apiBase: string,
  request: TrainingListRequest
): Promise<TrainingListPage<ScenarioProgress>> {
  const response = await api.get<TalkWiseResponse<ScenarioProgressDTO[]>>(
    trainingListApiUrl(apiBase, '/scenario-progress', request),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const items = requireTalkWiseData(response.data).map(toScenarioProgress)
  return { items, total: responseTotalCount(response.headers, items.length) }
}

export async function getScenarioProgressSummary(
  apiBase: string
): Promise<ScenarioProgressSummary> {
  const response = await api.get<TalkWiseResponse<ScenarioProgressSummaryDTO>>(
    trainingReviewApiUrl(apiBase, '/scenario-progress/summary'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return toScenarioProgressSummary(requireTalkWiseData(response.data))
}

export async function getTrainingCompetencyRadar(
  apiBase: string
): Promise<TrainingCompetencyRadar> {
  const response = await api.get<TalkWiseResponse<TrainingCompetencyRadarDTO>>(
    trainingReviewApiUrl(apiBase, '/scenario-progress/competency-radar'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return toTrainingCompetencyRadar(requireTalkWiseData(response.data))
}

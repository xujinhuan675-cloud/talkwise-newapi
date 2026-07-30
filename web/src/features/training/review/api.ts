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
  ScenarioScoreStatus,
  TrainingSessionDTO,
  TrainingSessionReportDTO,
} from './types'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'

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
  apiBase: string
): Promise<ReviewSession[]> {
  const response = await api.get<TalkWiseResponse<TrainingSessionDTO[]>>(
    trainingReviewApiUrl(apiBase, '/sessions?limit=100'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return requireTalkWiseData(response.data).map(toReviewSession)
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
  apiBase: string
): Promise<ScenarioProgress[]> {
  const response = await api.get<TalkWiseResponse<ScenarioProgressDTO[]>>(
    trainingReviewApiUrl(apiBase, '/scenario-progress?limit=100'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return sortByLatestPractice(
    requireTalkWiseData(response.data).map(toScenarioProgress)
  )
}

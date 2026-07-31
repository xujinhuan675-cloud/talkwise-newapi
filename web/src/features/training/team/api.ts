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
  TeamCompetencyDimension,
  TeamCompetencyRanking,
  TeamCompetencyRankingDTO,
  TeamScenarioRanking,
  TeamScenarioRankingDTO,
} from './types'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

export interface TeamAnalyticsListRequest {
  readonly skip: number
  readonly limit: number
}

export interface TeamAnalyticsPage<T> {
  readonly items: T[]
  readonly total: number
}

const DEFAULT_TRAINING_API_BASE = '/api/talkwise/training'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asCount(value: unknown): number {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0
}

function normalizeScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : null
}

function requireTalkWiseData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

function teamAnalyticsApiUrl(
  apiBase: string,
  path: string,
  request: TeamAnalyticsListRequest
): string {
  const base = apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  const query = new URLSearchParams({
    skip: String(request.skip),
    limit: String(request.limit),
  })
  return `${base}/team${path}?${query.toString()}`
}

function responseTotalCount(headers: unknown, fallback: number): number {
  const values = headers as
    | { get?: (name: string) => unknown; [key: string]: unknown }
    | undefined
  const raw = values?.get?.('x-total-count') ?? values?.['x-total-count']
  const total = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(total) && total >= 0 ? total : fallback
}

function toDimension(value: unknown): TeamCompetencyDimension | null {
  const record = asRecord(value)
  const dimensionId = asText(record?.dimension_id)
  if (!dimensionId) return null
  return {
    dimensionId,
    score: normalizeScore(record?.score),
    sampleCount: asCount(record?.sample_count),
  }
}

export function teamMemberDisplayId(memberId: string): string {
  const separatorIndex = memberId.lastIndexOf(':')
  const displayId = memberId.slice(separatorIndex + 1)
  return displayId || memberId
}

export function toTeamCompetencyRanking(
  dto: TeamCompetencyRankingDTO
): TeamCompetencyRanking | null {
  const memberId = asText(dto.member_id)
  if (!memberId) return null
  return {
    memberId,
    memberName: asText(dto.member_name),
    rank: Math.max(1, asCount(dto.rank)),
    averageScore: normalizeScore(dto.average_score),
    sampleCount: asCount(dto.sample_count),
    dimensions: dto.dimensions.flatMap((dimension) => {
      const normalized = toDimension(dimension)
      return normalized ? [normalized] : []
    }),
  }
}

export function toTeamScenarioRanking(
  dto: TeamScenarioRankingDTO
): TeamScenarioRanking | null {
  const scenarioId = asText(dto.scenario_id)
  const memberId = asText(dto.member_id)
  if (!scenarioId || !memberId) return null
  return {
    scenarioId,
    memberId,
    memberName: asText(dto.member_name),
    rank: Math.max(1, asCount(dto.rank)),
    completedSessions: asCount(dto.completed_sessions),
    scoredSessions: asCount(dto.scored_sessions),
    averageScore: normalizeScore(dto.average_score),
    lastPracticedAt: asText(dto.last_practiced_at),
  }
}

export function teamAnalyticsRequestErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { detail?: string | { message?: string }; message?: string }
      | undefined
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.message
    return detail || payload?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export async function listTeamCompetencyRankings(
  apiBase: string,
  request: TeamAnalyticsListRequest
): Promise<TeamAnalyticsPage<TeamCompetencyRanking>> {
  const response = await api.get<TalkWiseResponse<TeamCompetencyRankingDTO[]>>(
    teamAnalyticsApiUrl(apiBase, '/competencies', request),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const raw = requireTalkWiseData(response.data)
  const items = raw.flatMap((item) => {
    const ranking = toTeamCompetencyRanking(item)
    return ranking ? [ranking] : []
  })
  return { items, total: responseTotalCount(response.headers, items.length) }
}

export async function listTeamScenarioRankings(
  apiBase: string,
  request: TeamAnalyticsListRequest
): Promise<TeamAnalyticsPage<TeamScenarioRanking>> {
  const response = await api.get<TalkWiseResponse<TeamScenarioRankingDTO[]>>(
    teamAnalyticsApiUrl(apiBase, '/scenarios', request),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const raw = requireTalkWiseData(response.data)
  const items = raw.flatMap((item) => {
    const ranking = toTeamScenarioRanking(item)
    return ranking ? [ranking] : []
  })
  return { items, total: responseTotalCount(response.headers, items.length) }
}

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
  TrainingTeam,
  TrainingTeamAssignment,
  TrainingTeamAssignmentDTO,
  TrainingTeamDTO,
  TrainingTeamMember,
  TrainingTeamMemberDTO,
  TrainingTeamRole,
} from './types'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

interface NewAPIResponse<T> {
  success: boolean
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
const TRAINING_TEAMS_ADMIN_BASE = '/api/talkwise/admin/teams'
const TRAINING_TEAM_ASSIGNMENT_REQUIRED = 'TRAINING_TEAM_ASSIGNMENT_REQUIRED'

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

function requireNewAPIData<T>(response: NewAPIResponse<T>): T {
  if (!response.success || response.data === null) {
    throw new Error(response.message || 'Training team request failed')
  }
  return response.data
}

function asTrainingTeamRole(value: unknown): TrainingTeamRole | null {
  return value === 'owner' || value === 'admin' || value === 'member'
    ? value
    : null
}

function adminTeamUrl(teamId: string, path = ''): string {
  return `${TRAINING_TEAMS_ADMIN_BASE}/${encodeURIComponent(teamId)}${path}`
}

export function toTrainingTeam(dto: TrainingTeamDTO): TrainingTeam | null {
  const id = asText(dto.id)
  const name = asText(dto.name)
  if (!id || !name) return null
  return {
    id,
    name,
    createdTime: asCount(dto.created_time),
    updatedTime: asCount(dto.updated_time),
  }
}

export function toTrainingTeamMember(
  dto: TrainingTeamMemberDTO
): TrainingTeamMember | null {
  const username = asText(dto.username)
  if (!Number.isSafeInteger(dto.user_id) || dto.user_id <= 0 || !username) {
    return null
  }
  return {
    userId: dto.user_id,
    username,
    displayName: asText(dto.display_name),
    email: asText(dto.email),
    platformRole: Number.isSafeInteger(dto.platform_role)
      ? dto.platform_role
      : 0,
    status: Number.isSafeInteger(dto.status) ? dto.status : 0,
    gatewayGroup: asText(dto.gateway_group),
    teamRole: asTrainingTeamRole(dto.team_role),
    membershipTeamId: asText(dto.membership_team_id),
    membershipTeamName: asText(dto.membership_team_name),
  }
}

export interface TrainingTeamPage<T> {
  readonly items: T[]
  readonly total: number
}

export async function listTrainingTeams(): Promise<
  TrainingTeamPage<TrainingTeam>
> {
  const response = await api.get<
    NewAPIResponse<{ teams: TrainingTeamDTO[]; total: number }>
  >(TRAINING_TEAMS_ADMIN_BASE, {
    params: { start_index: 0, limit: 200 },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  const data = requireNewAPIData(response.data)
  const items = data.teams.flatMap((team) => {
    const normalized = toTrainingTeam(team)
    return normalized ? [normalized] : []
  })
  return { items, total: asCount(data.total) }
}

export async function getUserTrainingTeamAssignment(
  userId: number
): Promise<TrainingTeamAssignment | null> {
  const response = await api.get<
    NewAPIResponse<{ membership: TrainingTeamAssignmentDTO | null }>
  >(`/api/talkwise/admin/users/${userId}/training-team`, {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  const membership = requireNewAPIData(response.data).membership
  if (!membership) return null

  const teamId = asText(membership.team_id)
  const teamName = asText(membership.team_name)
  const teamRole = asTrainingTeamRole(membership.team_role)
  if (!teamId || !teamName || !teamRole) {
    throw new Error('Training team assignment response is invalid')
  }
  return { teamId, teamName, teamRole }
}

export async function createTrainingTeam(name: string): Promise<TrainingTeam> {
  const response = await api.post<NewAPIResponse<TrainingTeamDTO>>(
    TRAINING_TEAMS_ADMIN_BASE,
    { name: name.trim() },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const team = toTrainingTeam(requireNewAPIData(response.data))
  if (!team) throw new Error('Training team response is invalid')
  return team
}

export async function listTrainingTeamMembers(
  teamId: string
): Promise<TrainingTeamPage<TrainingTeamMember>> {
  const response = await api.get<
    NewAPIResponse<{ members: TrainingTeamMemberDTO[]; total: number }>
  >(adminTeamUrl(teamId, '/members'), {
    params: { start_index: 0, limit: 200 },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  const data = requireNewAPIData(response.data)
  const items = data.members.flatMap((member) => {
    const normalized = toTrainingTeamMember(member)
    return normalized ? [normalized] : []
  })
  return { items, total: asCount(data.total) }
}

export async function searchTrainingTeamUsers(
  teamId: string,
  keyword: string
): Promise<TrainingTeamPage<TrainingTeamMember>> {
  const response = await api.get<
    NewAPIResponse<{ users: TrainingTeamMemberDTO[]; total: number }>
  >(adminTeamUrl(teamId, '/users/search'), {
    params: { keyword: keyword.trim(), start_index: 0, limit: 50 },
    skipBusinessError: true,
    skipErrorHandler: true,
    disableDuplicate: true,
  })
  const data = requireNewAPIData(response.data)
  const items = data.users.flatMap((member) => {
    const normalized = toTrainingTeamMember(member)
    return normalized ? [normalized] : []
  })
  return { items, total: asCount(data.total) }
}

export async function addTrainingTeamMember(
  teamId: string,
  userId: number,
  role: TrainingTeamRole
): Promise<TrainingTeamMember> {
  const response = await api.post<NewAPIResponse<TrainingTeamMemberDTO>>(
    adminTeamUrl(teamId, '/members'),
    { user_id: userId, role },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const member = toTrainingTeamMember(requireNewAPIData(response.data))
  if (!member) throw new Error('Training team member response is invalid')
  return member
}

export async function removeTrainingTeamMember(
  teamId: string,
  userId: number
): Promise<void> {
  const response = await api.delete<NewAPIResponse<{ user_id: number }>>(
    adminTeamUrl(teamId, `/members/${userId}`),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  requireNewAPIData(response.data)
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
    scenarioCount: asCount(record?.scenario_count),
    state: record?.state === 'stable' ? 'stable' : 'exploring',
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

export function isTrainingTeamAssignmentRequired(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  const payload = error.response?.data as
    | {
        detail?: string | { code?: string; message?: string }
        error?: {
          details?: {
            detail?: { code?: string; message?: string }
          }
        }
      }
    | undefined
  const detail =
    payload?.detail != null && typeof payload.detail !== 'string'
      ? payload.detail
      : payload?.error?.details?.detail
  return detail?.code === TRAINING_TEAM_ASSIGNMENT_REQUIRED
}

export function retryTrainingTeamQuery(
  failureCount: number,
  error: unknown
): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0
    if (status >= 400 && status < 500) return false
  }
  return failureCount < 2
}

export function isTrainingTeamQueryLoading(
  enabled: boolean,
  isPending: boolean,
  isError: boolean
): boolean {
  return enabled && isPending && !isError
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

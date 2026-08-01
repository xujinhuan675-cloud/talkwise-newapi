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
  ReviewBranchContext,
  ReviewEvaluationState,
  ReviewReportState,
  ScenarioProgress,
  ScenarioProgressDTO,
  ScenarioProgressSummary,
  ScenarioProgressSummaryDTO,
  ScenarioScoreStatus,
  TrainingCompetencyRadar,
  TrainingCompetencyRadarDTO,
  TrainingSessionDTO,
  TrainingSessionMode,
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
  readonly scenarioId?: string | null
  readonly query?: string | null
  readonly mode?: TrainingSessionMode | null
  readonly source?: string | null
  readonly activityFrom?: string | null
  readonly activityTo?: string | null
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

function completionReportMetadata(
  metadata: Record<string, unknown> | null
): Record<string, unknown> | null {
  return asRecord(metadata?.completionReport ?? metadata?.completion_report)
}

export function getReviewReportState(input: {
  metadata?: Record<string, unknown> | null
  reportId?: string | null
}): ReviewReportState & { readonly reportId: string | null } {
  const completion = completionReportMetadata(asRecord(input.metadata))
  const metadataReportId = asText(completion?.reportId ?? completion?.report_id)
  const reportId = asText(input.reportId) ?? metadataReportId
  const status = asText(completion?.status)?.toLowerCase()
  const generation = asText(completion?.generation)
  const message = asText(
    completion?.message ?? completion?.error ?? completion?.error_message
  )
  const completedWithoutReport =
    completion?.completedWithoutReport === true ||
    completion?.completed_without_report === true

  if (reportId) {
    return {
      status: 'ready',
      reportId,
      generation,
      message: null,
      completedWithoutReport: false,
    }
  }
  if (status === 'pending') {
    return {
      status: 'pending',
      reportId: null,
      generation,
      message: null,
      completedWithoutReport: false,
    }
  }
  if (status === 'failed') {
    return {
      status: 'failed',
      reportId: null,
      generation,
      message,
      completedWithoutReport,
    }
  }
  if (status === 'ready') {
    return {
      status: 'unavailable',
      reportId: null,
      generation,
      message,
      completedWithoutReport,
    }
  }
  return {
    status: completedWithoutReport ? 'unavailable' : 'not_requested',
    reportId: null,
    generation,
    message,
    completedWithoutReport,
  }
}

export function getReviewEvaluationState(
  metadata?: Record<string, unknown> | null
): ReviewEvaluationState | null {
  const completion = completionReportMetadata(asRecord(metadata))
  const evaluation = asRecord(completion?.evaluation)
  const status = asText(evaluation?.status)?.toLowerCase()
  if (status !== 'failed' && status !== 'ready' && status !== 'unavailable') {
    return null
  }
  const rawOverallScore = evaluation?.overallScore ?? evaluation?.overall_score
  return {
    status,
    evaluationId: asText(evaluation?.evaluationId ?? evaluation?.evaluation_id),
    overallScore:
      typeof rawOverallScore === 'number' && Number.isFinite(rawOverallScore)
        ? rawOverallScore
        : null,
    message: asText(
      evaluation?.message ?? evaluation?.error ?? evaluation?.error_message
    ),
    retryable: evaluation?.retryable === true,
  }
}

function scenarioMetadata(
  session: TrainingSessionDTO
): Record<string, unknown> | null {
  const metadata = asRecord(session.task_config.metadata)
  return asRecord(metadata?.scenario_training)
}

function firstText(
  records: Record<string, unknown>[],
  keys: string[]
): string | null {
  for (const record of records) {
    for (const key of keys) {
      const text = asText(record[key])
      if (text) return text
    }
  }
  return null
}

function firstPositiveInteger(
  records: Record<string, unknown>[],
  keys: string[]
): number | null {
  for (const record of records) {
    for (const key of keys) {
      const value = Number(record[key])
      if (Number.isSafeInteger(value) && value > 0) return value
    }
  }
  return null
}

const BRANCH_RECORD_KEYS = [
  'messageTreeSelection',
  'message_tree_selection',
  'selectedPath',
  'selected_path',
  'currentBranchTail',
  'current_branch_tail',
  'branchContext',
  'branch_context',
  'conversation',
]
const BRANCH_ID_KEYS = ['branchId', 'branch_id']
const TAIL_ID_KEYS = [
  'selectedMessageId',
  'selected_message_id',
  'tailMessageId',
  'tail_message_id',
  'messageId',
  'message_id',
]
const PARENT_ID_KEYS = [
  'forkPointMessageId',
  'fork_point_message_id',
  'sourceMessageId',
  'source_message_id',
  'parentMessageId',
  'parent_message_id',
]

function branchRecords(metadata: Record<string, unknown>) {
  return [
    ...BRANCH_RECORD_KEYS.flatMap((key) => {
      const record = asRecord(metadata[key])
      return record ? [record] : []
    }),
    metadata,
  ]
}

function toReviewPathItem(
  value: unknown,
  defaultBranchId: string | null
): ReviewBranchContext['selectedPath'][number] | null {
  const id = asText(value)
  if (id && typeof value !== 'object') {
    return {
      publicId: id,
      role: '',
      content: '',
      branchId: defaultBranchId,
      parentMessageId: null,
    }
  }
  const record = asRecord(value)
  if (!record) return null
  const publicId = firstText(
    [record],
    ['publicId', 'public_id', 'messageId', 'message_id', 'id']
  )
  if (!publicId) return null
  return {
    publicId,
    role: firstText([record], ['role', 'speaker', 'sender']) ?? '',
    content: firstText([record], ['content', 'text', 'message']) ?? '',
    branchId: firstText([record], BRANCH_ID_KEYS) ?? defaultBranchId,
    parentMessageId: firstText([record], PARENT_ID_KEYS),
  }
}

function selectedReviewPath(records: Record<string, unknown>[]) {
  for (const record of records) {
    const branchId = firstText([record], BRANCH_ID_KEYS)
    const value =
      (Array.isArray(record.path) && record.path) ||
      (Array.isArray(record.messageIds) && record.messageIds) ||
      (Array.isArray(record.message_ids) && record.message_ids)
    if (!value) continue
    const path = value
      .map((item) => toReviewPathItem(item, branchId))
      .filter((item): item is NonNullable<typeof item> => item !== null)
    if (path.length > 0) return path
  }
  return []
}

function branchContextFromMetadata(
  metadata: Record<string, unknown>,
  source: ReviewBranchContext['source'],
  sourceDetail: string
): ReviewBranchContext | null {
  const records = branchRecords(metadata)
  const selectedPath = selectedReviewPath(records)
  const lastPathItem = selectedPath.at(-1)
  const branchId =
    firstText(records, BRANCH_ID_KEYS) ?? lastPathItem?.branchId ?? null
  const selectedTailMessageId =
    firstText(records, TAIL_ID_KEYS) ?? lastPathItem?.publicId ?? null
  const forkPointMessageId =
    firstText(records, PARENT_ID_KEYS) ?? lastPathItem?.parentMessageId ?? null
  const explicitPathCount = firstPositiveInteger(records, [
    'pathCount',
    'path_count',
  ])
  const pathCount = selectedPath.length || explicitPathCount
  const pathSummary = firstText(records, ['pathSummary', 'path_summary'])
  const lastReplyPreview = firstText(records, [
    'lastReplyPreview',
    'last_reply_preview',
  ])
  const hasPathReference = Boolean(
    selectedTailMessageId ||
    forkPointMessageId ||
    pathCount ||
    pathSummary ||
    lastReplyPreview
  )
  if (!hasPathReference && (!branchId || branchId === 'main')) return null
  let pathTextState: ReviewBranchContext['pathTextState'] = 'reference_only'
  if (selectedPath.length > 0) {
    pathTextState = selectedPath.some((item) => item.content)
      ? 'with_text'
      : 'id_only'
  }

  return {
    source,
    sourceDetail,
    provider: firstText(records, ['provider']),
    conversationId: firstText(records, ['conversationId', 'conversation_id']),
    branchId,
    selectedTailMessageId,
    forkPointMessageId,
    pathCount,
    pathSummary,
    lastReplyPreview,
    pathTextState,
    selectedPath,
  }
}

export function getReviewBranchContext(input: {
  session: Pick<ReviewSession, 'taskMetadata'>
  report?: TrainingSessionReportDTO | null
  progress?: Pick<ScenarioProgress, 'metadata'> | null
}): ReviewBranchContext | null {
  const sessionMetadata = asRecord(input.session.taskMetadata)
  const reportContent = asRecord(input.report?.content)
  const candidates: Array<{
    metadata: Record<string, unknown> | null
    source: ReviewBranchContext['source']
    sourceDetail: string
  }> = [
    {
      metadata: sessionMetadata,
      source: 'session',
      sourceDetail: 'session.task_config.metadata',
    },
    {
      metadata: asRecord(input.report?.metadata),
      source: 'report',
      sourceDetail: 'report.metadata',
    },
    {
      metadata: asRecord(reportContent?.metadata),
      source: 'report',
      sourceDetail: 'report.content.metadata',
    },
    {
      metadata: reportContent,
      source: 'report',
      sourceDetail: 'report.content',
    },
    {
      metadata: asRecord(input.progress?.metadata),
      source: 'progress',
      sourceDetail: 'progress.metadata',
    },
  ]
  for (const candidate of candidates) {
    if (!candidate.metadata) continue
    const context = branchContextFromMetadata(
      candidate.metadata,
      candidate.source,
      candidate.sourceDetail
    )
    if (context) return context
  }
  return null
}

export function progressForReviewSession(
  progress: ScenarioProgress[],
  sessionId: string
): ScenarioProgress | null {
  return progress.find((item) => item.sessionId === sessionId) ?? null
}

export function trainingReviewApiUrl(apiBase: string, path: string): string {
  const normalizedBase =
    apiBase.trim().replace(/\/+$/, '') || DEFAULT_TRAINING_API_BASE
  return `${normalizedBase}${path}`
}

export function trainingReviewListApiUrl(
  apiBase: string,
  path: string,
  request: TrainingListRequest
): string {
  const params = new URLSearchParams({
    skip: String(request.skip),
    limit: String(request.limit),
  })
  if (request.scenarioId?.trim()) {
    params.set('scenario_template_id', request.scenarioId.trim())
  }
  if (request.query?.trim()) {
    params.set('query', request.query.trim())
  }
  if (request.mode) {
    params.set('mode', request.mode)
  }
  if (request.source?.trim()) {
    params.set('source', request.source.trim())
  }
  if (request.activityFrom) {
    params.set('activity_from', request.activityFrom)
  }
  if (request.activityTo) {
    params.set('activity_to', request.activityTo)
  }
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

export type ReviewRequestAccessState =
  | 'forbidden'
  | 'request_error'
  | 'unauthorized'

export function reviewRequestAccessState(
  error: unknown
): ReviewRequestAccessState {
  if (!axios.isAxiosError(error)) return 'request_error'
  if (error.response?.status === 401) return 'unauthorized'
  if (error.response?.status === 403) return 'forbidden'
  return 'request_error'
}

export function toReviewSession(session: TrainingSessionDTO): ReviewSession {
  const metadata = scenarioMetadata(session)
  const taskMetadata = asRecord(session.task_config.metadata)
  const reportState = getReviewReportState({
    metadata: taskMetadata,
    reportId: session.report_id,
  })
  const evaluationState = getReviewEvaluationState(taskMetadata)
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
    trainingSource:
      asText(
        taskMetadata?.training_source ??
          taskMetadata?.trainingSource ??
          taskMetadata?.source
      ) ?? null,
    status: session.status,
    messageCount: session.message_count,
    roomId:
      session.room_id === null || session.room_id === undefined
        ? null
        : String(session.room_id),
    startedAt: session.started_at ?? null,
    completedAt: session.completed_at ?? null,
    reportId: reportState.reportId,
    reportState,
    evaluationState,
    failureReason: session.failure_reason ?? null,
    score: null,
    scoreStatus: 'pending',
    progressLinked: false,
    taskMetadata,
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
    metadata: asRecord(dto.metadata),
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
      progressLinked: true,
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
    trainingReviewListApiUrl(apiBase, '/sessions', request),
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
    trainingReviewListApiUrl(apiBase, '/scenario-progress', request),
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

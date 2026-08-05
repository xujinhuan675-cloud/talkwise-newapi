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

import { trainingApiUrl } from '../scenarios/api'
import {
  trainingPlanMetadata,
  trainingTurnBudget,
  type TrainingLengthProfile,
  type TrainingPressure,
} from '../training-plan'
import type { RealtimeProfile } from './realtime-client'

export type TrainingStudioMode = 'realtime' | 'text' | 'voice' | 'video'
export type TrainingFeedbackMode = 'simulation' | 'assisted' | 'drill'
export type RealtimeProviderChoice = 'doubao' | 'hybrid' | 'openai'
export type { RealtimeProfile } from './realtime-client'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

export interface TrainingSession {
  sessionId: string
  roomId: string | null
  conversationId: string | null
  status: 'created' | 'active' | 'completed' | 'failed'
  mode: TrainingStudioMode
  feedbackMode?: TrainingFeedbackMode
  realtimeProfile?: RealtimeProfile
  realtimeProvider?: string
}

export type RoomBackedTrainingSession = TrainingSession & {
  roomId: string
  mode: Exclude<TrainingStudioMode, 'text'>
}

export interface GuidanceEvent {
  eventType: string
  severity: string
  title: string
  message: string
  suggestedText?: string
}

export interface GuidanceSnapshot {
  sessionId: string
  events: GuidanceEvent[]
  source?: string
  totalTurnCount?: number
}

export interface StudioLaunchInput {
  role: string
  goal: string
  mode: TrainingStudioMode
  feedbackMode: TrainingFeedbackMode
  pressure?: TrainingPressure
  lengthProfile?: TrainingLengthProfile
  realtimeProfile?: RealtimeProfile
  realtimeProvider?: RealtimeProviderChoice
  liveCoach?: {
    sourceLanguage: string
    targetLanguage: string
  }
}

export interface RealtimeReadiness {
  ready: boolean
  message: string
  provider: string
}

export interface TrainingSessionDTO {
  session_id: string
  room_id?: string | number | null
  conversation?: {
    conversationId?: string | number | null
  }
  task_config: {
    role: string
    level: string
    tech_stack: string[]
    question_type_ratios: Record<string, number>
    question_count: number
    framework: string
    difficulty: string
    category: string
    rubric_version?: string
    rubric_weights?: Record<string, number>
    metadata?: Record<string, unknown> | null
  }
  scenario_template_id?: string | null
  status: TrainingSession['status']
  mode: TrainingStudioMode
}

interface GuidanceSnapshotDTO {
  session_id: string
  events: Array<{
    event_type: string
    severity: string
    title: string
    message: string
    suggested_text?: string
  }>
  source?: string
  total_turn_count?: number
}

function requireTrainingData<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message || 'Training request failed')
  }
  return response.data
}

export function normalizeTrainingSession(
  session: TrainingSessionDTO
): TrainingSession {
  const feedbackMode = metadataText(session.task_config.metadata?.feedbackMode)
  const realtimeProfile = metadataText(
    session.task_config.metadata?.realtimeProfile
  )
  return {
    sessionId: session.session_id,
    roomId: session.room_id == null ? null : String(session.room_id),
    conversationId:
      session.conversation?.conversationId == null
        ? null
        : String(session.conversation.conversationId),
    status: session.status,
    mode: session.mode,
    feedbackMode:
      feedbackMode === 'simulation' ||
      feedbackMode === 'assisted' ||
      feedbackMode === 'drill'
        ? feedbackMode
        : undefined,
    realtimeProfile:
      realtimeProfile === 'cascade' || realtimeProfile === 'speech_to_speech'
        ? realtimeProfile
        : undefined,
    realtimeProvider:
      metadataText(session.task_config.metadata?.realtimeProvider) ?? undefined,
  }
}

export function isRoomBackedTrainingSession(
  session: TrainingSession | null
): session is RoomBackedTrainingSession {
  return Boolean(session?.roomId && session.mode !== 'text')
}

const HANDOFF_RESET_METADATA_TOKENS = new Set([
  'authscope',
  'branchid',
  'branchpolicy',
  'branchstate',
  'completed',
  'completedat',
  'completion',
  'completionreport',
  'completionstatus',
  'conversationid',
  'conversationruntimecontract',
  'createdbyuserid',
  'currentbranchtail',
  'failurereason',
  'liveguidancehistory',
  'liveguidancepersistence',
  'messagebody',
  'messagetreeselection',
  'overallscore',
  'ownerteamid',
  'owneruserid',
  'report',
  'reportid',
  'roomid',
  'runtime',
  'score',
  'scoreid',
  'scorestatus',
  'selectedpath',
  'sourcepath',
  'teamid',
  'trainingcompleted',
  'trainingcompletedat',
  'trainingcompletion',
  'trainingcompletionstatus',
  'trainingsessionid',
  'userid',
  'iscomplete',
])

function metadataToken(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, '')
}

function metadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function metadataText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

function metadataTextList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => metadataText(item))
        .filter((item): item is string => item !== null)
    : []
}

function realtimeRuntimeDifficulty(value: string): 'easy' | 'hard' | 'normal' {
  if (value === 'easy') return 'easy'
  if (value === 'hard' || value === 'expert') return 'hard'
  return 'normal'
}

function realtimeHandoffMetadata(
  source: TrainingSessionDTO
): Record<string, unknown> {
  const sourceMetadata = source.task_config.metadata ?? {}
  const cleaned = Object.fromEntries(
    Object.entries(sourceMetadata).filter(
      ([key]) => !HANDOFF_RESET_METADATA_TOKENS.has(metadataToken(key))
    )
  )
  const sourceKind = metadataText(sourceMetadata.source)
  const scenarioTraining = metadataRecord(cleaned.scenario_training)

  return {
    ...cleaned,
    ...(scenarioTraining
      ? {
          scenario_training: {
            ...scenarioTraining,
            trainingMode: 'realtime',
            interactionMode: 'realtime',
          },
        }
      : {}),
    source: 'conversation_realtime_handoff',
    ...(sourceKind ? { sourceTrainingOrigin: sourceKind } : {}),
    sourceTrainingSessionId: source.session_id,
    trainingMode: 'realtime',
    interactionMode: 'realtime',
    realtimeProfile: 'cascade',
    latencyProfile: 'near_realtime',
  }
}

export function buildRealtimeHandoffSessionRequest(source: TrainingSessionDTO) {
  return {
    mode: 'realtime' as const,
    scenario_template_id: source.scenario_template_id ?? undefined,
    task_config: {
      role: source.task_config.role,
      level: source.task_config.level,
      tech_stack: [...source.task_config.tech_stack],
      question_type_ratios: {
        ...source.task_config.question_type_ratios,
      },
      question_count: source.task_config.question_count,
      framework: source.task_config.framework,
      difficulty: source.task_config.difficulty,
      category: source.task_config.category,
      ...(source.task_config.rubric_version
        ? { rubric_version: source.task_config.rubric_version }
        : {}),
      ...(source.task_config.rubric_weights
        ? { rubric_weights: { ...source.task_config.rubric_weights } }
        : {}),
      metadata: realtimeHandoffMetadata(source),
    },
  }
}

export function buildRealtimeHandoffStartRequest(source: TrainingSessionDTO) {
  const metadata = source.task_config.metadata ?? {}
  const scenario = metadataRecord(metadata.scenario_training)
  const persona =
    metadataRecord(scenario?.persona) ??
    metadataRecord(metadata.counterpartPersona) ??
    metadataRecord(metadata.runtimePersona)
  const scenarioTitle =
    metadataText(scenario?.title) || source.task_config.tech_stack[0]
  const openingLine =
    metadataText(scenario?.opening_line) ||
    metadataText(scenario?.openingLine) ||
    metadataText(metadata.openingLine)
  const trainingPoints =
    metadataTextList(scenario?.training_points).length > 0
      ? metadataTextList(scenario?.training_points)
      : source.task_config.tech_stack
          .filter((item) => !item.startsWith('category:'))
          .filter((item) => !item.startsWith('opening:'))
          .slice(0, 5)
  const scenarioContext = [
    metadataText(scenario?.description),
    metadataText(scenario?.customer_profile),
  ]
    .filter((item): item is string => item !== null)
    .join('\n')

  return {
    room_name: `Training: ${scenarioTitle || source.task_config.role}`,
    room_type: 'battle_prep' as const,
    runtime_persona: {
      name: metadataText(persona?.name) || 'Training counterpart',
      role: metadataText(persona?.role) || 'Scenario counterpart',
      style:
        metadataText(persona?.style) ||
        'Stay in role, ask focused follow-up questions, and keep the exchange realistic.',
      scenario_context:
        scenarioContext || scenarioTitle || source.task_config.role,
      training_points: trainingPoints,
      difficulty: realtimeRuntimeDifficulty(source.task_config.difficulty),
    },
    ...(openingLine
      ? {
          opening_message: {
            content: openingLine,
            metadata: {
              source: 'scenario_training_opening',
              sourceTrainingSessionId: source.session_id,
              trainingMode: 'realtime',
            },
          },
        }
      : {}),
  }
}

export class RealtimeTrainingHandoffError extends Error {
  readonly sessionId: string

  constructor(sessionId: string, error: unknown) {
    super(
      trainingStudioErrorMessage(
        error,
        'The realtime training session could not be started.'
      )
    )
    this.name = 'RealtimeTrainingHandoffError'
    this.sessionId = sessionId
  }
}

function normalizeGuidance(snapshot: GuidanceSnapshotDTO): GuidanceSnapshot {
  return {
    sessionId: snapshot.session_id,
    events: snapshot.events.map((event) => ({
      eventType: event.event_type,
      severity: event.severity,
      title: event.title,
      message: event.message,
      suggestedText: event.suggested_text,
    })),
    source: snapshot.source,
    totalTurnCount: snapshot.total_turn_count,
  }
}

function studioPersona(input: StudioLaunchInput) {
  const role = input.role.trim() || 'Learner'
  const goal = input.goal.trim() || `Practice a ${role} conversation.`
  let difficulty: 'easy' | 'normal' | 'hard' = 'normal'
  if (input.pressure === 'easy') difficulty = 'easy'
  if (input.pressure === 'hard') difficulty = 'hard'

  return {
    name:
      input.mode === 'voice' || input.mode === 'realtime'
        ? 'Voice practice partner'
        : 'Practice partner',
    role: 'Training counterpart',
    style:
      'Keep the conversation focused, ask one clear follow-up at a time, and respond in role.',
    scenario_context: goal,
    training_points: [
      'State the objective clearly',
      'Ask useful follow-up questions',
      'Close with a concrete next step',
    ],
    difficulty,
  }
}

export function realtimeProviderRuntime(
  choice: RealtimeProviderChoice | undefined
): 'openai' | 'volcengine.doubao_realtime' {
  if (choice === 'hybrid') {
    throw new Error(
      'Mixed Doubao and OpenAI realtime routing is not configured'
    )
  }
  return choice === 'doubao' ? 'volcengine.doubao_realtime' : 'openai'
}

export function buildStudioSessionRequest(input: StudioLaunchInput) {
  const role = input.role.trim() || 'Learner'
  const goal = input.goal.trim() || `Practice a ${role} conversation.`
  const pressure = input.pressure ?? 'medium'
  const lengthProfile = input.lengthProfile ?? 'standard'

  return {
    mode: input.mode,
    task_config: {
      role,
      level: 'standard',
      tech_stack: ['communication', `feedback:${input.feedbackMode}`],
      question_type_ratios: {
        discovery: 34,
        structure: 33,
        delivery: 33,
      },
      question_count: trainingTurnBudget(lengthProfile),
      framework: 'prep',
      difficulty: pressure,
      category: 'workplace',
      metadata: {
        source: 'newapi_training_studio',
        counterpartPersona: studioPersona(input),
        trainingMode: input.mode,
        interactionMode: input.mode === 'realtime' ? 'realtime' : 'turn_based',
        feedbackMode: input.feedbackMode,
        trainingGoal: goal,
        trainingPlan: trainingPlanMetadata({
          focusScope: 'custom',
          selectedFocus: [goal],
          pressure,
          lengthProfile,
        }),
        ...(input.mode === 'realtime'
          ? {
              realtimeProfile: input.realtimeProfile || 'cascade',
              realtimeProviderChoice: input.realtimeProvider || 'openai',
              realtimeProvider: realtimeProviderRuntime(input.realtimeProvider),
              latencyProfile:
                input.realtimeProfile === 'speech_to_speech'
                  ? 'true_realtime'
                  : 'near_realtime',
            }
          : {}),
        ...(input.liveCoach
          ? {
              liveCoach: {
                sourceLanguage: input.liveCoach.sourceLanguage,
                targetLanguage: input.liveCoach.targetLanguage,
                captureStrategy: 'newapi_manual_turns',
                transcriptStrategy: 'guidance_request_turns',
              },
            }
          : {}),
      },
    },
  }
}

export function buildStudioStartRequest(input: StudioLaunchInput) {
  const openingMessage = {
    content: `Let's begin. ${input.goal.trim() || 'What would you like to practice?'}`,
    metadata: { source: 'newapi_training_studio' },
  }
  if (input.mode === 'text') {
    return {
      runtime: 'conversation_message_tree' as const,
      opening_message: openingMessage,
    }
  }

  const persona = studioPersona(input)

  return {
    room_name: `Training: ${input.role.trim() || 'Practice'}`,
    room_type: 'battle_prep' as const,
    runtime_persona: persona,
    opening_message: openingMessage,
  }
}

export function buildLiveCoachSessionInput(input: {
  goal: string
  sourceLanguage: string
  targetLanguage: string
}): StudioLaunchInput {
  const goal =
    input.goal.trim() || 'Practice a concise response with live coaching.'
  const languageContext = `Source language: ${input.sourceLanguage.trim() || 'default'}; target language: ${input.targetLanguage.trim() || 'default'}.`

  return {
    role: 'Live coaching learner',
    goal: `${goal}\n${languageContext}`,
    mode: 'voice',
    feedbackMode: 'assisted',
    liveCoach: {
      sourceLanguage: input.sourceLanguage.trim() || 'default',
      targetLanguage: input.targetLanguage.trim() || 'default',
    },
  }
}

export async function launchTrainingSession(
  apiBase: string,
  input: StudioLaunchInput
): Promise<TrainingSession> {
  const createdResponse = await api.post<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(apiBase, '/sessions'),
    buildStudioSessionRequest(input),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  const created = normalizeTrainingSession(
    requireTrainingData(createdResponse.data)
  )
  const startedResponse = await api.post<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(apiBase, `/sessions/${created.sessionId}/start`),
    buildStudioStartRequest(input),
    { skipBusinessError: true, skipErrorHandler: true }
  )

  return normalizeTrainingSession(requireTrainingData(startedResponse.data))
}

async function getTrainingSessionDTO(
  apiBase: string,
  sessionId: string
): Promise<TrainingSessionDTO> {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) {
    throw new Error('training session id cannot be empty')
  }
  const response = await api.get<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(
      apiBase,
      `/sessions/${encodeURIComponent(normalizedSessionId)}`
    ),
    { skipBusinessError: true, skipErrorHandler: true }
  )

  return requireTrainingData(response.data)
}

export async function getTrainingSession(
  apiBase: string,
  sessionId: string
): Promise<TrainingSession> {
  return normalizeTrainingSession(
    await getTrainingSessionDTO(apiBase, sessionId)
  )
}

export async function launchRealtimeTrainingHandoff(
  apiBase: string,
  sourceSessionId: string,
  retrySessionId?: string | null
): Promise<TrainingSession> {
  const source = await getTrainingSessionDTO(apiBase, sourceSessionId)
  if (source.mode !== 'text') {
    throw new Error('Only a text training session can start this handoff.')
  }

  let realtimeSessionId = retrySessionId?.trim() || ''
  if (!realtimeSessionId) {
    const createdResponse = await api.post<
      TalkWiseResponse<TrainingSessionDTO>
    >(
      trainingApiUrl(apiBase, '/sessions'),
      buildRealtimeHandoffSessionRequest(source),
      { skipBusinessError: true, skipErrorHandler: true }
    )
    realtimeSessionId = requireTrainingData(createdResponse.data).session_id
  }

  try {
    const startedResponse = await api.post<
      TalkWiseResponse<TrainingSessionDTO>
    >(
      trainingApiUrl(
        apiBase,
        `/sessions/${encodeURIComponent(realtimeSessionId)}/start`
      ),
      buildRealtimeHandoffStartRequest(source),
      { skipBusinessError: true, skipErrorHandler: true }
    )
    return normalizeTrainingSession(requireTrainingData(startedResponse.data))
  } catch (error) {
    throw new RealtimeTrainingHandoffError(realtimeSessionId, error)
  }
}

export async function requestLiveGuidance(
  apiBase: string,
  input: {
    sessionId: string
    goal: string
    speaker: 'user' | 'counterpart'
    text: string
  }
): Promise<GuidanceSnapshot> {
  const response = await api.post<TalkWiseResponse<GuidanceSnapshotDTO>>(
    trainingApiUrl(apiBase, `/sessions/${input.sessionId}/guidance`),
    {
      task_goal: input.goal.trim() || undefined,
      recent_turns: [{ speaker: input.speaker, text: input.text.trim() }],
    },
    { skipBusinessError: true, skipErrorHandler: true }
  )

  return normalizeGuidance(requireTrainingData(response.data))
}

export async function persistLiveGuidance(
  apiBase: string,
  input: { sessionId: string; snapshot: GuidanceSnapshot }
): Promise<void> {
  if (input.snapshot.events.length === 0) return

  await api.post(
    trainingApiUrl(apiBase, `/sessions/${input.sessionId}/guidance-events`),
    {
      source: 'newapi_live_coach',
      reason: 'manual_turn',
      total_turn_count: input.snapshot.totalTurnCount,
      events: input.snapshot.events.map((event) => ({
        event_type: event.eventType,
        severity: event.severity,
        title: event.title,
        message: event.message,
        suggested_text: event.suggestedText,
      })),
    },
    { skipBusinessError: true, skipErrorHandler: true }
  )
}

export function normalizeRealtimeReadiness(
  payload: unknown
): RealtimeReadiness {
  const data = payload as {
    active?: { readyForCall?: boolean; error?: string; provider?: string }
    activeProvider?: string
    pipecat?: { readyForCall?: boolean; error?: string; provider?: string }
    providers?: {
      [provider: string]:
        | { readyForCall?: boolean; error?: string; provider?: string }
        | undefined
    }
  }
  const provider = data.activeProvider || data.active?.provider || 'pipecat'
  const active =
    data.active ??
    data.providers?.[provider] ??
    data.pipecat ??
    data.providers?.pipecat
  const ready = active?.readyForCall === true

  return {
    ready,
    provider: active?.provider || provider,
    message:
      active?.error ||
      (ready
        ? 'The realtime provider reports that it is ready for a call.'
        : 'The realtime provider is not ready for a call.'),
  }
}

export async function getRealtimeReadiness(
  apiBase: string
): Promise<RealtimeReadiness> {
  try {
    const response = await api.get<TalkWiseResponse<unknown>>(
      trainingApiUrl(apiBase, '/realtime/capabilities'),
      { skipBusinessError: true, skipErrorHandler: true }
    )
    return normalizeRealtimeReadiness(requireTrainingData(response.data))
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 403) {
      return {
        ready: false,
        provider: 'configured',
        message: 'Realtime readiness is available to training operators only.',
      }
    }
    throw error
  }
}

export function trainingStudioErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as
      | { detail?: string; message?: string }
      | undefined
    return body?.detail || body?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

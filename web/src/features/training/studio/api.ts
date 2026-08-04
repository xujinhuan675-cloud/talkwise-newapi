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

interface TrainingSessionDTO {
  session_id: string
  room_id?: string | number | null
  conversation?: {
    conversationId?: string | number | null
  }
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

function normalizeSession(session: TrainingSessionDTO): TrainingSession {
  return {
    sessionId: session.session_id,
    roomId: session.room_id == null ? null : String(session.room_id),
    conversationId:
      session.conversation?.conversationId == null
        ? null
        : String(session.conversation.conversationId),
    status: session.status,
    mode: session.mode,
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
      framework: 'talkwise',
      difficulty: pressure,
      category: 'workplace',
      metadata: {
        source: 'newapi_training_studio',
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
  if (input.mode === 'text') {
    return { runtime: 'conversation_message_tree' as const }
  }

  const persona = studioPersona(input)

  return {
    room_name: `Training: ${input.role.trim() || 'Practice'}`,
    room_type: 'battle_prep' as const,
    runtime_persona: persona,
    opening_message: {
      content: `Let's begin. ${input.goal.trim() || 'What would you like to practice?'}`,
      metadata: { source: 'newapi_training_studio' },
    },
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
  const created = normalizeSession(requireTrainingData(createdResponse.data))
  const startedResponse = await api.post<TalkWiseResponse<TrainingSessionDTO>>(
    trainingApiUrl(apiBase, `/sessions/${created.sessionId}/start`),
    buildStudioStartRequest(input),
    { skipBusinessError: true, skipErrorHandler: true }
  )

  return normalizeSession(requireTrainingData(startedResponse.data))
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

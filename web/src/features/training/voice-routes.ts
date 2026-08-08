import { getModels } from '@/features/models/api'
import { getUserGroups, getUserModels } from '@/features/playground/api'
import { api } from '@/lib/http-client'

import { trainingApiUrl } from './scenarios/api'

export type VoiceRouteMode = 'cascade' | 'speech_to_speech'

export interface VoiceRouteService {
  provider: string
  model: string
  voice?: string | null
}

export interface VoiceRoute {
  id: string
  name: string
  description: string
  mode: VoiceRouteMode
  enabled: boolean
  default: boolean
  revision: number
  stt?: VoiceRouteService | null
  llm?: VoiceRouteService | null
  tts?: VoiceRouteService | null
  realtime?: VoiceRouteService | null
  inputSampleRate: number
  outputSampleRate: number
  latencyProfile: string
  costProfile: string
}

export interface VoiceRouteConfig {
  version: number
  routes: VoiceRoute[]
  updatedAt: string
}

export interface TrainingModelOption {
  label: string
  value: string
}

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

export async function listTrainingVoiceRoutes(
  apiBase: string
): Promise<VoiceRoute[]> {
  const response = await api.get<TalkWiseResponse<VoiceRoute[]>>(
    trainingApiUrl(apiBase, '/voice-routes'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  if (response.data.code !== 0 || response.data.data === null) {
    throw new Error(response.data.message || 'Voice routes could not be loaded')
  }
  return response.data.data
}

/** Load the platform's configured model catalog for admin-managed presets. */
export async function listTrainingModelOptions(): Promise<
  TrainingModelOption[]
> {
  const unique = new Map<string, TrainingModelOption>()

  const [catalogResult, groupsResult] = await Promise.allSettled([
    getModels({ p: 1, page_size: 1000, status: '1' }),
    getUserGroups(),
  ])
  if (catalogResult.status === 'fulfilled') {
    catalogResult.value.data?.items.forEach((model) => {
      if (model.model_name && !unique.has(model.model_name)) {
        unique.set(model.model_name, {
          label: model.model_name,
          value: model.model_name,
        })
      }
    })
  }

  const groups = groupsResult.status === 'fulfilled' ? groupsResult.value : []
  const groupModels = await Promise.allSettled(
    groups.map((group) => getUserModels(group.value, 'openai'))
  )
  groupModels.forEach((result) => {
    if (result.status !== 'fulfilled') return
    result.value.forEach((model) => {
      if (!unique.has(model.value)) {
        unique.set(model.value, { label: model.label, value: model.value })
      }
    })
  })

  return [...unique.values()].sort((left, right) =>
    left.label.localeCompare(right.label)
  )
}

export async function getTrainingVoiceRouteConfig(
  apiBase: string
): Promise<VoiceRouteConfig> {
  const response = await api.get<TalkWiseResponse<VoiceRouteConfig>>(
    trainingApiUrl(apiBase, '/voice-route-config'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  if (response.data.code !== 0 || response.data.data === null) {
    throw new Error(
      response.data.message || 'Voice route configuration could not be loaded'
    )
  }
  return response.data.data
}

export async function saveTrainingVoiceRouteConfig(
  apiBase: string,
  config: VoiceRouteConfig
): Promise<VoiceRouteConfig> {
  const response = await api.put<TalkWiseResponse<VoiceRouteConfig>>(
    trainingApiUrl(apiBase, '/voice-route-config'),
    config,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  if (response.data.code !== 0 || response.data.data === null) {
    throw new Error(
      response.data.message || 'Voice route configuration could not be saved'
    )
  }
  return response.data.data
}

import { getModels } from '@/features/models/api'
import { getUserGroups, getUserModels } from '@/features/playground/api'
import { api } from '@/lib/http-client'

import { trainingApiUrl } from './scenarios/api'

export type VoiceRouteMode = 'cascade' | 'speech_to_speech'
export type VoiceRouteAdapterStatus = 'runtime_integrated' | 'inventory_only'
export type VoiceRouteInteractionMode = 'turn_based' | 'realtime'
export type VoiceRoutePresetGroup = 'cascade' | 'native_voice' | 'curated_demo'

export interface VoiceRouteReadiness {
  status: 'ready' | 'blocked'
  ready: boolean
  code?: string | null
  reason?: string | null
  missingCredentials: string[]
  missingDependencies: string[]
}

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
  adapterStatus: VoiceRouteAdapterStatus
  interactionModes: VoiceRouteInteractionMode[]
  presetGroup?: VoiceRoutePresetGroup
  credentialEnv: string[]
  stt?: VoiceRouteService | null
  llm?: VoiceRouteService | null
  tts?: VoiceRouteService | null
  realtime?: VoiceRouteService | null
  openingTts?: VoiceRouteService | null
  inputSampleRate: number
  outputSampleRate: number
  latencyProfile: string
  costProfile: string
  readiness?: VoiceRouteReadiness
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

export function voiceRouteSupportsInteraction(
  route: VoiceRoute,
  mode: VoiceRouteInteractionMode
): boolean {
  if (route.interactionModes?.length) {
    return route.interactionModes.includes(mode)
  }
  return mode === 'realtime' || route.mode === 'cascade'
}

export function voiceRoutePresetGroup(
  route: VoiceRoute
): VoiceRoutePresetGroup {
  if (route.presetGroup) return route.presetGroup
  if (route.adapterStatus === 'inventory_only') return 'curated_demo'
  return route.mode === 'cascade' ? 'cascade' : 'native_voice'
}

export function voiceRouteIsReady(route: VoiceRoute): boolean {
  return route.readiness?.ready !== false
}

export function voiceRouteDisabledReason(
  route: VoiceRoute,
  localize: (english: string, chinese: string) => string
): string | undefined {
  if (voiceRouteIsReady(route)) return undefined
  if (route.readiness?.code === 'VOICE_ROUTE_ADAPTER_NOT_INTEGRATED') {
    return localize(
      'Unavailable: runtime adapter not integrated',
      '暂不可用：运行适配器尚未接入'
    )
  }
  return localize(
    'Unavailable: provider configuration is incomplete',
    '暂不可用：服务商配置不完整'
  )
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

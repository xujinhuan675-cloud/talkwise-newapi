import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  ModelSelector,
  type ModelOption,
} from '@/components/model-group-selector'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { useTrainingHost } from '../host'
import { trainingVoiceRouteLocalizedName } from '../training-display-labels'
import {
  getTrainingVoiceRouteConfig,
  listTrainingModelOptions,
  saveTrainingVoiceRouteConfig,
  type VoiceRoute,
  type VoiceRouteConfig,
  type VoiceRouteMode,
} from '../voice-routes'

type Localize = (english: string, chinese: string) => string

const FALLBACK_VOICE_OPTIONS = [
  'alloy',
  'ash',
  'ballad',
  'cedar',
  'coral',
  'echo',
  'marin',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
]

function mergeModelOptions(
  options: readonly ModelOption[],
  values: readonly string[]
): ModelOption[] {
  const merged = new Map<string, ModelOption>()
  options.forEach((option) => {
    if (option.value.trim()) merged.set(option.value, option)
  })
  values.forEach((value) => {
    const normalized = value.trim()
    if (normalized && !merged.has(normalized)) {
      merged.set(normalized, { label: normalized, value: normalized })
    }
  })
  return [...merged.values()]
}

function newVoiceRoute(localize: Localize): VoiceRoute {
  const id = `voice-route-${Date.now().toString(36)}`
  return {
    id,
    name: localize('New voice preset', '新的语音预设'),
    description: '',
    mode: 'cascade',
    enabled: true,
    default: false,
    revision: 1,
    adapterStatus: 'runtime_integrated',
    interactionModes: ['turn_based', 'realtime'],
    credentialEnv: [],
    stt: { provider: 'openai', model: 'gpt-4o-mini-transcribe' },
    llm: { provider: 'openai', model: 'gpt-4.1-mini' },
    tts: { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'marin' },
    inputSampleRate: 16000,
    outputSampleRate: 24000,
    latencyProfile: 'near_realtime',
    costProfile: 'configured',
  }
}

function routeForMode(route: VoiceRoute, mode: VoiceRouteMode): VoiceRoute {
  if (mode === 'cascade') {
    return {
      ...route,
      mode,
      interactionModes: ['turn_based', 'realtime'],
      stt: route.stt ?? { provider: 'openai', model: 'gpt-4o-mini-transcribe' },
      llm: route.llm ?? { provider: 'openai', model: 'gpt-4.1-mini' },
      tts: route.tts ?? {
        provider: 'openai',
        model: 'gpt-4o-mini-tts',
        voice: 'marin',
      },
      realtime: null,
      inputSampleRate: 16000,
      latencyProfile: 'near_realtime',
    }
  }
  return {
    ...route,
    mode,
    interactionModes: ['realtime'],
    stt: null,
    llm: null,
    tts: null,
    realtime: route.realtime ?? {
      provider: 'openai',
      model: 'gpt-realtime',
      voice: 'marin',
    },
    inputSampleRate: 24000,
    latencyProfile: 'true_realtime',
  }
}

export function VoiceRouteSettings({
  canManage,
  localize,
}: {
  canManage: boolean
  localize: Localize
}) {
  const host = useTrainingHost()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<VoiceRouteConfig | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const queryKey = ['training', 'voice-route-config', host.apiBase]
  const configQuery = useQuery({
    queryKey,
    queryFn: () => getTrainingVoiceRouteConfig(host.apiBase),
    enabled: host.authStatus === 'authenticated',
  })
  useEffect(() => {
    if (!configQuery.data) return
    setDraft(configQuery.data)
    setSelectedId((current) =>
      configQuery.data.routes.some((route) => route.id === current)
        ? current
        : (configQuery.data.routes[0]?.id ?? '')
    )
  }, [configQuery.data])
  const saveMutation = useMutation({
    mutationFn: (config: VoiceRouteConfig) =>
      saveTrainingVoiceRouteConfig(host.apiBase, config),
    onSuccess: (config) => {
      setDraft(config)
      queryClient.setQueryData(queryKey, config)
      void queryClient.invalidateQueries({
        queryKey: ['training', 'voice-routes', host.apiBase],
      })
    },
  })
  const selectedRoute = useMemo(
    () => draft?.routes.find((route) => route.id === selectedId) ?? null,
    [draft, selectedId]
  )
  const modelCatalogQuery = useQuery({
    queryKey: ['training', 'voice-route-models', host.apiBase],
    queryFn: listTrainingModelOptions,
    enabled: host.authStatus === 'authenticated',
  })
  const modelOptions = useMemo(
    () =>
      mergeModelOptions(
        modelCatalogQuery.data ?? [],
        selectedRoute
          ? [
              selectedRoute.stt?.model ?? '',
              selectedRoute.llm?.model ?? '',
              selectedRoute.tts?.model ?? '',
              selectedRoute.realtime?.model ?? '',
            ]
          : []
      ),
    [modelCatalogQuery.data, selectedRoute]
  )
  const voiceOptions = useMemo(
    () =>
      mergeModelOptions(
        FALLBACK_VOICE_OPTIONS.map((value) => ({ label: value, value })),
        [selectedRoute?.tts?.voice ?? '', selectedRoute?.realtime?.voice ?? '']
      ),
    [selectedRoute]
  )
  const updateSelected = (updater: (route: VoiceRoute) => VoiceRoute) => {
    saveMutation.reset()
    setDraft((current) =>
      current
        ? {
            ...current,
            routes: current.routes.map((route) =>
              route.id === selectedId ? updater(route) : route
            ),
            updatedAt: new Date().toISOString(),
          }
        : current
    )
  }
  const addRoute = () => {
    const route = newVoiceRoute(localize)
    setDraft((current) =>
      current
        ? {
            ...current,
            routes: [...current.routes, route],
            updatedAt: new Date().toISOString(),
          }
        : current
    )
    setSelectedId(route.id)
  }
  const removeRoute = () => {
    setDraft((current) => {
      if (!current) return current
      const routes = current.routes.filter((route) => route.id !== selectedId)
      setSelectedId(routes[0]?.id ?? '')
      return { ...current, routes, updatedAt: new Date().toISOString() }
    })
  }

  if (configQuery.isPending) {
    return (
      <div className='text-muted-foreground flex min-h-32 items-center justify-center text-sm'>
        <LoaderCircle className='mr-2 animate-spin' />
        {localize('Loading voice presets...', '正在加载语音预设...')}
      </div>
    )
  }
  if (configQuery.isError || !draft) {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Voice presets could not be loaded', '无法加载语音预设')}
        </AlertTitle>
        <AlertDescription>
          {configQuery.error instanceof Error
            ? configQuery.error.message
            : localize('Request failed', '请求失败')}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={selectedId}
          onValueChange={(value) => value && setSelectedId(value)}
        >
          <SelectTrigger className='w-full sm:w-80'>
            <SelectValue
              placeholder={localize('Select a preset', '选择预设')}
            />
          </SelectTrigger>
          <SelectContent>
            {draft.routes.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {trainingVoiceRouteLocalizedName(route, localize)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant='outline'
          size='sm'
          onClick={addRoute}
          disabled={!canManage}
        >
          <Plus />
          {localize('Add preset', '新增预设')}
        </Button>
        <Button
          variant='destructive'
          size='sm'
          onClick={removeRoute}
          disabled={!canManage || !selectedRoute}
        >
          <Trash2 />
          {localize('Remove', '移除')}
        </Button>
        <Button
          className='ml-auto'
          size='sm'
          onClick={() => saveMutation.mutate(draft)}
          disabled={!canManage || saveMutation.isPending}
        >
          <Save />
          {saveMutation.isPending
            ? localize('Saving...', '保存中...')
            : localize('Save presets', '保存预设')}
        </Button>
      </div>
      {saveMutation.isError && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {localize('Voice presets could not be saved', '无法保存语音预设')}
          </AlertTitle>
          <AlertDescription>
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : localize('Request failed', '请求失败')}
          </AlertDescription>
        </Alert>
      )}
      {selectedRoute ? (
        <div className='grid gap-4 border-t pt-5 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='voice-route-name'>
              {localize('Preset name', '预设名称')}
            </Label>
            <Input
              id='voice-route-name'
              disabled={!canManage}
              value={selectedRoute.name}
              onChange={(event) =>
                updateSelected((route) => ({
                  ...route,
                  name: event.target.value,
                }))
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='voice-route-id'>
              {localize('Preset ID', '预设 ID')}
            </Label>
            <Input
              id='voice-route-id'
              disabled={!canManage}
              value={selectedRoute.id}
              onChange={(event) => {
                const id = event.target.value
                updateSelected((route) => ({ ...route, id }))
                setSelectedId(id)
              }}
            />
          </div>
          <div className='space-y-2'>
            <Label>{localize('Pipeline type', '链路类型')}</Label>
            <Select
              disabled={!canManage}
              value={selectedRoute.mode}
              onValueChange={(value) =>
                updateSelected((route) =>
                  routeForMode(route, value as VoiceRouteMode)
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='cascade'>STT + LLM + TTS</SelectItem>
                <SelectItem value='speech_to_speech'>
                  {localize('Native realtime model', '原生实时模型')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-end gap-5 pb-2'>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={selectedRoute.enabled}
                disabled={!canManage}
                onCheckedChange={(checked) =>
                  updateSelected((route) => ({
                    ...route,
                    enabled: checked === true,
                  }))
                }
              />
              {localize('Published', '已发布')}
            </label>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={selectedRoute.default}
                disabled={!canManage}
                onCheckedChange={(checked) => {
                  const isDefault = checked === true
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          routes: current.routes.map((route) => {
                            let nextDefault = route.default
                            if (route.id === selectedId) {
                              nextDefault = isDefault
                            } else if (isDefault) {
                              nextDefault = false
                            }
                            return { ...route, default: nextDefault }
                          }),
                        }
                      : current
                  )
                }}
              />
              {localize('Default', '默认')}
            </label>
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='voice-route-description'>
              {localize('Description', '说明')}
            </Label>
            <Textarea
              id='voice-route-description'
              disabled={!canManage}
              value={selectedRoute.description}
              onChange={(event) =>
                updateSelected((route) => ({
                  ...route,
                  description: event.target.value,
                }))
              }
            />
          </div>
          <div className='flex items-start gap-3 border-y py-3 sm:col-span-2'>
            <Badge
              variant={selectedRoute.readiness?.ready ? 'default' : 'secondary'}
              className='mt-0.5 shrink-0'
            >
              {selectedRoute.readiness?.ready
                ? localize('Ready', '已接入')
                : localize('Unavailable', '暂不可用')}
            </Badge>
            <div className='min-w-0 text-sm'>
              <p className='font-medium'>
                {selectedRoute.adapterStatus === 'runtime_integrated'
                  ? localize('TalkWise runtime adapter', 'TalkWise 运行适配器')
                  : localize('Curated Pipecat demo', '精选 Pipecat Demo')}
              </p>
              {!selectedRoute.readiness?.ready && (
                <p className='text-muted-foreground mt-0.5 text-xs leading-relaxed'>
                  {selectedRoute.readiness?.code ===
                  'VOICE_ROUTE_ADAPTER_NOT_INTEGRATED'
                    ? localize(
                        'Published in the catalog, but its runtime adapter has not been integrated yet.',
                        '已发布到预设目录，但对应运行适配器尚未接入。'
                      )
                    : localize(
                        'Provider configuration is incomplete.',
                        '服务商配置尚未完成。'
                      )}
                </p>
              )}
            </div>
          </div>
          {selectedRoute.mode === 'cascade' ? (
            <CascadeFields
              route={selectedRoute}
              readOnly={!canManage}
              update={updateSelected}
              localize={localize}
              modelOptions={modelOptions}
              voiceOptions={voiceOptions}
            />
          ) : (
            <NativeFields
              route={selectedRoute}
              readOnly={!canManage}
              update={updateSelected}
              localize={localize}
              modelOptions={modelOptions}
              voiceOptions={voiceOptions}
            />
          )}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>
          {localize(
            'Add a preset before configuring a voice pipeline.',
            '新增预设后即可配置语音链路。'
          )}
        </p>
      )}
    </div>
  )
}

function CascadeFields({
  route,
  readOnly,
  update,
  localize,
  modelOptions,
  voiceOptions,
}: {
  route: VoiceRoute
  readOnly: boolean
  update: (updater: (route: VoiceRoute) => VoiceRoute) => void
  localize: Localize
  modelOptions: ModelOption[]
  voiceOptions: ModelOption[]
}) {
  return (
    <>
      <ServiceProvider
        label={localize('STT provider', 'STT 提供商')}
        value={route.stt?.provider ?? 'openai'}
        options={['openai', 'volcengine.doubao']}
        readOnly={readOnly}
        onChange={(provider) =>
          update((current) => ({
            ...current,
            stt: { provider, model: current.stt?.model ?? '' },
          }))
        }
      />
      <ServiceModel
        label={localize('STT model', 'STT 模型')}
        value={route.stt?.model ?? ''}
        readOnly={readOnly}
        options={modelOptions}
        localize={localize}
        onChange={(model) =>
          update((current) => ({
            ...current,
            stt: { provider: current.stt?.provider ?? 'openai', model },
          }))
        }
      />
      <div className='space-y-2'>
        <Label>{localize('LLM provider', 'LLM 提供商')}</Label>
        <Select
          disabled={readOnly}
          value={route.llm?.provider ?? 'openai'}
          onValueChange={(provider) =>
            provider &&
            update((current) => ({
              ...current,
              llm: { provider, model: current.llm?.model ?? '' },
            }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='openai'>OpenAI</SelectItem>
            <SelectItem value='openrouter'>OpenRouter</SelectItem>
            {route.llm?.provider &&
              !['openai', 'openrouter'].includes(route.llm.provider) && (
                <SelectItem value={route.llm.provider}>
                  {route.llm.provider}
                </SelectItem>
              )}
          </SelectContent>
        </Select>
      </div>
      <ServiceModel
        label={localize('LLM model', 'LLM 模型')}
        value={route.llm?.model ?? ''}
        readOnly={readOnly}
        options={modelOptions}
        localize={localize}
        onChange={(model) =>
          update((current) => ({
            ...current,
            llm: { provider: current.llm?.provider ?? 'openai', model },
          }))
        }
      />
      <ServiceProvider
        label={localize('TTS provider', 'TTS 提供商')}
        value={route.tts?.provider ?? 'openai'}
        options={['openai', 'volcengine.doubao']}
        readOnly={readOnly}
        onChange={(provider) =>
          update((current) => ({
            ...current,
            tts: {
              provider,
              model: current.tts?.model ?? '',
              voice: current.tts?.voice,
            },
          }))
        }
      />
      <ServiceModel
        label={localize('TTS model', 'TTS 模型')}
        value={route.tts?.model ?? ''}
        readOnly={readOnly}
        options={modelOptions}
        localize={localize}
        onChange={(model) =>
          update((current) => ({
            ...current,
            tts: {
              provider: current.tts?.provider ?? 'openai',
              model,
              voice: current.tts?.voice,
            },
          }))
        }
      />
      <ServiceModel
        label={localize('TTS voice', 'TTS 音色')}
        value={route.tts?.voice ?? ''}
        readOnly={readOnly}
        options={voiceOptions}
        localize={localize}
        onChange={(voice) =>
          update((current) => ({
            ...current,
            tts: {
              provider: current.tts?.provider ?? 'openai',
              model: current.tts?.model ?? '',
              voice,
            },
          }))
        }
      />
    </>
  )
}

function NativeFields({
  route,
  readOnly,
  update,
  localize,
  modelOptions,
  voiceOptions,
}: {
  route: VoiceRoute
  readOnly: boolean
  update: (updater: (route: VoiceRoute) => VoiceRoute) => void
  localize: Localize
  modelOptions: ModelOption[]
  voiceOptions: ModelOption[]
}) {
  return (
    <>
      <div className='space-y-2'>
        <Label>{localize('Realtime provider', '实时提供商')}</Label>
        <Select
          disabled={readOnly}
          value={route.realtime?.provider ?? 'openai'}
          onValueChange={(provider) =>
            provider &&
            update((current) => ({
              ...current,
              realtime: {
                provider,
                model: current.realtime?.model ?? '',
                voice: current.realtime?.voice,
              },
            }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='openai'>OpenAI</SelectItem>
            <SelectItem value='volcengine.doubao_realtime'>
              Volcengine Doubao
            </SelectItem>
            {route.realtime?.provider &&
              !['openai', 'volcengine.doubao_realtime'].includes(
                route.realtime.provider
              ) && (
                <SelectItem value={route.realtime.provider}>
                  {route.realtime.provider}
                </SelectItem>
              )}
          </SelectContent>
        </Select>
      </div>
      <ServiceModel
        label={localize('Realtime model', '实时模型')}
        value={route.realtime?.model ?? ''}
        readOnly={readOnly}
        options={modelOptions}
        localize={localize}
        onChange={(model) =>
          update((current) => ({
            ...current,
            realtime: {
              provider: current.realtime?.provider ?? 'openai',
              model,
              voice: current.realtime?.voice,
            },
          }))
        }
      />
      <ServiceModel
        label={localize('Voice', '音色')}
        value={route.realtime?.voice ?? ''}
        readOnly={readOnly}
        options={voiceOptions}
        localize={localize}
        onChange={(voice) =>
          update((current) => ({
            ...current,
            realtime: {
              provider: current.realtime?.provider ?? 'openai',
              model: current.realtime?.model ?? '',
              voice,
            },
          }))
        }
      />
    </>
  )
}

function ServiceProvider({
  label,
  value,
  options,
  readOnly,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  readOnly: boolean
  onChange: (value: string) => void
}) {
  const values = [...new Set([...options, value].filter(Boolean))]
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Select
        disabled={readOnly}
        value={value}
        onValueChange={(provider) => provider && onChange(provider)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((provider) => (
            <SelectItem key={provider} value={provider}>
              {provider}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ServiceModel({
  label,
  value,
  readOnly,
  options,
  localize,
  onChange,
}: {
  label: string
  value: string
  readOnly: boolean
  options: ModelOption[]
  localize: Localize
  onChange: (value: string) => void
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <ModelSelector
        selectedModel={value}
        models={options}
        onModelChange={onChange}
        variant='field'
        disabled={readOnly}
        placeholder={label}
        searchPlaceholder={localize(
          'Search configured models...',
          '搜索已配置模型...'
        )}
        emptyText={localize(
          'No configured model found.',
          '没有找到已配置的模型。'
        )}
        ariaLabel={label}
      />
    </div>
  )
}

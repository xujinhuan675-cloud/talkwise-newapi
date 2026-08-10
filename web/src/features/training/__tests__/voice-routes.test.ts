/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  voiceRouteDisabledReason,
  voiceRouteIsReady,
  voiceRoutePresetGroup,
  voiceRouteSupportsInteraction,
  type VoiceRoute,
} from '../voice-routes'

function route(overrides: Partial<VoiceRoute> = {}): VoiceRoute {
  return {
    id: 'route',
    name: 'Route',
    description: '',
    mode: 'cascade',
    enabled: true,
    default: false,
    revision: 1,
    adapterStatus: 'runtime_integrated',
    interactionModes: ['turn_based', 'realtime'],
    credentialEnv: [],
    stt: { provider: 'openai', model: 'stt' },
    llm: { provider: 'openai', model: 'llm' },
    tts: { provider: 'openai', model: 'tts' },
    inputSampleRate: 16000,
    outputSampleRate: 24000,
    latencyProfile: 'near_realtime',
    costProfile: 'configured',
    readiness: {
      status: 'ready',
      ready: true,
      missingCredentials: [],
      missingDependencies: [],
    },
    ...overrides,
  }
}

describe('training voice route selection', () => {
  test('uses explicit interaction mode support', () => {
    const hybrid = route({ interactionModes: ['turn_based'] })

    assert.equal(voiceRouteSupportsInteraction(hybrid, 'turn_based'), true)
    assert.equal(voiceRouteSupportsInteraction(hybrid, 'realtime'), false)
  })

  test('does not infer interaction support from a legacy route mode', () => {
    const legacyShape = route({ interactionModes: [] })

    assert.equal(voiceRouteSupportsInteraction(legacyShape, 'turn_based'), false)
    assert.equal(voiceRouteSupportsInteraction(legacyShape, 'realtime'), false)
  })

  test('does not equate a cascade route with turn-by-turn interaction', () => {
    const streamingCascade = route({
      mode: 'cascade',
      interactionModes: ['turn_based', 'realtime'],
    })

    assert.equal(
      voiceRouteSupportsInteraction(streamingCascade, 'realtime'),
      true
    )
    assert.equal(voiceRoutePresetGroup(streamingCascade), 'cascade')
  })

  test('keeps only cascade and realtime preset groups', () => {
    const native = route({ mode: 'speech_to_speech' })
    const nativeDemo = route({
      mode: 'speech_to_speech',
      adapterStatus: 'inventory_only',
    })
    const cascadeDemo = route({ adapterStatus: 'inventory_only' })

    assert.equal(voiceRoutePresetGroup(native), 'realtime')
    assert.equal(voiceRoutePresetGroup(nativeDemo), 'realtime')
    assert.equal(voiceRoutePresetGroup(cascadeDemo), 'cascade')
  })

  test('uses the server-provided preset group as the catalog source of truth', () => {
    const groupedByCatalog = route({
      mode: 'cascade',
      presetGroup: 'realtime',
    })

    assert.equal(voiceRoutePresetGroup(groupedByCatalog), 'realtime')
  })

  test('keeps a published curated demo visible but unavailable', () => {
    const demo = route({
      adapterStatus: 'inventory_only',
      interactionModes: ['realtime'],
      readiness: {
        status: 'blocked',
        ready: false,
        code: 'VOICE_ROUTE_ADAPTER_NOT_INTEGRATED',
        reason: 'Runtime adapter not integrated',
        missingCredentials: [],
        missingDependencies: ['talkwise.runtime_adapter'],
      },
    })

    assert.equal(voiceRouteSupportsInteraction(demo, 'realtime'), true)
    assert.equal(voiceRouteIsReady(demo), false)
    assert.equal(
      voiceRouteDisabledReason(demo, (_english, chinese) => chinese),
      '暂不可用：运行适配器尚未接入'
    )
  })
})

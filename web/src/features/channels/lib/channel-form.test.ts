/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { Channel } from '../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  channelFormSchema,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
} from './channel-form'

describe('Doubao Voice channel form', () => {
  const realtimeForm = {
    ...CHANNEL_FORM_DEFAULT_VALUES,
    name: 'Doubao Voice',
    type: 59,
    base_url: 'https://openspeech.bytedance.com/',
    key: 'access-key',
    models: 'seed-tts-2.0,volc.bigasr.sauc.duration,1.2.1.1',
    group: ['default'],
    test_model: '1.2.1.1',
    volcengine_service_mode: 'speech_voice_v3' as const,
    volcengine_resource_id: '',
    volcengine_voice: 'zh_female_vv_uranus_bigtts',
  }

  test('persists unified voice service and API key metadata', () => {
    assert.equal(channelFormSchema.safeParse(realtimeForm).success, true)
    const payload = transformFormDataToCreatePayload(realtimeForm).channel
    assert.equal(payload.base_url, 'https://openspeech.bytedance.com')
    assert.deepEqual(JSON.parse(payload.settings || '{}'), {
      volcengine_service_mode: 'speech_voice_v3',
      volcengine_resource_id: '',
      volcengine_voice: 'zh_female_vv_uranus_bigtts',
      disable_task_polling_sleep: false,
    })
  })

  test('round trips stored speech settings into the editor', () => {
    const payload = transformFormDataToCreatePayload(realtimeForm).channel
    const defaults = transformChannelToFormDefaults({
      ...payload,
      id: 7,
      type: 59,
      key: '',
      status: 1,
      name: 'Doubao Realtime',
      created_time: 0,
      test_time: 0,
      response_time: 0,
      balance: 0,
      balance_updated_time: 0,
      used_quota: 0,
      other_info: '',
      max_input_tokens: 0,
      channel_info: {
        is_multi_key: false,
        multi_key_size: 0,
        multi_key_polling_index: 0,
        multi_key_mode: 'random',
      },
    } as Channel)
    assert.equal(defaults.volcengine_service_mode, 'speech_voice_v3')
    assert.equal(defaults.volcengine_resource_id, '')
  })

  test('keeps Ark channels free of speech settings', () => {
    const payload = transformFormDataToCreatePayload({
      ...CHANNEL_FORM_DEFAULT_VALUES,
      name: 'Volcengine Ark',
      type: 45,
      base_url: 'https://ark.cn-beijing.volces.com',
      key: 'ark-key',
      models: 'doubao-seed-1-6',
      volcengine_service_mode: 'speech_voice_v3',
    }).channel

    assert.deepEqual(JSON.parse(payload.settings || '{}'), {
      volcengine_service_mode: 'ark',
      disable_task_polling_sleep: false,
    })
  })
})

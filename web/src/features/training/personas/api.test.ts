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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  TALKWISE_PERSONA_BUILDER_API,
  TALKWISE_PERSONAS_API,
  parsePersonaBuildSse,
  personaBuildPayload,
} from './api'

describe('training persona API contract', () => {
  test('uses only the narrow authenticated TalkWise proxy namespaces', () => {
    assert.equal(TALKWISE_PERSONAS_API, '/api/talkwise/personas')
    assert.equal(TALKWISE_PERSONA_BUILDER_API, '/api/talkwise/persona-builder')
  })

  test('builds a persona request without client-owned identity fields', () => {
    const payload = personaBuildPayload({
      materials: [' first ', '', 'second'],
      targetPersonaId: ' manager-1 ',
      name: ' Jordan ',
      role: ' VP Sales ',
    })

    assert.deepEqual(payload, {
      materials: ['first', 'second'],
      target_persona_id: 'manager-1',
      name: 'Jordan',
      role: 'VP Sales',
    })
    assert.equal('user_id' in payload, false)
    assert.equal('team_id' in payload, false)
    assert.equal('owner_user_id' in payload, false)
  })

  test('parses complete build frames and preserves an incomplete frame', () => {
    const parsed = parsePersonaBuildSse(
      [
        'data: {"seq":1,"type":"workspace_ready","ts":1,"data":{}}',
        '',
        'data: {"seq":2,"type":"persist_done","ts":2,"data":{"persona_id":"manager-1"}}',
        '',
        'data: {"seq":3,"type":"agent_message"',
      ].join('\n')
    )

    assert.deepEqual(parsed.events, [
      { seq: 1, type: 'workspace_ready', ts: 1, data: {} },
      {
        seq: 2,
        type: 'persist_done',
        ts: 2,
        data: { persona_id: 'manager-1' },
      },
    ])
    assert.equal(parsed.remainder, 'data: {"seq":3,"type":"agent_message"')
  })
})

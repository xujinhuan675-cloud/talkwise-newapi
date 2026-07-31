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
  buildTrainingConversationSendPayload,
  normalizeTrainingConversationMessages,
  parseTrainingConversationSse,
} from './api'

describe('training conversation workspace API', () => {
  test('normalizes the paginated message tree response into persisted messages', () => {
    assert.deepEqual(
      normalizeTrainingConversationMessages({
        data: {
          items: [
            {
              public_id: 'msg-assistant',
              role: 'persona',
              content: 'What outcome are you aiming for?',
              parent_message_id: 'msg-user',
              branch_id: 'main',
            },
          ],
        },
      }),
      [
        {
          publicId: 'msg-assistant',
          role: 'assistant',
          content: 'What outcome are you aiming for?',
          parentMessageId: 'msg-user',
          branchId: 'main',
          createdAt: null,
        },
      ]
    )
  })

  test('builds a scoped streamed message request without client identity fields', () => {
    const payload = buildTrainingConversationSendPayload({
      message: 'I want to reset expectations with the customer.',
      parentMessageId: 'msg-parent',
      branchId: 'branch-2',
      model: 'gpt-4.1-mini',
      temperature: 0.5,
      maxTokens: 512,
      session: {
        sessionId: 'session-7',
        scenarioId: 'scenario-renewal',
        metadata: { selectedPath: ['msg-parent'] },
      },
    })

    assert.equal(payload.stream, true)
    assert.equal(payload.parent_message_id, 'msg-parent')
    assert.equal(payload.branch_id, 'branch-2')
    assert.deepEqual(payload.metadata, {
      selectedPath: ['msg-parent'],
      source: 'newapi_training_conversation_workspace',
      training_session_id: 'session-7',
      scenario_id: 'scenario-renewal',
    })
    assert.equal('user_id' in payload, false)
    assert.equal('team_id' in payload, false)
  })

  test('parses complete SSE frames while preserving an incomplete trailing frame', () => {
    const source = [
      'event: message_created',
      'data: {"public_id":"msg-user","parent_message_id":null,"branch_id":"main"}',
      '',
      'event: message_delta',
      'data: {"content":"Hello"}',
      '',
      'event: message_complete',
    ].join('\n')
    const parsed = parseTrainingConversationSse(source)

    assert.deepEqual(parsed.events, [
      {
        type: 'message_created',
        publicId: 'msg-user',
        parentMessageId: null,
        branchId: 'main',
      },
      { type: 'message_delta', content: 'Hello' },
    ])
    assert.equal(parsed.remainder, 'event: message_complete')
  })
})

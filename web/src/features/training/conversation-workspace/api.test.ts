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
  buildTrainingConversationBranchPayload,
  buildTrainingConversationCompletionPayload,
  buildTrainingConversationGuidancePayload,
  buildTrainingConversationForkPayload,
  buildTrainingConversationMessageEndpoint,
  buildTrainingConversationSendPayload,
  normalizeTrainingConversationBranchResult,
  normalizeTrainingConversationCompletionResult,
  normalizeTrainingConversationGuidanceHistoryResult,
  normalizeTrainingConversationGuidanceResult,
  normalizeTrainingConversationForkResult,
  normalizeTrainingConversationMessages,
  normalizeTrainingSessionConversationForkResult,
  normalizeTrainingConversationReportSummary,
  parseTrainingConversationSse,
  trainingConversationApiErrorMessage,
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

  test('keeps display-only actions and emotion metadata when loading messages', () => {
    assert.deepEqual(
      normalizeTrainingConversationMessages({
        data: {
          items: [
            {
              public_id: 'msg-emotion',
              role: 'persona',
              content:
                '（皱眉）这个方案需要重新评估。<!--emotion:{"score":-2,"label":"质疑"}--> ',
              metadata: {
                trainingEmotion: {
                  score: -2,
                  label: '质疑',
                },
              },
              content_parts: [{ type: 'text', text: '这个方案需要重新评估。' }],
              branch_id: 'main',
            },
          ],
        },
      }),
      [
        {
          publicId: 'msg-emotion',
          role: 'assistant',
          content: '（皱眉）这个方案需要重新评估。',
          contentParts: [{ type: 'text', text: '这个方案需要重新评估。' }],
          metadata: {
            trainingEmotion: {
              score: -2,
              label: '质疑',
            },
          },
          emotionLabel: '质疑',
          emotionScore: -2,
          parentMessageId: null,
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
        metadata: {
          source: 'battle_prep',
          selectedPath: ['msg-parent'],
          user_id: 'spoofed-user',
          team_id: 'spoofed-team',
          role: 'admin',
        },
      },
    })

    assert.equal(payload.stream, true)
    assert.equal(payload.parent_message_id, 'msg-parent')
    assert.equal(payload.branch_id, 'branch-2')
    assert.deepEqual(payload.metadata, {
      source: 'battle_prep',
      training_session_id: 'session-7',
      scenario_id: 'scenario-renewal',
    })
    assert.equal('user_id' in payload, false)
    assert.equal('team_id' in payload, false)
    assert.equal(JSON.stringify(payload).includes('spoofed-user'), false)
    assert.equal(JSON.stringify(payload).includes('spoofed-team'), false)
    assert.equal(JSON.stringify(payload).includes('admin'), false)
  })

  test('builds encoded message-tree endpoints from server public ids', () => {
    assert.equal(
      buildTrainingConversationMessageEndpoint(
        'conversation/42',
        'message child/7',
        'path'
      ),
      '/api/talkwise/conversation-tree/conversation%2F42/messages/message%20child%2F7/path'
    )
    assert.throws(
      () => buildTrainingConversationMessageEndpoint('42', ' ', 'children'),
      /message public id cannot be empty/
    )
  })

  test('normalizes branch action navigation context', () => {
    assert.deepEqual(
      normalizeTrainingConversationBranchResult({
        data: {
          message: {
            public_id: 'msg-selected',
            role: 'assistant',
            content: 'Selected response',
            branch_id: 'branch-review',
          },
          path: [
            {
              public_id: 'msg-root',
              role: 'user',
              content: 'Opening question',
            },
          ],
          children: [
            {
              public_id: 'msg-child',
              role: 'persona',
              content: 'Follow-up',
              parent_message_id: 'msg-selected',
            },
          ],
          siblings: [],
          branch_id: 'branch-review',
        },
      }),
      {
        message: {
          publicId: 'msg-selected',
          role: 'assistant',
          content: 'Selected response',
          parentMessageId: null,
          branchId: 'branch-review',
          createdAt: null,
        },
        path: [
          {
            publicId: 'msg-root',
            role: 'user',
            content: 'Opening question',
            parentMessageId: null,
            branchId: null,
            createdAt: null,
          },
        ],
        children: [
          {
            publicId: 'msg-child',
            role: 'assistant',
            content: 'Follow-up',
            parentMessageId: 'msg-selected',
            branchId: null,
            createdAt: null,
          },
        ],
        siblings: [],
        branchId: 'branch-review',
      }
    )
    assert.deepEqual(buildTrainingConversationBranchPayload(), {
      action: 'branch',
    })
  })

  test('builds a scoped fork payload without scoring or identity claims', () => {
    const payload = buildTrainingConversationForkPayload({
      title: '  Renewal objection branch  ',
      option: 'includeBranches',
      includeDeleted: false,
      statuses: ['active', ' active ', '', 'archived'],
      session: {
        sessionId: 'session-9',
        scenarioId: 'scenario-renewal',
        metadata: {
          source: 'persona_training',
          user: 'spoofed-user',
          team: 'spoofed-team',
          score: 100,
          completed: true,
        },
      },
    })

    assert.deepEqual(payload, {
      title: 'Renewal objection branch',
      option: 'includeBranches',
      include_deleted: false,
      statuses: ['active', 'archived'],
      metadata: {
        source: 'persona_training',
        training_session_id: 'session-9',
        scenario_id: 'scenario-renewal',
      },
    })
    const serialized = JSON.stringify(payload)
    assert.equal(serialized.includes('spoofed-user'), false)
    assert.equal(serialized.includes('spoofed-team'), false)
    assert.equal(serialized.includes('score'), false)
    assert.equal(serialized.includes('completed'), false)
    assert.equal(
      buildTrainingConversationForkPayload({
        session: { sessionId: 'session-9' },
      }).option,
      'directPath'
    )
  })

  test('normalizes a fork result and keeps server-derived ids', () => {
    assert.deepEqual(
      normalizeTrainingConversationForkResult({
        data: {
          conversation: {
            id: 84,
            title: 'Forked renewal practice',
            status: 'active',
          },
          messages: [
            {
              public_id: 'fork-msg-root',
              role: 'user',
              content: 'Let us revisit the renewal.',
            },
          ],
          source_to_forked_id: {
            'source-msg-root': 'fork-msg-root',
          },
        },
      }),
      {
        conversation: {
          id: '84',
          title: 'Forked renewal practice',
          status: 'active',
        },
        messages: [
          {
            publicId: 'fork-msg-root',
            role: 'user',
            content: 'Let us revisit the renewal.',
            parentMessageId: null,
            branchId: null,
            createdAt: null,
          },
        ],
        sourceToForkedId: {
          'source-msg-root': 'fork-msg-root',
        },
      }
    )
    assert.equal(normalizeTrainingConversationForkResult({ data: {} }), null)
  })

  test('builds guidance turns from the selected path without identity claims', () => {
    const payload = buildTrainingConversationGuidancePayload(
      [
        {
          publicId: 'user-1',
          role: 'user',
          content: '  I want to align on the renewal outcome. ',
          parentMessageId: null,
          branchId: 'main',
          createdAt: null,
        },
        {
          publicId: 'assistant-1',
          role: 'assistant',
          content: 'What does success look like?',
          parentMessageId: 'user-1',
          branchId: 'main',
          createdAt: null,
        },
      ],
      'assistant-1'
    )

    assert.deepEqual(payload, {
      recent_turns: [
        {
          speaker: 'user',
          text: 'I want to align on the renewal outcome.',
          turn_id: 'user-1',
          metadata: { branch_id: 'main' },
        },
        {
          speaker: 'persona',
          text: 'What does success look like?',
          turn_id: 'assistant-1',
          metadata: { parent_message_id: 'user-1', branch_id: 'main' },
        },
      ],
      message_limit: 50,
      selected_tail_message_id: 'assistant-1',
    })
    assert.equal(JSON.stringify(payload).includes('user_id'), false)
    assert.equal(JSON.stringify(payload).includes('team_id'), false)
  })

  test('normalizes guidance events and explicit capability boundaries', () => {
    assert.deepEqual(
      normalizeTrainingConversationGuidanceResult({
        data: {
          session_id: 'session-1',
          source: 'request',
          context_runtime: 'message_tree',
          context_selection: 'selected_path',
          selected_tail_message_id: 'assistant-1',
          window_size: 2,
          total_turn_count: 2,
          capabilities: {
            refresh: true,
            stream: false,
            persistence: true,
            history: true,
            server_selected_path: true,
          },
          persistence: {
            status: 'ready',
            retryable: false,
            persisted: true,
            snapshotId: 'guidance-1',
            historyCount: 1,
            historyLimit: 12,
          },
          events: [
            {
              event_type: 'ask_back',
              severity: 'info',
              title: 'Calibrate the outcome',
              message: 'Ask one question before proposing a solution.',
              suggested_text: 'What would make this worthwhile for you?',
            },
            { event_type: 'invalid' },
          ],
        },
      }),
      {
        sessionId: 'session-1',
        source: 'request',
        contextRuntime: 'message_tree',
        contextSelection: 'selected_path',
        selectedTailMessageId: 'assistant-1',
        windowSize: 2,
        totalTurnCount: 2,
        capabilities: {
          refresh: true,
          stream: false,
          persistence: true,
          history: true,
          serverSelectedPath: true,
        },
        events: [
          {
            eventType: 'ask_back',
            severity: 'info',
            title: 'Calibrate the outcome',
            message: 'Ask one question before proposing a solution.',
            suggestedText: 'What would make this worthwhile for you?',
            createdAt: null,
          },
        ],
        history: [],
        persistence: {
          status: 'ready',
          retryable: false,
          persisted: true,
          code: null,
          snapshotId: 'guidance-1',
          selectedTailMessageId: null,
          savedCount: null,
          historyCount: 1,
          historyLimit: 12,
          deduplicated: null,
        },
      }
    )
  })

  test('normalizes bounded selected-path guidance history without inventing events', () => {
    assert.deepEqual(
      normalizeTrainingConversationGuidanceHistoryResult({
        data: {
          status: 'ready',
          selectedTailMessageId: 'assistant-1',
          historyCount: 1,
          historyLimit: 12,
          persistence: { status: 'ready', retryable: false },
          capabilities: {
            refresh: true,
            persistence: true,
            history: true,
            serverSelectedPath: true,
          },
          history: [
            {
              snapshotId: 'guidance-1',
              selectedTailMessageId: 'assistant-1',
              persistedAt: '2026-08-01T00:00:00Z',
              eventCount: 1,
              source: 'message_tree',
              contextRuntime: 'message_tree',
              contextSelection: 'selected_path',
              windowSize: 2,
              totalTurnCount: 2,
              events: [
                {
                  event_type: 'ask_back',
                  severity: 'info',
                  title: 'Calibrate the outcome',
                  message: 'Ask one question first.',
                },
              ],
            },
          ],
        },
      }),
      {
        status: 'ready',
        retryable: false,
        selectedTailMessageId: 'assistant-1',
        historyCount: 1,
        historyLimit: 12,
        persistence: {
          status: 'ready',
          retryable: false,
          persisted: false,
          code: null,
          snapshotId: null,
          selectedTailMessageId: null,
          savedCount: null,
          historyCount: null,
          historyLimit: null,
          deduplicated: null,
        },
        capabilities: {
          refresh: true,
          stream: false,
          persistence: true,
          history: true,
          serverSelectedPath: true,
        },
        history: [
          {
            snapshotId: 'guidance-1',
            selectedTailMessageId: 'assistant-1',
            persistedAt: '2026-08-01T00:00:00Z',
            eventCount: 1,
            source: 'message_tree',
            contextRuntime: 'message_tree',
            contextSelection: 'selected_path',
            windowSize: 2,
            totalTurnCount: 2,
            events: [
              {
                eventType: 'ask_back',
                severity: 'info',
                title: 'Calibrate the outcome',
                message: 'Ask one question first.',
                suggestedText: null,
                createdAt: null,
              },
            ],
          },
        ],
      }
    )
  })

  test('normalizes a real report summary without inventing score data', () => {
    assert.deepEqual(
      normalizeTrainingConversationReportSummary({
        data: {
          id: 41,
          summary: 'The conversation clarified the renewal objective.',
          created_at: '2026-07-31T10:00:00Z',
          content: {
            communication_suggestions: [
              {
                persona_name: 'Customer',
                priority: 'high',
                suggestion: 'Ask for the customer timeline earlier.',
              },
            ],
            score: 99,
          },
        },
      }),
      {
        id: '41',
        summary: 'The conversation clarified the renewal objective.',
        createdAt: '2026-07-31T10:00:00Z',
        suggestions: [
          {
            counterpart: 'Customer',
            priority: 'high',
            suggestion: 'Ask for the customer timeline earlier.',
          },
        ],
      }
    )
  })

  test('builds the narrow server-owned training completion payload', () => {
    assert.deepEqual(buildTrainingConversationCompletionPayload(' msg-tail '), {
      generate_report: true,
      report_generation: 'sync',
      selected_tail_message_id: 'msg-tail',
    })
    assert.deepEqual(
      buildTrainingConversationCompletionPayload('msg-tail', false),
      {
        generate_report: false,
        report_generation: 'sync',
        selected_tail_message_id: 'msg-tail',
      }
    )
    assert.throws(
      () => buildTrainingConversationCompletionPayload(' '),
      /selected training message tail cannot be empty/
    )
    const serialized = JSON.stringify(
      buildTrainingConversationCompletionPayload('msg-tail')
    )
    assert.equal(serialized.includes('report_id'), false)
    assert.equal(serialized.includes('score_id'), false)
    assert.equal(serialized.includes('user_id'), false)
    assert.equal(serialized.includes('team_id'), false)
  })

  test('accepts only completion bound to the active session and conversation', () => {
    const response = {
      data: {
        session_id: 'session-1',
        status: 'completed',
        room_id: 'talkwise-conversation:conversation-1',
        report_id: null,
        task_config: {
          metadata: {
            completionReport: {
              status: 'pending',
              generation: 'background',
            },
          },
        },
      },
    }

    assert.deepEqual(
      normalizeTrainingConversationCompletionResult(
        response,
        'session-1',
        'conversation-1'
      ),
      {
        sessionId: 'session-1',
        conversationId: 'conversation-1',
        status: 'completed',
        reportId: null,
        reportStatus: 'pending',
        reportError: null,
        metadata: {
          completionReport: {
            status: 'pending',
            generation: 'background',
          },
        },
      }
    )
    assert.equal(
      normalizeTrainingConversationCompletionResult(
        response,
        'session-other',
        'conversation-1'
      ),
      null
    )

    assert.equal(
      normalizeTrainingConversationCompletionResult(
        {
          data: {
            session_id: 'session-1',
            status: 'completed',
            room_id: 'talkwise-conversation:conversation-1',
            report_id: null,
            task_config: {
              metadata: { completionReport: { status: 'skipped' } },
            },
          },
        },
        'session-1',
        'conversation-1'
      )?.reportStatus,
      'skipped'
    )
    assert.equal(
      normalizeTrainingConversationCompletionResult(
        response,
        'session-1',
        'conversation-other'
      ),
      null
    )
  })

  test('requires completed status and a real report lifecycle state', () => {
    const ready = normalizeTrainingConversationCompletionResult(
      {
        data: {
          session_id: 'session-2',
          status: 'completed',
          room_id: 'talkwise-conversation:conversation-2',
          report_id: 42,
          task_config: { metadata: {} },
        },
      },
      'session-2',
      'conversation-2'
    )
    assert.equal(ready?.reportStatus, 'ready')
    assert.equal(ready?.reportId, '42')

    assert.equal(
      normalizeTrainingConversationCompletionResult(
        {
          data: {
            session_id: 'session-2',
            status: 'active',
            room_id: 'talkwise-conversation:conversation-2',
            task_config: {
              metadata: { completionReport: { status: 'pending' } },
            },
          },
        },
        'session-2',
        'conversation-2'
      ),
      null
    )
    assert.equal(
      normalizeTrainingConversationCompletionResult(
        {
          data: {
            session_id: 'session-2',
            status: 'completed',
            room_id: 'talkwise-conversation:conversation-2',
            task_config: { metadata: {} },
          },
        },
        'session-2',
        'conversation-2'
      ),
      null
    )
  })

  test('accepts only a fork result bound to a fresh training session', () => {
    const response = {
      data: {
        training_session: {
          session_id: 'session-fork',
          status: 'active',
          room_id: 'talkwise-conversation:84',
        },
        conversation: {
          id: 84,
          title: 'Forked renewal practice',
          status: 'active',
        },
        messages: [],
        source_to_forked_id: {},
      },
    }

    assert.deepEqual(normalizeTrainingSessionConversationForkResult(response), {
      trainingSession: {
        id: 'session-fork',
        status: 'active',
        conversationId: '84',
      },
      conversation: {
        id: '84',
        title: 'Forked renewal practice',
        status: 'active',
      },
      messages: [],
      sourceToForkedId: {},
    })
    assert.equal(
      normalizeTrainingSessionConversationForkResult({
        data: {
          ...response.data,
          training_session: {
            ...response.data.training_session,
            room_id: 'talkwise-conversation:999',
          },
        },
      }),
      null
    )
  })

  test('preserves upstream authorization and not-found details', () => {
    assert.equal(
      trainingConversationApiErrorMessage(
        { detail: 'This training conversation belongs to another user.' },
        403,
        'Unable to select message branch'
      ),
      'Unable to select message branch: 403 - This training conversation belongs to another user.'
    )
    assert.equal(
      trainingConversationApiErrorMessage(
        { error: { message: 'Message branch was not found.' } },
        404,
        'Unable to load selected message path'
      ),
      'Unable to load selected message path: 404 - Message branch was not found.'
    )
    assert.equal(
      trainingConversationApiErrorMessage(
        {
          detail: {
            code: 'message_tree_completion_conflict',
            message: 'The selected path no longer belongs to this session.',
          },
        },
        409,
        'Unable to finish training session'
      ),
      'Unable to finish training session: 409 - The selected path no longer belongs to this session.'
    )
    assert.equal(
      trainingConversationApiErrorMessage(
        {
          detail: {
            code: 'message_tree_report_generation_failed',
            completionReport: {
              status: 'failed',
              message: 'The evaluation provider is temporarily unavailable.',
            },
          },
        },
        502,
        'Unable to finish training session'
      ),
      'Unable to finish training session: 502 - The evaluation provider is temporarily unavailable.'
    )
  })

  test('parses complete SSE frames while preserving an incomplete trailing frame', () => {
    const source = [
      'event: message_created',
      'data: {"public_id":"msg-user","parent_message_id":null,"branch_id":"main"}',
      '',
      'event: message_delta',
      'data: {"content":"Hello"}',
      '',
      'event: error',
      'data: {"message":"Model service is temporarily unavailable. Please retry.","retryable":true,"error_type":"TimeoutError"}',
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
      {
        type: 'error',
        message: 'Model service is temporarily unavailable. Please retry.',
        retryable: true,
        statusCode: null,
        errorType: 'TimeoutError',
      },
    ])
    assert.equal(parsed.remainder, 'event: message_complete')
  })
})

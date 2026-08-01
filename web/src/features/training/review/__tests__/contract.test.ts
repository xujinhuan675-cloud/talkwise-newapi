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
  getReviewBranchContext,
  getReviewEvaluationState,
  getReviewReportState,
  mergeReviewSessionScores,
  progressForReviewSession,
  reviewRequestAccessState,
  sortByLatestPractice,
  toReviewSession,
  toScenarioProgress,
  toScenarioProgressSummary,
  toTrainingCompetencyRadar,
  trainingReviewApiUrl,
  trainingReviewListApiUrl,
} from '../api'

describe('training review contract', () => {
  test('uses the same-origin training proxy for session and report reads', () => {
    assert.equal(
      trainingReviewApiUrl('', '/sessions?limit=100'),
      '/api/talkwise/training/sessions?limit=100'
    )
    assert.equal(
      trainingReviewApiUrl(
        'https://talkwise.example/api/v1/training-studio/',
        '/scenario-progress?limit=100'
      ),
      'https://talkwise.example/api/v1/training-studio/scenario-progress?limit=100'
    )
  })

  test('distinguishes unauthorized and forbidden API responses', () => {
    const unauthorized = Object.assign(new Error('Unauthorized'), {
      isAxiosError: true,
      response: { status: 401 },
    })
    const forbidden = Object.assign(new Error('Forbidden'), {
      isAxiosError: true,
      response: { status: 403 },
    })

    assert.equal(reviewRequestAccessState(unauthorized), 'unauthorized')
    assert.equal(reviewRequestAccessState(forbidden), 'forbidden')
    assert.equal(
      reviewRequestAccessState(new Error('Network')),
      'request_error'
    )
  })

  test('adds exact advanced filters to the server-paginated session request', () => {
    assert.equal(
      trainingReviewListApiUrl('', '/sessions', {
        skip: 20,
        limit: 20,
        scenarioId: 'renewal objection',
        query: 'procurement risk',
        mode: 'realtime',
        source: 'scenario_training',
        activityFrom: '2026-07-01T00:00:00.000Z',
        activityTo: '2026-07-31T23:59:59.999Z',
      }),
      '/api/talkwise/training/sessions?skip=20&limit=20&scenario_template_id=renewal+objection&query=procurement+risk&mode=realtime&source=scenario_training&activity_from=2026-07-01T00%3A00%3A00.000Z&activity_to=2026-07-31T23%3A59%3A59.999Z'
    )
  })

  test('omits blank advanced filters instead of broadening the current page', () => {
    assert.equal(
      trainingReviewListApiUrl('', '/sessions', {
        skip: 0,
        limit: 10,
        query: '   ',
        source: '   ',
      }),
      '/api/talkwise/training/sessions?skip=0&limit=10'
    )
  })

  test('preserves the server session configuration without client identity fields', () => {
    const session = toReviewSession({
      session_id: 'session-1',
      task_config: {
        role: 'Account manager',
        level: 'senior',
        tech_stack: ['Renewal objection', 'Procurement conversation'],
        difficulty: 'hard',
        category: 'negotiation',
        metadata: {
          scenario_training: { id: 'renewal', title: 'Renewal objection' },
        },
      },
      mode: 'voice',
      scenario_template_id: 'renewal',
      status: 'completed',
      message_count: 12,
    })

    assert.equal(session.title, 'Renewal objection')
    assert.equal(session.scenarioId, 'renewal')
    assert.equal(session.score, null)
    assert.equal(session.role, 'Account manager')
    assert.equal(session.trainingSource, null)
  })

  test('exposes only the persisted top-level session source', () => {
    const session = toReviewSession({
      session_id: 'session-source',
      task_config: {
        role: 'Account manager',
        level: 'senior',
        tech_stack: [],
        difficulty: 'hard',
        category: 'negotiation',
        metadata: {
          training_source: 'battle_prep',
          nested: { source: 'not-a-session-source' },
        },
      },
      mode: 'text',
      status: 'completed',
      message_count: 2,
    })

    assert.equal(session.trainingSource, 'battle_prep')
  })

  test('normalizes completion report states without inventing a report', () => {
    assert.deepEqual(
      getReviewReportState({
        metadata: {
          completionReport: {
            status: 'pending',
            generation: 'background',
          },
        },
      }),
      {
        status: 'pending',
        reportId: null,
        generation: 'background',
        message: null,
        completedWithoutReport: false,
      }
    )
    assert.deepEqual(
      getReviewReportState({
        metadata: {
          completionReport: {
            status: 'ready',
            generation: 'sync',
            reportId: 'report-tree-1',
          },
        },
      }),
      {
        status: 'ready',
        reportId: 'report-tree-1',
        generation: 'sync',
        message: null,
        completedWithoutReport: false,
      }
    )
    assert.deepEqual(
      getReviewReportState({
        metadata: {
          completionReport: {
            status: 'failed',
            message: 'Evaluation provider unavailable',
            completedWithoutReport: true,
          },
        },
      }),
      {
        status: 'failed',
        reportId: null,
        generation: null,
        message: 'Evaluation provider unavailable',
        completedWithoutReport: true,
      }
    )
    assert.equal(
      getReviewReportState({
        metadata: { completionReport: { status: 'ready' } },
      }).status,
      'unavailable'
    )
  })

  test('keeps terminal evaluation failures distinct from pending progress', () => {
    assert.deepEqual(
      getReviewEvaluationState({
        completionReport: {
          status: 'ready',
          evaluation: {
            status: 'ready',
            evaluationId: 'evaluation-1',
            overallScore: 4.25,
            retryable: false,
          },
        },
      }),
      {
        status: 'ready',
        evaluationId: 'evaluation-1',
        overallScore: 4.25,
        message: null,
        retryable: false,
      }
    )
    assert.deepEqual(
      getReviewEvaluationState({
        completionReport: {
          status: 'ready',
          evaluation: {
            status: 'failed',
            message: 'Evaluation provider unavailable',
            retryable: true,
          },
        },
      }),
      {
        status: 'failed',
        evaluationId: null,
        overallScore: null,
        message: 'Evaluation provider unavailable',
        retryable: true,
      }
    )
  })

  test('joins scores only to their matching training session', () => {
    const sessions = [
      {
        id: 'session-1',
        scenarioId: 'renewal',
        title: 'Renewal objection',
        description: null,
        role: 'Account manager',
        category: 'negotiation',
        difficulty: 'hard',
        mode: 'text' as const,
        trainingSource: null,
        status: 'completed' as const,
        messageCount: 4,
        startedAt: null,
        completedAt: null,
        reportId: null,
        reportState: {
          status: 'not_requested' as const,
          generation: null,
          message: null,
          completedWithoutReport: false,
        },
        evaluationState: null,
        failureReason: null,
        score: null,
        scoreStatus: 'pending' as const,
      },
      {
        id: 'session-2',
        scenarioId: 'renewal',
        title: 'Renewal retry',
        description: null,
        role: 'Account manager',
        category: 'negotiation',
        difficulty: 'hard',
        mode: 'text' as const,
        trainingSource: null,
        status: 'completed' as const,
        messageCount: 5,
        startedAt: null,
        completedAt: null,
        reportId: null,
        reportState: {
          status: 'not_requested' as const,
          generation: null,
          message: null,
          completedWithoutReport: false,
        },
        evaluationState: null,
        failureReason: null,
        score: null,
        scoreStatus: 'pending' as const,
      },
    ]
    const progress = [
      toScenarioProgress({
        scenario_id: 'renewal',
        training_session_id: 'session-2',
        status: 'completed',
        score: 87.4,
        score_status: 'ready',
      }),
    ]

    assert.deepEqual(
      mergeReviewSessionScores(sessions, progress).map((session) => ({
        score: session.score,
        progressLinked: session.progressLinked,
      })),
      [
        { score: null, progressLinked: undefined },
        { score: 87, progressLinked: true },
      ]
    )
  })

  test('sorts scenario progress by real practice timestamps', () => {
    const progress = sortByLatestPractice([
      {
        scenarioId: 'older',
        sessionId: 'session-1',
        status: 'completed' as const,
        score: null,
        scoreStatus: 'pending' as const,
        overallScore: null,
        lastPracticedAt: '2026-07-01T00:00:00Z',
        reportId: null,
        failureReason: null,
      },
      {
        scenarioId: 'newer',
        sessionId: 'session-2',
        status: 'completed' as const,
        score: null,
        scoreStatus: 'pending' as const,
        overallScore: null,
        lastPracticedAt: '2026-07-02T00:00:00Z',
        reportId: null,
        failureReason: null,
      },
    ])

    assert.deepEqual(
      progress.map((item) => item.scenarioId),
      ['newer', 'older']
    )
  })

  test('normalizes a server-computed scenario progress summary', () => {
    assert.deepEqual(
      toScenarioProgressSummary({
        tracked_scenarios: 8,
        completed_scenarios: 5,
        scored_scenarios: 4,
        average_score: 82.6,
        completion_percentage: 62.5,
      }),
      {
        trackedScenarios: 8,
        completedScenarios: 5,
        scoredScenarios: 4,
        averageScore: 83,
        completionPercentage: 63,
      }
    )
  })

  test('keeps only valid scored competency dimensions for the radar', () => {
    assert.deepEqual(
      toTrainingCompetencyRadar({
        sample_size: 4,
        dimensions: [
          {
            dimension_id: 'active_listening',
            score: 84.2,
            sample_count: 4,
          },
          {
            dimension_id: 'invalid',
            score: Number.NaN,
            sample_count: 4,
          },
        ],
      }),
      {
        sampleSize: 4,
        dimensions: [
          {
            dimensionId: 'active_listening',
            score: 84,
            sampleCount: 4,
          },
        ],
      }
    )
  })

  test('reads branch evidence from session metadata before report metadata', () => {
    const session = {
      session_id: 'session-1',
      task_config: {
        role: 'Account manager',
        level: 'senior',
        tech_stack: [],
        difficulty: 'hard',
        category: 'negotiation',
        metadata: {
          messageTreeSelection: {
            provider: 'message-tree',
            conversationId: 'conversation-session',
            branchId: 'branch-session',
            selectedMessageId: 'msg-tail',
            path: [
              { publicId: 'msg-root', role: 'user', content: 'Start' },
              {
                publicId: 'msg-tail',
                role: 'assistant',
                content: 'Selected response',
                branchId: 'branch-session',
                parentMessageId: 'msg-root',
              },
            ],
          },
        },
      },
      mode: 'text' as const,
      status: 'completed' as const,
      message_count: 2,
    }
    const context = getReviewBranchContext({
      session: toReviewSession(session),
      report: {
        id: 'report-1',
        room_id: 'room-1',
        summary: 'Real report summary',
        content: {},
        metadata: {
          selectedPath: {
            branchId: 'branch-report',
            messageIds: ['report-tail'],
          },
        },
      },
    })

    assert.equal(context?.source, 'session')
    assert.equal(context?.sourceDetail, 'session.task_config.metadata')
    assert.equal(context?.pathTextState, 'with_text')
    assert.equal(context?.selectedTailMessageId, 'msg-tail')
    assert.deepEqual(
      context?.selectedPath.map((item) => item.publicId),
      ['msg-root', 'msg-tail']
    )
  })

  test('keeps ID-only and reference-only paths explicit without inventing text', () => {
    const baseSession = {
      session_id: 'session-1',
      task_config: {
        role: 'Account manager',
        level: 'senior',
        tech_stack: [],
        difficulty: 'hard',
        category: 'negotiation',
      },
      mode: 'text' as const,
      status: 'completed' as const,
      message_count: 2,
    }
    const idOnly = getReviewBranchContext({
      session: toReviewSession({
        ...baseSession,
        task_config: {
          ...baseSession.task_config,
          metadata: {
            selectedPath: {
              branchId: 'branch-id',
              messageIds: ['msg-root', 'msg-tail'],
            },
          },
        },
      }),
    })
    const referenceOnly = getReviewBranchContext({
      session: toReviewSession({
        ...baseSession,
        task_config: { ...baseSession.task_config, metadata: {} },
      }),
      report: {
        id: 'report-1',
        room_id: 'room-1',
        summary: '',
        content: {
          metadata: {
            branchContext: {
              branchId: 'branch-reference',
              tailMessageId: 'msg-reference',
            },
          },
        },
      },
    })

    assert.equal(idOnly?.pathTextState, 'id_only')
    assert.equal(idOnly?.pathSummary, null)
    assert.ok(idOnly?.selectedPath.every((item) => item.content === ''))
    assert.equal(referenceOnly?.source, 'report')
    assert.equal(referenceOnly?.pathTextState, 'reference_only')
    assert.equal(referenceOnly?.pathSummary, null)
    assert.deepEqual(referenceOnly?.selectedPath, [])
  })

  test('links progress only by its owned training session id', () => {
    const progress = [
      toScenarioProgress({
        scenario_id: 'renewal',
        training_session_id: 'session-2',
        status: 'completed',
        score: 91,
        score_status: 'ready',
      }),
    ]

    assert.equal(progressForReviewSession(progress, 'session-1'), null)
    assert.equal(progressForReviewSession(progress, 'session-2')?.score, 91)
  })

  test('uses real progress metadata only as the final branch evidence fallback', () => {
    const session = toReviewSession({
      session_id: 'session-2',
      task_config: {
        role: 'Account manager',
        level: 'senior',
        tech_stack: [],
        difficulty: 'hard',
        category: 'negotiation',
        metadata: {},
      },
      mode: 'text',
      status: 'completed',
      message_count: 2,
    })
    const progress = toScenarioProgress({
      scenario_id: 'renewal',
      training_session_id: 'session-2',
      status: 'completed',
      score: 91,
      score_status: 'ready',
      metadata: {
        branchContext: {
          branchId: 'branch-progress',
          tailMessageId: 'msg-progress',
        },
      },
    })

    const context = getReviewBranchContext({ session, progress })

    assert.equal(context?.source, 'progress')
    assert.equal(context?.sourceDetail, 'progress.metadata')
    assert.equal(context?.pathTextState, 'reference_only')
    assert.equal(context?.pathSummary, null)
  })
})

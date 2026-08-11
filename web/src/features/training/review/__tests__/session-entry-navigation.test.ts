import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { trainingSessionEntryDestination } from '../session-entry-navigation'

describe('training session entry navigation', () => {
  test('resumes the existing conversation for an active session', () => {
    assert.deepEqual(trainingSessionEntryDestination('active', 'session-1'), {
      kind: 'resume',
      search: { session: 'session-1' },
      to: '/training/conversations',
    })
  })

  test('opens terminal and not-yet-active sessions as read-only details', () => {
    for (const status of ['completed', 'created', 'failed'] as const) {
      assert.deepEqual(trainingSessionEntryDestination(status, 'session-2'), {
        kind: 'review',
        params: { sessionId: 'session-2' },
        to: '/training/sessions/$sessionId',
      })
    }
  })

  test('rejects an empty session id', () => {
    assert.throws(
      () => trainingSessionEntryDestination('active', '   '),
      /Training session id is required/
    )
  })
})

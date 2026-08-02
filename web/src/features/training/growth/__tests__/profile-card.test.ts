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
  buildTrainingProfileCardShareText,
  normalizeTrainingProfileCard,
  trainingProfileCardApiUrl,
} from '../profile-card'

describe('training profile card contract', () => {
  test('uses the narrow authenticated TalkWise proxy', () => {
    assert.equal(
      trainingProfileCardApiUrl(),
      '/api/talkwise/growth/profile-card'
    )
  })

  test('keeps only communication-core-v1 dimensions and finite scores', () => {
    assert.deepEqual(
      normalizeTrainingProfileCard({
        summary: 'Builds alignment before proposing a solution.',
        scores: {
          attentiveness: 5,
          expression: 4.25,
          composure: 0,
          persuasion: 5,
        },
      }),
      {
        summary: 'Builds alignment before proposing a solution.',
        scores: { attentiveness: 5, expression: 4.25 },
      }
    )
  })

  test('keeps a real insufficient-data response empty', () => {
    assert.deepEqual(
      normalizeTrainingProfileCard({
        summary: 'Complete at least two evaluated sessions.',
        scores: {},
      }),
      {
        summary: 'Complete at least two evaluated sessions.',
        scores: {},
      }
    )
    assert.throws(() => normalizeTrainingProfileCard(null), /invalid/)
  })

  const profileCard = {
    summary: 'Builds alignment.',
    scores: {},
  } as const

  test('keeps invitation attribution out of share text by default', () => {
    const text = buildTrainingProfileCardShareText(profileCard)

    assert.equal(text, 'TalkWise communication profile\nBuilds alignment.')
    assert.doesNotMatch(text, /sign-up|affiliate|token|user_id/i)
  })

  test('adds only an explicitly supplied registration link to share text', () => {
    const invitationLink = 'https://talkwise.test/sign-up?aff=referral-code'
    const text = buildTrainingProfileCardShareText(profileCard, invitationLink)

    assert.equal(
      text,
      `TalkWise communication profile\nBuilds alignment.\nTrain with TalkWise\n${invitationLink}`
    )
    assert.doesNotMatch(text, /token|user_id/i)
  })

  test('ignores a blank optional registration link', () => {
    assert.equal(
      buildTrainingProfileCardShareText(profileCard, '   '),
      buildTrainingProfileCardShareText(profileCard)
    )
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/http-client'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T | null
}

export interface TrainingProfileCard {
  readonly summary: string
  readonly scores: Readonly<Record<string, number>>
}

const PROFILE_CARD_API = '/api/talkwise/growth/profile-card'
const PROFILE_DIMENSIONS = new Set([
  'attentiveness',
  'expression',
  'coordination',
  'composure',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function trainingProfileCardApiUrl(): string {
  return PROFILE_CARD_API
}

export function normalizeTrainingProfileCard(
  value: unknown
): TrainingProfileCard {
  const raw = asRecord(value)
  if (!raw) throw new Error('TalkWise returned an invalid profile card')

  const scores = Object.fromEntries(
    Object.entries(asRecord(raw.scores) ?? {}).flatMap(([key, score]) => {
      const normalizedKey = key.trim()
      return PROFILE_DIMENSIONS.has(normalizedKey) &&
        typeof score === 'number' &&
        Number.isFinite(score) &&
        score >= 1 &&
        score <= 5
        ? [[normalizedKey, score]]
        : []
    })
  )

  return {
    summary: asText(raw.summary),
    scores,
  }
}

export function buildTrainingProfileCardShareText(
  card: TrainingProfileCard,
  invitationLink?: string
): string {
  const lines = ['TalkWise communication profile']
  if (card.summary) lines.push(card.summary)
  const normalizedInvitationLink = invitationLink?.trim()
  if (normalizedInvitationLink) {
    lines.push('Train with TalkWise', normalizedInvitationLink)
  }
  return lines.join('\n')
}

export async function generateTrainingProfileCard(): Promise<TrainingProfileCard> {
  const response = await api.post<TalkWiseResponse<unknown>>(
    trainingProfileCardApiUrl(),
    undefined,
    { skipBusinessError: true, skipErrorHandler: true }
  )
  if (response.data.code !== 0 || response.data.data === null) {
    throw new Error(response.data.message || 'TalkWise profile request failed')
  }
  return normalizeTrainingProfileCard(response.data.data)
}

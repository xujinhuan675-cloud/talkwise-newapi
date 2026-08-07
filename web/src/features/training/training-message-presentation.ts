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

export interface TrainingMessageEmotion {
  readonly label: string | null
  readonly score: number | null
}

export interface TrainingMessagePresentation {
  readonly parentheticalTexts: readonly string[]
  readonly content: string
  readonly emotion: TrainingMessageEmotion
}

const EMOTION_TAG_RE = /<!--emotion:\s*\{.*?\}\s*-->/gis
const TRAILING_EMOTION_TAG_RE = /\s*<!--emotion:.*$/is
const EMOTION_VALUE_RE = /<!--emotion:\s*(\{.*?\})\s*-->/is
const PARENTHETICAL_RE = /[（(]([^（）()\n]*)[）)]/g

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

function scoreValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const score = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(score) || score < -5 || score > 5) return null
  return Number.isInteger(score) ? score : null
}

function emotionFromContent(content: string): TrainingMessageEmotion {
  const match = EMOTION_VALUE_RE.exec(content)
  if (!match) return { label: null, score: null }
  try {
    const value = recordValue(JSON.parse(match[1]))
    return {
      label: textValue(value?.label),
      score: scoreValue(value?.score),
    }
  } catch {
    return { label: null, score: null }
  }
}

function emotionFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  fallback: TrainingMessageEmotion
): TrainingMessageEmotion {
  const source =
    recordValue(metadata?.trainingEmotion ?? metadata?.training_emotion) ??
    recordValue(metadata?.emotion)
  return {
    label: textValue(source?.label ?? metadata?.emotionLabel) ?? fallback.label,
    score:
      scoreValue(source?.score ?? metadata?.emotionScore) ?? fallback.score,
  }
}

export function stripTrainingEmotionMarkers(content: string): string {
  return content
    .replace(EMOTION_TAG_RE, '')
    .replace(TRAILING_EMOTION_TAG_RE, '')
    .trim()
}

export function trainingMessagePresentation(
  content: string,
  metadata?: Readonly<Record<string, unknown>>,
  emotionScore?: number | null,
  emotionLabel?: string | null
): TrainingMessagePresentation {
  const contentEmotion = emotionFromContent(content)
  const emotion = emotionFromMetadata(metadata, {
    score: scoreValue(emotionScore) ?? contentEmotion.score,
    label: textValue(emotionLabel) ?? contentEmotion.label,
  })
  const cleanContent = stripTrainingEmotionMarkers(content)
  const parentheticalTexts: string[] = []
  let match: RegExpExecArray | null
  PARENTHETICAL_RE.lastIndex = 0
  while ((match = PARENTHETICAL_RE.exec(cleanContent)) !== null) {
    parentheticalTexts.push(match[0])
  }
  return { parentheticalTexts, content: cleanContent, emotion }
}

export function formatTrainingMessageForDisplay(
  content: string,
  metadata?: Readonly<Record<string, unknown>>
): string {
  const presentation = trainingMessagePresentation(content, metadata)
  let result = ''
  let lastIndex = 0
  PARENTHETICAL_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PARENTHETICAL_RE.exec(presentation.content)) !== null) {
    result += presentation.content.slice(lastIndex, match.index)
    result += `*${match[0]}*`
    lastIndex = match.index + match[0].length
  }
  return `${result}${presentation.content.slice(lastIndex)}`.trim()
}

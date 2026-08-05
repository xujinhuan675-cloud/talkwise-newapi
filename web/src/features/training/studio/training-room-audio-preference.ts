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
import type { TrainingRoomMessage } from './training-room-client'

const AUDIO_OUTPUT_KEY = 'talkwise.training.voice-audio-enabled'
const OPENING_PLAYBACK_PREFIX = 'talkwise.training.opening-audio-played'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadTrainingRoomAudioEnabled(
  storage: StorageLike | null,
  fallback: boolean
): boolean {
  const stored = storage?.getItem(AUDIO_OUTPUT_KEY)
  if (stored === 'true') return true
  if (stored === 'false') return false
  return fallback
}

export function saveTrainingRoomAudioEnabled(
  storage: StorageLike | null,
  enabled: boolean
): void {
  storage?.setItem(AUDIO_OUTPUT_KEY, String(enabled))
}

function openingPlaybackKey(sessionId: string, messageId: string): string {
  return `${OPENING_PLAYBACK_PREFIX}:${sessionId.trim()}:${messageId.trim()}`
}

export function hasPlayedTrainingOpening(
  storage: StorageLike | null,
  sessionId: string,
  messageId: string
): boolean {
  if (!sessionId.trim() || !messageId.trim()) return false
  return storage?.getItem(openingPlaybackKey(sessionId, messageId)) === 'true'
}

export function markTrainingOpeningPlayed(
  storage: StorageLike | null,
  sessionId: string,
  messageId: string
): void {
  if (!sessionId.trim() || !messageId.trim()) return
  storage?.setItem(openingPlaybackKey(sessionId, messageId), 'true')
}

export function findTrainingOpeningMessage(
  messages: readonly TrainingRoomMessage[]
): TrainingRoomMessage | null {
  return (
    messages.find((message) => {
      if (message.senderType !== 'persona' || !message.content.trim()) {
        return false
      }
      const source = String(message.metadata.source ?? '').trim()
      const eventKind = String(message.metadata.eventKind ?? '').trim()
      return (
        eventKind === 'scenario_opening' ||
        source === 'training_opening_message' ||
        source === 'scenario_training_opening'
      )
    }) ?? null
  )
}

export function trainingOpeningSpeechLanguage(
  content: string,
  interfaceLanguage: string
): string {
  if (/\p{Script=Han}/u.test(content)) return 'zh-CN'
  return interfaceLanguage.trim() || 'en-US'
}

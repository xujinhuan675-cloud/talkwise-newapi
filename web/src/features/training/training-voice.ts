/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type TrainingVoiceId = string

export interface TrainingVoiceProfile {
  readonly id: TrainingVoiceId
  readonly provider: string
  readonly service: string
  readonly model: string
  readonly englishLabel: string
  readonly chineseLabel: string
  readonly language: string
  readonly tags: readonly string[]
  readonly supportsEmotion: boolean
  readonly supportsSpeed: boolean
  readonly supportsLoudness: boolean
  readonly supportsPitch: boolean
  readonly supportsRealtimeS2s: boolean
}

export interface TrainingVoiceOption {
  readonly id: TrainingVoiceId
  readonly englishLabel: string
  readonly chineseLabel: string
}

type TrainingVoiceLabelSource = Pick<
  TrainingVoiceProfile,
  'id' | 'chineseLabel'
>

export function trainingVoiceDisplayName(
  voiceId: string | null | undefined,
  voices: readonly TrainingVoiceLabelSource[] = TRAINING_VOICE_OPTIONS
): string {
  const normalizedId = voiceId?.trim()
  if (!normalizedId) return '未设置音色'
  return (
    voices.find((voice) => voice.id === normalizedId)?.chineseLabel ??
    `未验证音色（${normalizedId}）`
  )
}

export const DEFAULT_TRAINING_VOICE_ID: TrainingVoiceId =
  'zh_female_vv_uranus_bigtts'

export const TRAINING_VOICE_OPTIONS: readonly TrainingVoiceOption[] = [
  {
    id: DEFAULT_TRAINING_VOICE_ID,
    englishLabel: 'Vivi 2.0',
    chineseLabel: 'Vivi 2.0（活泼女声）',
  },
  {
    id: 'zh_female_tianmeitaozi_mars_bigtts',
    englishLabel: 'Tianmei Taozi',
    chineseLabel: '甜美桃子（温柔女声）',
  },
  {
    id: 'zh_male_dayi_saturn_bigtts',
    englishLabel: 'Da Yi',
    chineseLabel: '大壹（沉稳男声）',
  },
  {
    id: 'zh_male_ruyayichen_saturn_bigtts',
    englishLabel: 'Ruya Yichen',
    chineseLabel: '儒雅逸辰（儒雅男声）',
  },
] as const

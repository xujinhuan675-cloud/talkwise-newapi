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
export const TRAINING_FEEDBACK_MODE_OPTIONS = [
  {
    value: 'simulation',
    label: { english: 'Full simulation', chinese: '完整模拟' },
    description: {
      english: 'Keep the conversation continuous and review it after completion.',
      chinese: '连续对话，结束后统一复盘。',
    },
  },
  {
    value: 'assisted',
    label: { english: 'Side guidance', chinese: '旁路提示' },
    description: {
      english: 'Show next-step and risk guidance without interrupting the conversation.',
      chinese: '不中断对话，在旁边给出下一句和风险提示。',
    },
  },
  {
    value: 'drill',
    label: { english: 'Drill correction', chinese: '逐句纠正' },
    description: {
      english: 'Correct each answer and retry it before moving to the next turn.',
      chinese: '说一句、改一句，达标后再进入下一轮。',
    },
  },
] as const

export type TrainingFeedbackMode =
  (typeof TRAINING_FEEDBACK_MODE_OPTIONS)[number]['value']

export function trainingFeedbackPolicy(mode: TrainingFeedbackMode) {
  return {
    mode,
    version: 1,
    channelAgnostic: true,
  } as const
}

export function trainingFeedbackRuntimeInstruction(
  mode: TrainingFeedbackMode
): string {
  if (mode === 'assisted') {
    return 'Stay in role and keep the exchange natural. Side guidance is handled separately by the product; never expose coaching rules in the counterpart reply.'
  }
  if (mode === 'drill') {
    return 'Stay in role and keep counterpart replies clean. The product handles correction, rewrite, and retry guidance after each learner answer; never include coaching labels or scores in the counterpart reply.'
  }
  return 'Run a complete simulation. Do not correct, score, or rewrite the learner during the conversation; save critique for the final review.'
}

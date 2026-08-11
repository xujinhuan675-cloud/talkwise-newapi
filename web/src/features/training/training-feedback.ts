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
    label: { english: 'Immersive simulation', chinese: '沉浸模拟' },
    description: {
      english:
        'Roleplay only. No in-session coaching; review the conversation after you finish.',
      chinese: '仅进行对话模拟，过程中不提示，结束后统一复盘。',
    },
  },
  {
    value: 'assisted',
    label: { english: 'Side guidance', chinese: '旁路提示' },
    description: {
      english:
        'Keep the roleplay reply clean. Show next-step and risk guidance only in the Coach panel after each turn.',
      chinese:
        'AI 回复保持角色，只在右侧教练面板显示下一步和风险提示。',
    },
  },
  {
    value: 'drill',
    label: { english: 'Drill correction', chinese: '逐句纠正' },
    description: {
      english:
        'Each answer is held before it reaches the counterpart; after checking the correction, continue as said or answer again.',
      chinese:
        '每次回答先暂存、不发给对方；查看纠正后，可以按原话继续或重新回答。',
    },
  },
] as const

export type TrainingFeedbackMode =
  (typeof TRAINING_FEEDBACK_MODE_OPTIONS)[number]['value']

export interface TrainingFeedbackEventLike {
  readonly eventType: string
  readonly severity: string
  readonly title: string
  readonly message: string
  readonly suggestedText?: string | null
}

export interface TrainingFeedbackEventDisplay {
  readonly severity: string
  readonly title: string
  readonly message: string
  readonly suggestedText: string | null
}

const ZH_EVENT_COPY: Record<
  string,
  Readonly<{
    title: string
    message: string
    suggestedText: string
  }>
> = {
  next_reply: {
    title: '下一步表达',
    message: '先回应对方的重点，再给出简洁回答，并留出确认空间。',
    suggestedText: '先回应对方的重点，再给出一个简洁答案，然后停下来确认。',
  },
  risk: {
    title: '风险提示',
    message: '对方表示出保留或异议，请先确认对方的顾虑，再继续表达。',
    suggestedText: '这个顾虑可以理解。您最关注的是影响、成本还是时间？',
  },
  omission: {
    title: '发现缺口',
    message: '当前对话中的需求探索还不够，先补问一个有针对性的问题。',
    suggestedText: '您当前最关注的条件或成功标准是什么？',
  },
  ask_back: {
    title: '补一个校准问题',
    message: '可以先了解对方的优先事项，让下一步表达更准确。',
    suggestedText: '在我继续之前，想先了解您当前最关注什么？',
  },
  delivery_nudge: {
    title: '表达提示',
    message: '最近的回答偏长，请先收拢核心观点，再停一下让对方回应。',
    suggestedText: '我先停一下，您想让我重点说明哪一部分？',
  },
  correction: {
    title: '逐句纠正',
    message: '这次回答尚未发给对方；先查看建议，再决定按原话继续或重新回答。',
    suggestedText: '先说结论，再补充一个具体原因或例子。',
  },
}

function normalizedEventType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/-/g, '_')
  if (normalized.includes('correct') || normalized.includes('rewrite')) {
    return 'correction'
  }
  if (normalized.includes('risk') || normalized.includes('objection')) {
    return 'risk'
  }
  if (normalized.includes('omission') || normalized.includes('gap')) {
    return 'omission'
  }
  if (normalized.includes('ask')) return 'ask_back'
  if (normalized.includes('delivery')) return 'delivery_nudge'
  return 'next_reply'
}

function containsHan(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value)
}

function localizedSeverity(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'warning' || normalized === 'warn') return '注意'
  if (normalized === 'critical' || normalized === 'error') return '重要'
  return '提示'
}

export function trainingFeedbackEventDisplay(
  event: TrainingFeedbackEventLike,
  language: string
): TrainingFeedbackEventDisplay {
  if (!language.toLowerCase().startsWith('zh')) {
    return {
      severity: event.severity,
      title: event.title,
      message: event.message,
      suggestedText: event.suggestedText ?? null,
    }
  }

  const copy = ZH_EVENT_COPY[normalizedEventType(event.eventType)]
  return {
    severity: localizedSeverity(event.severity),
    title: containsHan(event.title) ? event.title : copy.title,
    message: containsHan(event.message) ? event.message : copy.message,
    suggestedText:
      event.suggestedText == null
        ? null
        : containsHan(event.suggestedText)
          ? event.suggestedText
          : copy.suggestedText,
  }
}

export function trainingFeedbackCompletionDescription(
  mode: TrainingFeedbackMode
): Readonly<{ english: string; chinese: string }> {
  if (mode === 'assisted') {
    return {
      english:
        'The final review covers the full conversation; side guidance only supports the live exchange and does not replace the review.',
      chinese: '最终复盘覆盖整段对话；旁路提示只负责临场支持，不替代复盘。',
    }
  }
  if (mode === 'drill') {
    return {
      english:
        'The final review covers the full conversation; turn corrections improve the current answer and do not replace the review.',
      chinese: '最终复盘覆盖整段对话；逐句纠正只改进当下表达，不替代复盘。',
    }
  }
  return {
    english:
      'Immersive simulation only controls in-session feedback; the final review still covers the full conversation.',
    chinese: '沉浸模拟只控制对话中不打断；最终复盘仍覆盖整段对话。',
  }
}

export function trainingFeedbackModeFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  fallback: TrainingFeedbackMode = 'simulation'
): TrainingFeedbackMode {
  const value = metadata?.feedbackMode ?? metadata?.trainingFeedbackMode
  return value === 'assisted' || value === 'drill' || value === 'simulation'
    ? value
    : fallback
}

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
    return 'Stay in role and keep counterpart replies clean. The product holds each learner draft before delivery and lets the learner continue as said or answer again after correction; never include coaching labels or scores in the counterpart reply.'
  }
  return 'Run a complete simulation. Do not correct, score, or rewrite the learner during the conversation; save critique for the final review.'
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const CHINESE_ROLE_LABELS: Readonly<Record<string, string>> = {
  'account executive': '大客户销售',
  'account manager': '客户经理',
  'ai agent product manager candidate': 'AI Agent 产品经理候选人',
  'customer success manager': '客户成功经理',
  'customer success specialist': '客户成功专员',
  'product manager': '产品经理',
  'project lead': '项目负责人',
  'sales candidate': '销售候选人',
  salesperson: '销售顾问',
  'team member': '团队成员',
}

const CHINESE_VOICE_ROUTE_NAMES: Readonly<Record<string, string>> = {
  'openai near realtime': 'OpenAI 近实时',
  'doubao realtime standard': '豆包实时标准',
}

const CHINESE_VOICE_ROUTE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'platform managed stt, llm, and tts cascade for low cost practice.':
    '平台托管语音识别、语言模型和语音合成级联，适合低成本练习。',
  'platform managed native realtime voice route.':
    '平台托管的原生实时语音路线。',
}

export type TrainingLocalize = (english: string, chinese: string) => string

const CHINESE_EMOTION_KEYWORDS: readonly (readonly [RegExp, string])[] = [
  [/(angry|furious|rage)/i, '愤怒'],
  [/(pressur|demand|forceful|insist)/i, '施压'],
  [/(frustrat|annoy|dissatisf)/i, '不满'],
  [/(skeptic|doubt|question)/i, '质疑'],
  [/(resist|reject|oppos|defens)/i, '抵触'],
  [/(concern|wary|cautious|hesitat)/i, '谨慎'],
  [/(open|receptiv|willing|curious)/i, '开放'],
  [/(support|agree|positive|satisfied)/i, '支持'],
  [/(neutral|calm)/i, '中性'],
]

function usesChinese(language: string): boolean {
  return language.toLowerCase().startsWith('zh')
}

function scoreEmotionLabel(
  score: number | null | undefined,
  chinese: boolean
): string | null {
  if (score == null || !Number.isFinite(score)) return null
  if (score <= -4) return chinese ? '强烈抵触' : 'Strongly resistant'
  if (score <= -2) return chinese ? '抵触' : 'Resistant'
  if (score < 0) return chinese ? '谨慎' : 'Cautious'
  if (score === 0) return chinese ? '中性' : 'Neutral'
  if (score <= 2) return chinese ? '开放' : 'Receptive'
  return chinese ? '支持' : 'Supportive'
}

export function trainingEmotionDisplayLabel(
  label: string | null | undefined,
  score: number | null | undefined,
  language: string
): string | null {
  const value = label?.trim() || null
  const chinese = usesChinese(language)
  if (!value) return scoreEmotionLabel(score, chinese)

  if (chinese) {
    if (/[㐀-鿿]/u.test(value)) return value
    return (
      CHINESE_EMOTION_KEYWORDS.find(([pattern]) => pattern.test(value))?.[1] ??
      scoreEmotionLabel(score, true) ??
      '情绪'
    )
  }

  if (/[a-z]/i.test(value)) return value
  return scoreEmotionLabel(score, false) ?? 'Emotion'
}

export function trainingDifficultyDisplayLabel(
  difficulty: string,
  language: string
): string {
  const value = difficulty.trim()
  const labels = usesChinese(language)
    ? {
        easy: '简单',
        expert: '专家',
        hard: '困难',
        medium: '中等',
      }
    : {
        easy: 'Easy',
        expert: 'Expert',
        hard: 'Hard',
        medium: 'Medium',
      }
  return labels[value.toLowerCase() as keyof typeof labels] ?? value
}

export function trainingRoleDisplayLabel(
  role: string,
  language: string
): string {
  const value = role.trim()
  if (!usesChinese(language)) return value
  const key = value.toLowerCase().replaceAll(/[\s_-]+/g, ' ')
  const compactKey = key.replaceAll(' ', '')
  const knownRole = Object.entries(CHINESE_ROLE_LABELS).find(([candidate]) => {
    const compactCandidate = candidate.replaceAll(' ', '')
    return (
      key === candidate ||
      key.startsWith(`${candidate} `) ||
      compactKey === compactCandidate ||
      compactKey.startsWith(compactCandidate)
    )
  })
  return knownRole?.[1] ?? value
}

function normalizedDisplayKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, ' ')
}

export function trainingRoleLocalizedLabel(
  role: string,
  localize: TrainingLocalize
): string {
  const value = role.trim()
  const key = normalizedDisplayKey(value)
  const knownRole = Object.entries(CHINESE_ROLE_LABELS).find(
    ([candidate]) => key === candidate || key.startsWith(`${candidate} `)
  )
  return knownRole ? localize(value, knownRole[1]) : value
}

export function trainingVoiceRouteLocalizedName(
  route: Pick<{ id: string; name: string }, 'id' | 'name'>,
  localize: TrainingLocalize
): string {
  const chinese =
    CHINESE_VOICE_ROUTE_NAMES[normalizedDisplayKey(route.name)] ??
    CHINESE_VOICE_ROUTE_NAMES[normalizedDisplayKey(route.id)]
  return chinese ? localize(route.name, chinese) : route.name
}

export function trainingVoiceRouteLocalizedDescription(
  route: Pick<{ description: string }, 'description'>,
  localize: TrainingLocalize
): string {
  const chinese =
    CHINESE_VOICE_ROUTE_DESCRIPTIONS[normalizedDisplayKey(route.description)]
  return chinese ? localize(route.description, chinese) : route.description
}

export function trainingSessionStatusDisplayLabel(
  status: string | undefined,
  language: string
): string {
  const value = status?.trim().toLowerCase()
  const chinese = usesChinese(language)
  if (value === 'active') return chinese ? '进行中' : 'Active'
  if (value === 'completed') return chinese ? '已完成' : 'Completed'
  if (value === 'failed') return chinese ? '失败' : 'Failed'
  return chinese ? '已创建' : 'Created'
}

export function trainingInteractionModeDisplayLabel(
  mode: 'turn_based' | 'realtime' | undefined,
  language: string
): string | null {
  if (!mode) return null
  const chinese = usesChinese(language)
  if (mode === 'realtime') {
    return chinese ? '自然对话（可打断）' : 'Natural conversation (interruptible)'
  }
  return chinese ? '逐轮对话' : 'Turn-by-turn conversation'
}

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

import {
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
  type InterfaceLanguageCode,
} from '@/i18n/languages'

export const HOME_PAGE_CONFIG_OPTION = 'HomePageConfig'
export const HOME_PAGE_LANGUAGE_CODES = INTERFACE_LANGUAGE_OPTIONS.map(
  (language) => language.code
) as readonly InterfaceLanguageCode[]

export type HomePageSectionConfig = {
  stats: boolean
  features: boolean
  workflow: boolean
  cta: boolean
  scenarioSupport: boolean
}

export type HomePageHeroConfig = {
  badge: string
  title: string
  highlightedTitle: string
  description: string
  supportEyebrow: string
  supportDescription: string
}

export type HomePageCtaConfig = {
  titleFirst: string
  titleSecond: string
  description: string
  actionLabel: string
}

export type HomePageLocaleConfig = {
  hero: HomePageHeroConfig
  cta: HomePageCtaConfig
}

export type HomePageConfig = {
  version: 2
  sections: HomePageSectionConfig
  locales: Record<InterfaceLanguageCode, HomePageLocaleConfig>
}

const ENGLISH_HOME_PAGE_COPY: HomePageLocaleConfig = {
  hero: {
    badge: 'AI Communication Training',
    title: 'For every important conversation',
    highlightedTitle: 'be prepared',
    description:
      'Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.',
    supportEyebrow: 'Training scenarios',
    supportDescription:
      'Choose a goal, counterpart, and difficulty, then keep every modality in one training context.',
  },
  cta: {
    titleFirst: 'Prepare for the next',
    titleSecond: 'conversation that matters',
    description:
      'Enter the training workspace, choose a scenario, and begin a focused rehearsal.',
    actionLabel: 'Enter training',
  },
}

const CHINESE_HOME_PAGE_COPY: HomePageLocaleConfig = {
  hero: {
    badge: 'AI 沟通训练',
    title: '为每一次重要沟通',
    highlightedTitle: '做好准备',
    description:
      '把重要沟通放进可重复演练的真实场景，在对话中获得提示，并把每次复盘变成下一轮针对性训练。',
    supportEyebrow: '训练场景',
    supportDescription:
      '选择目标、对手角色与难度，让文本、语音与复盘共用同一训练上下文。',
  },
  cta: {
    titleFirst: '从下一场',
    titleSecond: '重要沟通开始准备',
    description: '进入训练工作台，选择你的场景，开始一次有针对性的演练。',
    actionLabel: '进入训练',
  },
}

function cloneLocaleConfig(value: HomePageLocaleConfig): HomePageLocaleConfig {
  return {
    hero: { ...value.hero },
    cta: { ...value.cta },
  }
}

function createDefaultLocales(): Record<
  InterfaceLanguageCode,
  HomePageLocaleConfig
> {
  return Object.fromEntries(
    INTERFACE_LANGUAGE_OPTIONS.map(({ code }) => [
      code,
      cloneLocaleConfig(
        code === 'zhCN' || code === 'zhTW'
          ? CHINESE_HOME_PAGE_COPY
          : ENGLISH_HOME_PAGE_COPY
      ),
    ])
  ) as Record<InterfaceLanguageCode, HomePageLocaleConfig>
}

export const DEFAULT_HOME_PAGE_CONFIG: HomePageConfig = {
  version: 2,
  sections: {
    stats: true,
    features: true,
    workflow: true,
    cta: true,
    scenarioSupport: true,
  },
  locales: createDefaultLocales(),
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null

  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.trim() || fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1') return true
    if (normalized === 'false' || normalized === '0') return false
  }
  return fallback
}

function parseLocaleConfig(
  value: unknown,
  fallback: HomePageLocaleConfig
): HomePageLocaleConfig {
  const parsed = isRecord(value) ? value : {}
  const hero = isRecord(parsed.hero) ? parsed.hero : {}
  const cta = isRecord(parsed.cta) ? parsed.cta : {}

  return {
    hero: {
      badge: readText(hero.badge, fallback.hero.badge),
      title: readText(hero.title, fallback.hero.title),
      highlightedTitle: readText(
        hero.highlightedTitle,
        fallback.hero.highlightedTitle
      ),
      description: readText(hero.description, fallback.hero.description),
      supportEyebrow: readText(
        hero.supportEyebrow,
        fallback.hero.supportEyebrow
      ),
      supportDescription: readText(
        hero.supportDescription,
        fallback.hero.supportDescription
      ),
    },
    cta: {
      titleFirst: readText(cta.titleFirst, fallback.cta.titleFirst),
      titleSecond: readText(cta.titleSecond, fallback.cta.titleSecond),
      description: readText(cta.description, fallback.cta.description),
      actionLabel: readText(cta.actionLabel, fallback.cta.actionLabel),
    },
  }
}

export function parseHomePageConfig(value: unknown): HomePageConfig {
  const parsed = parseRecord(value)
  const sections = isRecord(parsed?.sections) ? parsed.sections : {}
  const parsedLocales = isRecord(parsed?.locales) ? parsed.locales : null
  const legacyLocale = parsed
    ? { hero: parsed.hero, cta: parsed.cta }
    : undefined
  const defaultLocales = createDefaultLocales()

  return {
    version: 2,
    sections: {
      stats: readBoolean(sections.stats, true),
      features: readBoolean(sections.features, true),
      workflow: readBoolean(sections.workflow, true),
      cta: readBoolean(sections.cta, true),
      scenarioSupport: readBoolean(sections.scenarioSupport, true),
    },
    locales: Object.fromEntries(
      HOME_PAGE_LANGUAGE_CODES.map((language) => [
        language,
        parseLocaleConfig(
          parsedLocales?.[language] ?? legacyLocale,
          defaultLocales[language]
        ),
      ])
    ) as Record<InterfaceLanguageCode, HomePageLocaleConfig>,
  }
}

export function resolveHomePageLocale(
  config: HomePageConfig,
  language?: string | null
): HomePageLocaleConfig {
  const normalized = normalizeInterfaceLanguage(language)
  if (HOME_PAGE_LANGUAGE_CODES.includes(normalized as InterfaceLanguageCode)) {
    return config.locales[normalized as InterfaceLanguageCode]
  }
  return config.locales.en
}

export function serializeHomePageConfig(value: HomePageConfig): string {
  return JSON.stringify(parseHomePageConfig(value))
}

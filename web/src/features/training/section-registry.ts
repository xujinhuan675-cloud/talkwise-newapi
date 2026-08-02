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
import { createSectionRegistry } from '@/features/system-settings/utils/section-registry'

export const TRAINING_SIDEBAR_MODULE = 'training'
export const TRAINING_SIDEBAR_ITEM = 'studio'

export const TRAINING_DIRECT_ROUTE_PATHS = [
  '/training',
  '/training/scenarios',
  '/training/studio',
  '/training/live-coach',
  '/training/conversations',
  '/training/personas',
  '/training/personas/new',
  '/training/personas/:personaId',
  '/training/sessions',
  '/training/growth',
  '/training/growth/leaderboard',
  '/training/team/competencies',
  '/training/team/scenarios',
  '/training/team/members',
  '/training/prep/battle',
  '/training/prep/defense',
  '/training/settings',
] as const

export const TRAINING_LEGACY_SECTION_DESTINATIONS = {
  overview: '/training',
  scenarios: '/training/scenarios',
  sessions: '/training/sessions',
  growth: '/training/growth',
} as const

const TRAINING_SECTIONS = [
  {
    id: 'overview',
    titleKey: 'Overview',
    build: () => null,
  },
  {
    id: 'scenarios',
    titleKey: 'Scenarios',
    build: () => null,
  },
  {
    id: 'sessions',
    titleKey: 'Sessions',
    build: () => null,
  },
  {
    id: 'growth',
    titleKey: 'Growth',
    build: () => null,
  },
] as const

export type TrainingSectionId = (typeof TRAINING_SECTIONS)[number]['id']

const trainingRegistry = createSectionRegistry<
  TrainingSectionId,
  Record<string, never>,
  []
>({
  sections: TRAINING_SECTIONS,
  defaultSection: 'overview',
  basePath: '/training',
  urlStyle: 'path',
})

export const TRAINING_SECTION_IDS = trainingRegistry.sectionIds
export const TRAINING_DEFAULT_SECTION = trainingRegistry.defaultSection

export function resolveTrainingLegacySectionDestination(
  section: string
): string | null {
  return (
    TRAINING_LEGACY_SECTION_DESTINATIONS[
      section as keyof typeof TRAINING_LEGACY_SECTION_DESTINATIONS
    ] ?? null
  )
}

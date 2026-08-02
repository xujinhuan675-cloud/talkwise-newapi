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
export type TrainingFocusScope = 'recommended' | 'all' | 'custom'
export type TrainingLengthProfile = 'quick' | 'standard' | 'complete'
export type TrainingPressure = 'easy' | 'medium' | 'hard'

export interface TrainingPlanInput {
  readonly focusScope: TrainingFocusScope
  readonly selectedFocus: readonly string[]
  readonly pressure: TrainingPressure
  readonly lengthProfile: TrainingLengthProfile
}

export interface ResolvedTrainingPlan {
  readonly kind: string
  readonly focusScope: TrainingFocusScope
  readonly selectedFocus: readonly string[]
  readonly turnBudget: number
}

const TURN_BUDGETS: Record<TrainingLengthProfile, number> = {
  quick: 6,
  standard: 9,
  complete: 12,
}

export function trainingTurnBudget(profile: TrainingLengthProfile): number {
  return TURN_BUDGETS[profile]
}

export function scenarioPressure(difficulty: string): TrainingPressure {
  if (difficulty === 'easy') return 'easy'
  if (difficulty === 'medium') return 'medium'
  return 'hard'
}

export function trainingPlanMetadata(input: TrainingPlanInput) {
  const selected = [
    ...new Set(input.selectedFocus.map((item) => item.trim()).filter(Boolean)),
  ]
  return {
    version: 1,
    kind: 'conversation',
    focus: {
      scope: input.focusScope,
      selected,
    },
    pressure: input.pressure,
    length: {
      profile: input.lengthProfile,
      turnBudget: trainingTurnBudget(input.lengthProfile),
    },
    completion: {
      strategy: 'adaptive',
      explicitFinish: true,
    },
  }
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null
}

function textValue(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

export function resolveTrainingPlan(
  metadata: Readonly<Record<string, unknown>> | undefined
): ResolvedTrainingPlan | null {
  const plan = recordValue(metadata?.trainingPlan ?? metadata?.training_plan)
  const focus = recordValue(plan?.focus)
  const length = recordValue(plan?.length)
  const turnBudget = Number(length?.turnBudget ?? length?.turn_budget)
  if (!plan || !focus || !Number.isInteger(turnBudget) || turnBudget < 1) {
    return null
  }

  const scope = textValue(focus.scope)
  const focusScope: TrainingFocusScope =
    scope === 'all' || scope === 'custom' ? scope : 'recommended'
  const selectedFocus = Array.isArray(focus.selected)
    ? [
        ...new Set(
          focus.selected
            .map(textValue)
            .filter((item): item is string => item !== null)
        ),
      ]
    : []

  return {
    kind: textValue(plan.kind) ?? 'conversation',
    focusScope,
    selectedFocus,
    turnBudget,
  }
}

export function resolveBattlePrepPlan(
  metadata: Readonly<Record<string, unknown>> | undefined
): ResolvedTrainingPlan | null {
  const source = textValue(
    metadata?.training_source ?? metadata?.trainingSource
  )
  return source === 'battle_prep' ? resolveTrainingPlan(metadata) : null
}

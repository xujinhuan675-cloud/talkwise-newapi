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
  readonly lengthProfile: TrainingLengthProfile | null
  readonly turnBudget: number
  readonly minimumTurns: number
  readonly hardCapTurns: number
}

export type TrainingProgressState =
  | 'in_progress'
  | 'ready_to_finish'
  | 'hard_limit_reached'
  | 'completed'

export interface TrainingProgressSnapshot {
  readonly state: TrainingProgressState
  readonly source: 'server' | 'local'
  readonly learnerTurnCount: number
  readonly minimumTurns: number
  readonly targetTurns: number
  readonly hardCapTurns: number | null
  readonly coveredCount: number | null
  readonly totalCount: number | null
  readonly evidenceSufficient: boolean | null
  readonly reasonCodes: readonly string[]
  readonly completionReason: string | null
}

export const TRAINING_LENGTH_LIMITS: Record<
  TrainingLengthProfile,
  Readonly<{ targetTurns: number; minimumTurns: number; hardCapTurns: number }>
> = {
  quick: { targetTurns: 6, minimumTurns: 3, hardCapTurns: 8 },
  standard: { targetTurns: 9, minimumTurns: 5, hardCapTurns: 12 },
  complete: { targetTurns: 12, minimumTurns: 7, hardCapTurns: 16 },
}

export function trainingTurnBudget(profile: TrainingLengthProfile): number {
  return TRAINING_LENGTH_LIMITS[profile].targetTurns
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
      minimumTurns: TRAINING_LENGTH_LIMITS[input.lengthProfile].minimumTurns,
      hardCapTurns: TRAINING_LENGTH_LIMITS[input.lengthProfile].hardCapTurns,
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

function integerValue(value: unknown): number | null {
  let number = Number.NaN
  if (typeof value === 'number') number = value
  if (typeof value === 'string') number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null
}

export function resolveTrainingPlan(
  metadata: Readonly<Record<string, unknown>> | undefined
): ResolvedTrainingPlan | null {
  const plan = recordValue(metadata?.trainingPlan ?? metadata?.training_plan)
  const focus = recordValue(plan?.focus)
  const length = recordValue(plan?.length)
  const turnBudget = integerValue(length?.turnBudget ?? length?.turn_budget)
  if (!plan || !focus || turnBudget === null || turnBudget < 1) {
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

  const profileValue = textValue(length?.profile)
  const lengthProfile =
    profileValue === 'quick' ||
    profileValue === 'standard' ||
    profileValue === 'complete'
      ? profileValue
      : null
  const defaults = lengthProfile
    ? TRAINING_LENGTH_LIMITS[lengthProfile]
    : {
        targetTurns: turnBudget,
        minimumTurns: Math.max(1, Math.ceil(turnBudget * (2 / 3))),
        hardCapTurns: Math.max(turnBudget + 1, Math.ceil(turnBudget * (4 / 3))),
      }
  const minimumTurns =
    integerValue(length?.minimumTurns ?? length?.minimum_turns) ??
    defaults.minimumTurns
  const hardCapTurns =
    integerValue(
      length?.hardCapTurns ?? length?.hard_cap_turns ?? length?.hardCap
    ) ?? defaults.hardCapTurns

  return {
    kind: textValue(plan.kind) ?? 'conversation',
    focusScope,
    selectedFocus,
    turnBudget,
    lengthProfile,
    minimumTurns,
    hardCapTurns,
  }
}

export function resolveBattlePrepPlan(
  metadata: Readonly<Record<string, unknown>> | undefined
): ResolvedTrainingPlan | null {
  const source = textValue(
    metadata?.training_source ?? metadata?.trainingSource ?? metadata?.source
  )
  return source === 'battle_prep' ? resolveTrainingPlan(metadata) : null
}

function trainingProgressRecord(
  metadata: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | null {
  return recordValue(metadata?.trainingProgress ?? metadata?.training_progress)
}

function trainingProgressState(value: unknown): TrainingProgressState | null {
  if (
    value === 'in_progress' ||
    value === 'ready_to_finish' ||
    value === 'hard_limit_reached' ||
    value === 'completed'
  ) {
    return value
  }
  return null
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function trainingProgressReasonCodes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.map(textValue).filter((item): item is string => item !== null)
    ),
  ]
}

/**
 * Resolves the shared session progress contract. A missing server snapshot
 * deliberately falls back to the selected plan and local learner turns only;
 * it never infers evidence sufficiency or a hard limit.
 */
export function resolveTrainingProgress(
  metadata: Readonly<Record<string, unknown>> | undefined,
  fallbackLearnerTurnCount = 0
): TrainingProgressSnapshot | null {
  const source = textValue(
    metadata?.source ?? metadata?.training_source ?? metadata?.trainingSource
  )
  const serverProgress = trainingProgressRecord(metadata)
  const plan = resolveTrainingPlan(metadata)
  if (
    !serverProgress &&
    source !== 'scenario_training' &&
    source !== 'battle_prep'
  ) {
    return null
  }

  const objectives = recordValue(
    serverProgress?.objectives ?? serverProgress?.objective_coverage
  )
  const evidence = recordValue(
    serverProgress?.evidence ?? serverProgress?.evidence_coverage
  )
  const targetTurns =
    integerValue(serverProgress?.targetTurns ?? serverProgress?.target_turns) ??
    plan?.turnBudget ??
    null
  if (targetTurns === null || targetTurns < 1) return null

  const learnerTurnCount =
    integerValue(
      serverProgress?.learnerTurnCount ?? serverProgress?.learner_turn_count
    ) ?? Math.max(0, Math.floor(fallbackLearnerTurnCount))
  const minimumTurns =
    integerValue(
      serverProgress?.minimumTurns ?? serverProgress?.minimum_turns
    ) ??
    plan?.minimumTurns ??
    0
  // A local fallback must not infer a safety cap. The server snapshot is the
  // only authoritative source for a hard limit or evidence conclusion.
  const hardCapTurns = serverProgress
    ? integerValue(
        serverProgress.hardCapTurns ??
          serverProgress.hard_cap_turns ??
          serverProgress.hardCap ??
          serverProgress.hard_cap
      )
    : null
  const state =
    trainingProgressState(serverProgress?.state ?? serverProgress?.status) ??
    'in_progress'
  const coveredCount = integerValue(
    objectives?.coveredCount ?? objectives?.covered_count
  ) ??
    arrayLength(
      evidence?.coveredTrainingPoints ?? evidence?.covered_training_points
    )
  const totalCount = integerValue(
    objectives?.totalCount ?? objectives?.total_count
  ) ??
    arrayLength(
      evidence?.requiredTrainingPoints ?? evidence?.required_training_points
    )

  const evidenceSufficient = serverProgress
    ? booleanValue(evidence?.sufficient ?? evidence?.evidenceSufficient)
    : null
  const completionReason = serverProgress
    ? textValue(
        serverProgress.completionReason ?? serverProgress.completion_reason
      )
    : null
  const reasonCodes = trainingProgressReasonCodes(
    serverProgress?.reasonCodes ?? serverProgress?.reason_codes
  )

  return {
    state,
    source: serverProgress ? 'server' : 'local',
    learnerTurnCount,
    minimumTurns,
    targetTurns,
    hardCapTurns,
    coveredCount,
    totalCount,
    evidenceSufficient,
    reasonCodes,
    completionReason,
  }
}

export function trainingProgressIsInputLocked(
  progress: TrainingProgressSnapshot | null
): boolean {
  return Boolean(
    progress &&
    (progress.state === 'hard_limit_reached' || progress.state === 'completed')
  )
}

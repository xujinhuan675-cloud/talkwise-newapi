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
export type PersonaVisibility = 'private' | 'team' | 'system'
export type PersonaSource = 'persona_asset' | 'system_template'

export interface PersonaSummary {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly parseStatus: string | null
  readonly supportsV2: boolean
  readonly source: PersonaSource
  readonly visibility: PersonaVisibility
  readonly version: number
  readonly canManage: boolean
  readonly readOnly: boolean
}

export interface PersonaDetail extends PersonaSummary {
  readonly organizationId: number | null
  readonly teamId: number | null
  readonly profileSummary: string | null
  readonly content: string
}

export interface PersonaHardRule {
  statement: string
  severity: string
}

export interface PersonaIdentity {
  background: string
  core_values: string[]
  hidden_agenda: string | null
  information_preference: string | null
}

export interface PersonaExpression {
  tone: string
  catchphrases: string[]
  interruption_tendency: string
}

export interface PersonaDecision {
  style: string
  risk_tolerance: string
  typical_questions: string[]
}

export interface PersonaEscalationChain {
  trigger: string
  steps: string[]
}

export interface PersonaInterpersonal {
  authority_mode: string
  triggers: string[]
  emotion_states: string[]
  escalation_chains: PersonaEscalationChain[]
}

export interface PersonaEvidence {
  claim: string
  citations: string[]
  confidence: number
  source_material_id: string
  layer: string
}

export interface PersonaV2 {
  id: string
  name: string
  role: string
  visibility: PersonaVisibility
  version: number
  can_manage: boolean
  read_only: boolean
  hard_rules: PersonaHardRule[]
  identity: PersonaIdentity | null
  expression: PersonaExpression | null
  decision: PersonaDecision | null
  interpersonal: PersonaInterpersonal | null
  user_context: string | null
  evidence: PersonaEvidence[]
  rejected_features: Record<string, number[]>
  source_materials: string[]
  training_snapshot: Record<string, unknown>
}

export type PersonaV2Patch = Pick<
  PersonaV2,
  | 'name'
  | 'role'
  | 'hard_rules'
  | 'identity'
  | 'expression'
  | 'decision'
  | 'interpersonal'
  | 'user_context'
  | 'rejected_features'
>

export interface CreatePersonaInput {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly content: string
  readonly visibility: Exclude<PersonaVisibility, 'system'>
}

export interface UpdatePersonaInput {
  readonly name?: string
  readonly role?: string
  readonly content?: string
  readonly visibility?: Exclude<PersonaVisibility, 'system'>
}

export interface DetectedSpeaker {
  readonly name: string
  readonly role: string
  readonly speakingTurns: number
  readonly dominanceLevel: string
  readonly sampleQuote: string
}

export type PersonaBuildEventType =
  | 'workspace_ready'
  | 'agent_tool_use'
  | 'agent_message'
  | 'parse_done'
  | 'adversarialize_start'
  | 'adversarialize_done'
  | 'enhancement_start'
  | 'enhancement_merge'
  | 'persist_done'
  | 'heartbeat'
  | 'error'

export interface PersonaBuildEvent {
  readonly seq: number
  readonly type: PersonaBuildEventType
  readonly ts: number
  readonly data: Record<string, unknown>
}

export interface BuildPersonaInput {
  readonly materials: readonly string[]
  readonly targetPersonaId?: string
  readonly name?: string
  readonly role?: string
}

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
export type TrainingMessageParticipant = {
  readonly avatarUrl: string | null
  readonly name: string
}

type TrainingParticipantSession = {
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly title?: string | null
}

type TrainingParticipantUser = {
  readonly avatar?: string
  readonly avatar_url?: string
  readonly display_name?: string
  readonly picture?: string
  readonly username?: string
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

export function trainingCounterpartParticipant(
  session: TrainingParticipantSession
): TrainingMessageParticipant {
  const scenario = recordValue(session.metadata?.scenario_training)
  const scenarioPersona = recordValue(scenario?.persona)
  const configuredPersona =
    recordValue(session.metadata?.counterpartPersona) ??
    recordValue(session.metadata?.runtimePersona)
  const persona = scenarioPersona ?? configuredPersona

  return {
    name:
      textValue(persona?.name ?? scenario?.persona_name) ??
      textValue(session.title) ??
      'Training counterpart',
    avatarUrl: textValue(
      persona?.avatarUrl ??
        persona?.avatar_url ??
        persona?.imageUrl ??
        persona?.image_url
    ),
  }
}

export function trainingUserParticipant(
  user: TrainingParticipantUser | null
): TrainingMessageParticipant {
  return {
    name: textValue(user?.display_name) ?? textValue(user?.username) ?? 'You',
    avatarUrl: textValue(user?.avatar_url ?? user?.avatar ?? user?.picture),
  }
}

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
export interface TeamCompetencyDimensionDTO {
  dimension_id: string
  score: number | null
  sample_count: number
  scenario_count: number
  state: 'exploring' | 'stable'
}

export interface TeamCompetencyRankingDTO {
  member_id: string
  member_name: string | null
  sample_count: number
  dimensions: TeamCompetencyDimensionDTO[]
}

export interface TeamScenarioRankingDTO {
  scenario_id: string
  member_id: string
  member_name: string | null
  rank: number
  completed_sessions: number
  scored_sessions: number
  average_score: number | null
  last_practiced_at: string | null
}

export interface TeamCompetencyDimension {
  readonly dimensionId: string
  readonly score: number | null
  readonly sampleCount: number
  readonly scenarioCount: number
  readonly state: 'exploring' | 'stable'
}

export interface TeamCompetencyRanking {
  readonly memberId: string
  readonly memberName: string | null
  readonly sampleCount: number
  readonly dimensions: TeamCompetencyDimension[]
}

export interface TeamScenarioRanking {
  readonly scenarioId: string
  readonly memberId: string
  readonly memberName: string | null
  readonly rank: number
  readonly completedSessions: number
  readonly scoredSessions: number
  readonly averageScore: number | null
  readonly lastPracticedAt: string | null
}

export type TrainingTeamRole = 'admin' | 'member' | 'owner'

export interface TrainingTeamDTO {
  id: string
  name: string
  created_time: number
  updated_time: number
}

export interface TrainingTeamMemberDTO {
  user_id: number
  username: string
  display_name: string
  email: string
  platform_role: number
  status: number
  gateway_group: string
  team_role: string
  membership_team_id: string
  membership_team_name: string
}

export interface TrainingTeam {
  readonly id: string
  readonly name: string
  readonly createdTime: number
  readonly updatedTime: number
}

export interface TrainingTeamMember {
  readonly userId: number
  readonly username: string
  readonly displayName: string | null
  readonly email: string | null
  readonly platformRole: number
  readonly status: number
  readonly gatewayGroup: string | null
  readonly teamRole: TrainingTeamRole | null
  readonly membershipTeamId: string | null
  readonly membershipTeamName: string | null
}

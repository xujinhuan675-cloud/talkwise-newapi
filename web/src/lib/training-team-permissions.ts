import { ROLE } from '@/lib/roles'
import type { AuthUser } from '@/stores/auth-store'

export function isPlatformOperator(user: AuthUser | null | undefined): boolean {
  return (user?.role ?? ROLE.GUEST) >= ROLE.ADMIN
}

export function isTrainingTeamManager(
  user: AuthUser | null | undefined
): boolean {
  if (isPlatformOperator(user)) return true
  return user?.team_role === 'owner' || user?.team_role === 'admin'
}

export function canManageAllTrainingTeams(
  user: AuthUser | null | undefined
): boolean {
  return isPlatformOperator(user)
}

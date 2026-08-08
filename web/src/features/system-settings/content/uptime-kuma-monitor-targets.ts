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

export const UPTIME_KUMA_MONITOR_TARGETS = [
  {
    id: 'gateway',
    titleKey: 'Platform gateway',
    descriptionKey:
      'Checks that the gateway process and its public status API are responding.',
    path: '/api/status',
    requiresHealthToken: false,
  },
  {
    id: 'backend',
    titleKey: 'TalkWise backend',
    descriptionKey:
      'Checks the TalkWise database, Redis, and storage readiness through the gateway proxy.',
    path: '/api/talkwise/health/ready',
    requiresHealthToken: true,
  },
  {
    id: 'voice',
    titleKey: 'Voice pipeline',
    descriptionKey:
      'Checks published voice routes and local runtime dependencies without making billable provider calls.',
    path: '/api/talkwise/health/voice/ready',
    requiresHealthToken: true,
  },
] as const

export function resolveUptimeMonitorUrl(origin: string, path: string): string {
  return origin ? `${origin.replace(/\/$/, '')}${path}` : path
}

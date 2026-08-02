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
/**
 * Application-wide constants
 */

// System Configuration Defaults
export const DEFAULT_SYSTEM_NAME = 'TalkWise'
export const DEFAULT_LOGO =
  '/brand-icons/talkwise-speech-wave-standard-1024.png'
export const DEFAULT_FAVICON =
  '/brand-icons/talkwise-speech-wave-tab-48.png?v=2'

export function resolveFaviconUrl(logo: string): string {
  return logo === DEFAULT_LOGO || logo === '/logo.png' ? DEFAULT_FAVICON : logo
}

export function resolveSystemName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  return !name || name.toLowerCase() === 'new api' ? DEFAULT_SYSTEM_NAME : name
}

// LocalStorage Keys
export const STORAGE_KEYS = {
  SYSTEM_NAME: 'system_name',
  LOGO: 'logo',
  FOOTER_HTML: 'footer_html',
} as const

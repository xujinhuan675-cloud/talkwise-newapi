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
 * Get message content styles based on role
 * Encapsulates styling logic for user and assistant messages
 */
export function getMessageContentStyles() {
  return [
    // Both participants use the same message surface; alignment carries role.
    'group-[.is-assistant]:w-fit',
    'group-[.is-user]:w-fit',

    'group-[.is-assistant]:rounded-2xl',
    'group-[.is-user]:rounded-2xl',
    'group-[.is-assistant]:bg-muted/70',
    'group-[.is-user]:bg-muted/70',
    'group-[.is-assistant]:px-4',
    'group-[.is-user]:px-4',
    'group-[.is-assistant]:py-2.5',
    'group-[.is-user]:py-2.5',
    'group-[.is-assistant]:text-foreground',
    'group-[.is-user]:text-foreground',

    // Preferred readable widths and wrapping
    'text-[0.95rem]',
    'leading-6',
    'break-words',
    'whitespace-pre-wrap',
    'sm:text-[0.975rem]',
    'sm:leading-7',

    // Keep both bubbles readable without turning either message into a banner.
    'group-[.is-assistant]:max-w-[85%]',
    'group-[.is-user]:max-w-[85%]',
    'sm:group-[.is-assistant]:max-w-[62ch]',
    'sm:group-[.is-user]:max-w-[62ch]',
    'md:group-[.is-assistant]:max-w-[68ch]',
    'md:group-[.is-user]:max-w-[68ch]',
    'lg:group-[.is-assistant]:max-w-[72ch]',
    'lg:group-[.is-user]:max-w-[72ch]',
  ].join(' ')
}

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

export type TrainingCompletionExitDestination =
  | {
      readonly kind: 'catalog'
      readonly to: '/training/scenarios'
    }
  | {
      readonly kind: 'review'
      readonly params: { readonly sessionId: string }
      readonly to: '/training/sessions/$sessionId'
    }

export function trainingCompletionExitDestination(
  generateReport: boolean,
  sessionId: string
): TrainingCompletionExitDestination {
  const normalizedSessionId = sessionId.trim()
  if (!normalizedSessionId) {
    throw new Error('completed training session id cannot be empty')
  }

  if (generateReport) {
    return {
      kind: 'review',
      params: { sessionId: normalizedSessionId },
      to: '/training/sessions/$sessionId',
    }
  }

  return {
    kind: 'catalog',
    to: '/training/scenarios',
  }
}

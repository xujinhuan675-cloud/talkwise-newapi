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
import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { TrainingSessionsPage } from '@/features/training/review/training-sessions'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

const trainingSessionSourceSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/)
const offsetDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)

const trainingSessionsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(undefined),
  query: z.string().max(200).optional().catch(''),
  scenario: z.array(z.string()).optional().catch([]),
  mode: z
    .array(z.enum(['text', 'voice', 'video', 'realtime']))
    .optional()
    .catch([]),
  source: z.array(trainingSessionSourceSchema).optional().catch([]),
  activityFrom: offsetDateTimeSchema.optional().catch(''),
  activityTo: offsetDateTimeSchema.optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/training/sessions')({
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('training', 'studio')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  validateSearch: trainingSessionsSearchSchema,
  component: TrainingSessionsRoute,
})

function TrainingSessionsRoute() {
  return <TrainingSessionsPage />
}

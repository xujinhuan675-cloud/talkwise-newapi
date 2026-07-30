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

import {
  TRAINING_DEFAULT_SECTION,
  TRAINING_SECTION_IDS,
} from '@/features/training/section-registry'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

export const Route = createFileRoute('/_authenticated/training/$section')({
  beforeLoad: ({ params }) => {
    if (!isSidebarModuleEnabled('training', 'studio')) {
      throw redirect({ to: '/dashboard' })
    }

    const validSections = TRAINING_SECTION_IDS as unknown as string[]
    if (!validSections.includes(params.section)) {
      throw redirect({
        to: '/training',
      })
    }

    const destinations: Record<string, string> = {
      overview: '/training',
      scenarios: '/training/scenarios',
      sessions: '/training/sessions',
      growth: '/training/growth',
    }
    throw redirect({
      to:
        destinations[params.section] ?? `/training/${TRAINING_DEFAULT_SECTION}`,
    })
  },
})

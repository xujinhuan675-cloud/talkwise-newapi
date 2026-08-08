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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import {
  parseHeaderNavModulesFromStatus,
  type HeaderNavModules,
} from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export type TopNavLink = {
  title: string
  href: string
  disabled?: boolean
  requiresAuth?: boolean
  external?: boolean
}

type BuildTopNavLinksOptions = {
  modules: HeaderNavModules
  docsLink?: string
  isAuthenticated: boolean
  translate: (key: string) => string
}

export function buildTopNavLinks({
  modules,
  docsLink,
  isAuthenticated,
  translate,
}: BuildTopNavLinksOptions): TopNavLink[] {
  const links: TopNavLink[] = []
  const trainingEnabled = modules.training !== false
  const isTrainingModuleEnabled = (value: unknown) =>
    typeof value === 'boolean' ? value : trainingEnabled

  if (modules.home !== false) {
    links.push({ title: translate('Home'), href: '/' })
  }

  if (modules.console !== false) {
    links.push({
      title: translate('Console'),
      href: '/dashboard',
      requiresAuth: !isAuthenticated,
    })
  }

  if (trainingEnabled) {
    links.push({
      title: translate('Training'),
      href: '/training',
      requiresAuth: !isAuthenticated,
    })
  }

  if (isTrainingModuleEnabled(modules.conversations)) {
    links.push({
      title: translate('Conversations'),
      href: '/training/conversations',
      requiresAuth: !isAuthenticated,
    })
  }

  if (isTrainingModuleEnabled(modules.review)) {
    links.push({
      title: translate('Review'),
      href: '/training/sessions',
      requiresAuth: !isAuthenticated,
    })
  }

  if (isTrainingModuleEnabled(modules.growth)) {
    links.push({
      title: translate('Growth'),
      href: '/training/growth',
      requiresAuth: !isAuthenticated,
    })
  }

  if (modules.pricing.enabled !== false) {
    links.push({
      title: translate('Model Square'),
      href: '/pricing',
      requiresAuth: modules.pricing.requireAuth && !isAuthenticated,
    })
  }

  if (modules.rankings.enabled !== false) {
    links.push({
      title: translate('Rankings'),
      href: '/rankings',
      requiresAuth: modules.rankings.requireAuth && !isAuthenticated,
    })
  }

  if (modules.docs !== false) {
    links.push(
      docsLink
        ? {
            title: translate('Docs'),
            href: docsLink,
            external: true,
          }
        : { title: translate('Docs'), href: '/docs' }
    )
  }

  if (modules.about !== false) {
    links.push({ title: translate('About'), href: '/about' })
  }

  return links
}

/** Generate top navigation links from the HeaderNavModules status option. */
export function useTopNavLinks(): TopNavLink[] {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { auth } = useAuthStore()

  const modules = useMemo(
    () =>
      parseHeaderNavModulesFromStatus(status as Record<string, unknown> | null),
    [status]
  )
  const docsLink = status?.docs_link as string | undefined

  return buildTopNavLinks({
    modules,
    docsLink,
    isAuthenticated: Boolean(auth?.user),
    translate: t,
  })
}

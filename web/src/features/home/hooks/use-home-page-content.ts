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
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { isHttpUrl } from '@/lib/content-format'

import { getHomePageContent } from '../api'
import type { HomePageContentResult } from '../types'

const STORAGE_KEY = 'home_page_content'

/**
 * Hook to load and manage custom home page content
 * Supports both Markdown/HTML content and iframe URLs
 */
export function useHomePageContent(): HomePageContentResult {
  const query = useQuery({
    queryKey: ['home-page-content'],
    queryFn: getHomePageContent,
    placeholderData: getCachedHomePageContent,
    staleTime: 5 * 60 * 1000,
  })

  const content = query.data?.success ? (query.data.data?.trim() ?? '') : ''

  useEffect(() => {
    try {
      if (content) {
        localStorage.setItem(STORAGE_KEY, content)
      } else if (query.isFetched) {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Ignore storage failures; the API response remains authoritative.
    }
  }, [content, query.isFetched])

  const isUrl = isHttpUrl(content)

  return { content, isLoaded: !query.isPending, isUrl }
}

function getCachedHomePageContent() {
  try {
    const cached = localStorage.getItem(STORAGE_KEY)?.trim()
    return cached ? { success: true, data: cached } : undefined
  } catch {
    return undefined
  }
}

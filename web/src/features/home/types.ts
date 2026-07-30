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
// ============================================================================
// Home Page Types
// ============================================================================

import type { ReactElement, ReactNode } from 'react'

/**
 * Response from home page content API
 */
export interface HomePageContentResponse {
  success: boolean
  message?: string
  data?: string
}

/**
 * Home page content result from hook
 */
export interface HomePageContentResult {
  content: string
  isLoaded: boolean
  isUrl: boolean
}

export interface HomeAction {
  id: string
  label: ReactNode
  render: ReactElement
  variant?: 'default' | 'outline'
  trailingIcon?: ReactNode
}

export interface HomeHeroSupportItem {
  id: string
  label: ReactNode
  icon?: ReactNode
  href?: string
  external?: boolean
}

export interface HomeHeroContent {
  badge: ReactNode
  title: ReactNode
  highlightedTitle: ReactNode
  description: ReactNode
  actions?: readonly HomeAction[]
  support?: {
    eyebrow: ReactNode
    description: ReactNode
    items: readonly HomeHeroSupportItem[]
  }
  preview?: ReactNode
  previewDemos?: readonly HomeHeroPreviewDemo[]
}

export type HomeHeroPreviewAccent = 'emerald' | 'amber' | 'blue' | 'violet'

export interface HomeHeroPreviewDemo {
  id: string
  label: ReactNode
  method: 'POST' | 'GET'
  endpoint: string
  headers: string[]
  request: string[]
  response: string[]
  responseHighlights: string[]
  tokens: number
  latency: number
  accent: HomeHeroPreviewAccent
  responseText?: string
  status?: ReactNode
  requestLabel?: ReactNode
  responseLabel?: ReactNode
  footerLabel?: ReactNode
  meta?: ReactNode
  body?: ReactNode
  footerContent?: ReactNode
}

export interface HomeStat {
  id: string
  end: number
  label: ReactNode
  suffix?: string
  prefix?: string
  decimals?: number
  duration?: number
}

export interface HomeFeatureContent {
  title: ReactNode
  description: ReactNode
  icon?: ReactNode
  visual?: ReactNode
}

export interface HomeFeaturesContent {
  eyebrow: ReactNode
  heading: readonly [ReactNode, ReactNode]
  primary: readonly [
    HomeFeatureContent,
    HomeFeatureContent,
    HomeFeatureContent,
    HomeFeatureContent,
  ]
  additional: readonly [
    HomeFeatureContent,
    HomeFeatureContent,
    HomeFeatureContent,
    HomeFeatureContent,
  ]
}

export interface HomeHowItWorksStep {
  id: string
  title: ReactNode
  description: ReactNode
  icon?: ReactNode
}

export interface HomeHowItWorksContent {
  eyebrow: ReactNode
  heading: ReactNode
  steps: readonly [HomeHowItWorksStep, HomeHowItWorksStep, HomeHowItWorksStep]
}

export interface HomeCtaContent {
  title: readonly [ReactNode, ReactNode]
  description: ReactNode
  actions: readonly HomeAction[]
}

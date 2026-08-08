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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { HeaderNavModules } from '@/lib/nav-modules'

import { buildTopNavLinks } from './use-top-nav-links'

const createModules = (
  overrides: Partial<HeaderNavModules>
): HeaderNavModules => ({
  home: false,
  console: false,
  training: false,
  conversations: false,
  review: false,
  growth: false,
  pricing: { enabled: false, requireAuth: false },
  rankings: { enabled: false, requireAuth: false },
  docs: false,
  about: false,
  ...overrides,
})

const buildHrefs = (modules: HeaderNavModules) =>
  buildTopNavLinks({
    modules,
    isAuthenticated: true,
    translate: (key) => key,
  }).map((link) => link.href)

describe('buildTopNavLinks', () => {
  test('shows training and review without conversations or growth', () => {
    assert.deepEqual(
      buildHrefs(createModules({ training: true, review: true })),
      ['/training', '/training/sessions']
    )
  })

  test('shows conversations and growth without training or review', () => {
    assert.deepEqual(
      buildHrefs(createModules({ conversations: true, growth: true })),
      ['/training/conversations', '/training/growth']
    )
  })

  test('inherits the legacy training switch when route switches are absent', () => {
    const legacyModules = createModules({ training: false })
    Reflect.deleteProperty(legacyModules, 'conversations')
    Reflect.deleteProperty(legacyModules, 'review')
    Reflect.deleteProperty(legacyModules, 'growth')

    assert.deepEqual(buildHrefs(legacyModules), [])
  })
})

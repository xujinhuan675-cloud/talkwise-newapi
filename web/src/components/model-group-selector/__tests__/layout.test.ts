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

import {
  modelGroupSelectorLayoutClasses,
  modelSelectorCategoryHeading,
  scrollSelectedOptionIntoView,
  shouldShowModelOptionSecondaryText,
} from '../layout'

describe('model group selector layout', () => {
  test('keeps group options at a fixed height and aligned to the top', () => {
    const groupScrollClasses =
      modelGroupSelectorLayoutClasses.groupScroll.split(' ')

    assert.ok(groupScrollClasses.includes('auto-rows-[2rem]'))
    assert.ok(groupScrollClasses.includes('content-start'))
  })

  test('centers the selected group inside its own scroll container', () => {
    const scrollCalls: ScrollToOptions[] = []
    const selectedOption = {
      offsetHeight: 32,
      offsetTop: 160,
      scrollIntoView() {},
    }
    const scrollContainer = {
      clientHeight: 200,
      scrollTop: 0,
      scrollTo(options: ScrollToOptions) {
        scrollCalls.push(options)
      },
    }

    scrollSelectedOptionIntoView(selectedOption, scrollContainer)

    assert.deepEqual(scrollCalls, [{ top: 76, behavior: 'auto' }])
  })

  test('falls back to scrollIntoView when no group container is provided', () => {
    const scrollCalls: ScrollIntoViewOptions[] = []
    const selectedOption = {
      scrollIntoView(options?: ScrollIntoViewOptions) {
        scrollCalls.push(options ?? {})
      },
    }

    scrollSelectedOptionIntoView(selectedOption)

    assert.deepEqual(scrollCalls, [{ block: 'center', inline: 'nearest' }])
  })

  test('can keep field options name-only without changing other selectors', () => {
    assert.equal(
      shouldShowModelOptionSecondaryText('field', false, 'Not ready'),
      false
    )
    assert.equal(
      shouldShowModelOptionSecondaryText('field', true, 'Model description'),
      true
    )
    assert.equal(
      shouldShowModelOptionSecondaryText('compact', true, 'Description'),
      false
    )
  })

  test('can render voice preset group names without the shared model suffix', () => {
    const withSuffix = (category: string) => `${category} Models`

    assert.equal(modelSelectorCategoryHeading('级联', true, withSuffix), '级联')
    assert.equal(
      modelSelectorCategoryHeading('Realtime', false, withSuffix),
      'Realtime Models'
    )
  })
})

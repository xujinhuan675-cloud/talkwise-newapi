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

import { getMessageAlignmentClass } from './message-layout-utils'
import { getMessageContentStyles } from './message-styles'

describe('playground message presentation', () => {
  test('keeps right-positioned message text left aligned', () => {
    const className = getMessageAlignmentClass('right')

    assert.match(className, /items-end/)
    assert.match(className, /text-left/)
    assert.doesNotMatch(className, /text-right/)
  })

  test('uses the same borderless bubble surface for both roles', () => {
    const className = getMessageContentStyles()

    assert.doesNotMatch(className, /group-\[\.is-user\]:border/)
    assert.doesNotMatch(className, /group-\[\.is-user\]:shadow/)
    assert.doesNotMatch(className, /group-\[\.is-assistant\]:border/)
    assert.doesNotMatch(className, /group-\[\.is-assistant\]:shadow/)
    assert.match(className, /group-\[\.is-user\]:bg-muted\/70/)
    assert.match(className, /group-\[\.is-assistant\]:bg-muted\/70/)
    assert.match(className, /group-\[\.is-user\]:rounded-2xl/)
    assert.match(className, /group-\[\.is-assistant\]:rounded-2xl/)
    assert.doesNotMatch(className, /group-\[\.is-assistant\]:bg-transparent/)
    assert.doesNotMatch(className, /group-\[\.is-assistant\]:rounded-none/)
  })
})

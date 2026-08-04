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
  DEFAULT_PLAYGROUND_INPUT_CAPABILITIES,
  resolvePlaygroundInputCapabilities,
} from '../playground-input-capabilities'

describe('playground input capabilities', () => {
  test('keeps every generic playground tool enabled by default', () => {
    assert.deepEqual(
      resolvePlaygroundInputCapabilities(),
      DEFAULT_PLAYGROUND_INPUT_CAPABILITIES
    )
  })

  test('lets a product surface hide unsupported tools without changing defaults', () => {
    assert.deepEqual(
      resolvePlaygroundInputCapabilities({
        attachments: false,
        search: false,
        parameters: false,
        clearMessages: false,
      }),
      {
        attachments: false,
        search: false,
        parameters: false,
        clearMessages: false,
      }
    )
    assert.deepEqual(DEFAULT_PLAYGROUND_INPUT_CAPABILITIES, {
      attachments: true,
      search: true,
      parameters: true,
      clearMessages: true,
    })
  })
})

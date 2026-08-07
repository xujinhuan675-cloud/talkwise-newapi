/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  trainingDifficultyDisplayLabel,
  trainingEmotionDisplayLabel,
  trainingRoleDisplayLabel,
  trainingSessionStatusDisplayLabel,
} from '../training-display-labels'

describe('training display labels', () => {
  test('localizes model-generated English emotion labels for Chinese UI', () => {
    assert.equal(
      trainingEmotionDisplayLabel(
        'pressuring for unplanned scope',
        -3,
        'zh-CN'
      ),
      '施压'
    )
    assert.equal(trainingEmotionDisplayLabel('质疑', -2, 'zh-CN'), '质疑')
  })

  test('falls back to a localized score band when the label language differs', () => {
    assert.equal(trainingEmotionDisplayLabel('谨慎观望', -3, 'en'), 'Resistant')
  })

  test('localizes stable session enums and catalog roles', () => {
    assert.equal(trainingDifficultyDisplayLabel('medium', 'zh-CN'), '中等')
    assert.equal(trainingSessionStatusDisplayLabel('active', 'zh-CN'), '进行中')
    assert.equal(
      trainingRoleDisplayLabel('Project Lead', 'zh-CN'),
      '项目负责人'
    )
    assert.equal(
      trainingRoleDisplayLabel('Custom role', 'zh-CN'),
      'Custom role'
    )
    assert.equal(
      trainingRoleDisplayLabel('sales_person extra', 'zh-Hans'),
      trainingRoleDisplayLabel('Salesperson', 'zh-CN')
    )
  })
})

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  formatTrainingMessageForDisplay,
  trainingMessagePresentation,
} from '../training-message-presentation'

describe('training message presentation', () => {
  test('keeps actions visible while extracting the private emotion marker', () => {
    const presentation = trainingMessagePresentation(
      '（皱眉）这个数字我不能接受。<!--emotion:{"score":-3,"label":"质疑"}-->'
    )

    assert.equal(presentation.content, '（皱眉）这个数字我不能接受。')
    assert.deepEqual(presentation.parentheticalTexts, ['（皱眉）'])
    assert.deepEqual(presentation.emotion, { label: '质疑', score: -3 })
    assert.equal(
      formatTrainingMessageForDisplay(presentation.content),
      '*（皱眉）*这个数字我不能接受。'
    )
  })

  test('keeps every model-provided parenthetical visible as display metadata', () => {
    const presentation = trainingMessagePresentation(
      '成本（含税）已经超预算。（模型决定显示的神态）'
    )

    assert.deepEqual(presentation.parentheticalTexts, [
      '（含税）',
      '（模型决定显示的神态）',
    ])
    assert.equal(
      formatTrainingMessageForDisplay(presentation.content),
      '成本*（含税）*已经超预算。*（模型决定显示的神态）*'
    )
  })
})

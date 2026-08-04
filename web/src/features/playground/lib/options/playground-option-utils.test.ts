import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { getModelFallback } from './playground-option-utils'

describe('playground model fallback', () => {
  const models = [
    { label: 'Embedding model', value: 'embedding-model' },
    { label: 'Ark model', value: 'doubao-seed-2-0-pro-260215' },
  ]

  test('prefers the configured training model when the saved model is unavailable', () => {
    assert.equal(
      getModelFallback(models, '1.2.1.1', 'doubao-seed-2-0-pro-260215'),
      'doubao-seed-2-0-pro-260215'
    )
  })

  test('keeps an available saved model', () => {
    assert.equal(
      getModelFallback(
        models,
        'embedding-model',
        'doubao-seed-2-0-pro-260215'
      ),
      null
    )
  })
})

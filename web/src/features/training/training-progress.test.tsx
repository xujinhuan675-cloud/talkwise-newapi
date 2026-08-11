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
import { renderToStaticMarkup } from 'react-dom/server'

import type { TrainingProgressSnapshot } from './training-plan'
import { TrainingProgressIndicator } from './training-progress'

const localize = (english: string) => english

function progress(
  state: TrainingProgressSnapshot['state']
): TrainingProgressSnapshot {
  return {
    state,
    source: 'server',
    learnerTurnCount: state === 'hard_limit_reached' ? 12 : 9,
    minimumTurns: 5,
    targetTurns: 9,
    hardCapTurns: 12,
    coveredCount: 6,
    totalCount: 8,
    evidenceSufficient: state !== 'in_progress',
    reasonCodes: [],
    completionReason: null,
  }
}

describe('training progress presentation contract', () => {
  test('makes a hard limit an explicit completion choice without safety wording', () => {
    const markup = renderToStaticMarkup(
      <TrainingProgressIndicator
        localize={localize}
        progress={progress('hard_limit_reached')}
      />
    )

    assert.match(markup, /Training complete/)
    assert.match(markup, /Choose how to finish/)
    assert.match(markup, /End directly or finish with a review/)
    assert.doesNotMatch(markup, /safety|safe limit/i)
    assert.doesNotMatch(markup, /continue the conversation/i)
  })

  test('keeps continued conversation available at the suggested-review target', () => {
    const markup = renderToStaticMarkup(
      <TrainingProgressIndicator
        localize={localize}
        progress={progress('ready_to_finish')}
      />
    )

    assert.match(markup, /Review suggested/)
    assert.match(markup, /continue the conversation/)
  })
})

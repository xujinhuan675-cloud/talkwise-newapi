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

import { CONVERSATION_ASSIST_COPY } from '../product-copy'

describe('conversation assistance product semantics', () => {
  test('names the product as in-conversation assistance instead of a realtime training mode', () => {
    assert.deepEqual(CONVERSATION_ASSIST_COPY.productName, {
      english: 'In-conversation assist',
      chinese: '临场辅助',
    })
    assert.doesNotMatch(
      CONVERSATION_ASSIST_COPY.productName.english,
      /live|realtime|training/i
    )
    assert.doesNotMatch(
      CONVERSATION_ASSIST_COPY.productName.chinese,
      /实时|训练/
    )
  })

  test('states that turns are entered manually and audio is not captured automatically', () => {
    assert.match(CONVERSATION_ASSIST_COPY.setupDescription.english, /ongoing/)
    assert.match(
      CONVERSATION_ASSIST_COPY.setupDescription.english,
      /not captured automatically/
    )
    assert.match(CONVERSATION_ASSIST_COPY.setupDescription.english, /manually/)
    assert.match(CONVERSATION_ASSIST_COPY.setupDescription.chinese, /正在进行/)
    assert.match(
      CONVERSATION_ASSIST_COPY.setupDescription.chinese,
      /不会自动采集音频/
    )
    assert.match(CONVERSATION_ASSIST_COPY.setupDescription.chinese, /手动输入/)
  })

  test('describes the two speakers as people in the current conversation', () => {
    assert.deepEqual(CONVERSATION_ASSIST_COPY.userSpeaker, {
      english: 'Me',
      chinese: '我',
    })
    assert.deepEqual(CONVERSATION_ASSIST_COPY.counterpartSpeaker, {
      english: 'Other person',
      chinese: '对方',
    })
  })
})

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

import { notifyTrainingRoomError } from '../training-room-error-notification'

describe('training room error notification', () => {
  test('shows one native notification with the shared error copy', () => {
    const notifications: Array<{
      description: string
      title: string
    }> = []

    notifyTrainingRoomError(
      'Realtime provider is unavailable.',
      (_english, chinese) => chinese,
      (title, options) => {
        notifications.push({ description: options.description, title })
      }
    )

    assert.deepEqual(notifications, [
      {
        description: 'Realtime provider is unavailable.',
        title: '操作未完成',
      },
    ])
  })

  test('does not show a notification when the child clears its error', () => {
    let notificationCount = 0

    notifyTrainingRoomError(
      null,
      (english) => english,
      () => {
        notificationCount += 1
      }
    )

    assert.equal(notificationCount, 0)
  })
})

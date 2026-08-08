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

import { shouldShowCheckinCard, sumCheckinQuota } from './checkin-presentation'

describe('check-in presentation', () => {
  test('hides all check-in UI when the system setting is disabled', () => {
    assert.equal(shouldShowCheckinCard(false, undefined), false)
    assert.equal(
      shouldShowCheckinCard(false, {
        enabled: true,
        stats: {
          checked_in_today: false,
          total_checkins: 0,
          total_quota: 0,
          checkin_count: 0,
          records: [],
        },
      }),
      false
    )
  })

  test('also hides stale UI when the check-in endpoint reports disabled', () => {
    assert.equal(
      shouldShowCheckinCard(true, {
        enabled: false,
        stats: {
          checked_in_today: false,
          total_checkins: 0,
          total_quota: 0,
          checkin_count: 0,
          records: [],
        },
      }),
      false
    )
  })

  test('sums persisted quota rewards for the selected month', () => {
    assert.equal(
      sumCheckinQuota([
        { checkin_date: '2026-08-01', quota_awarded: 1200 },
        { checkin_date: '2026-08-02', quota_awarded: 800 },
      ]),
      2000
    )
  })
})

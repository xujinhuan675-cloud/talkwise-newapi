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

export const WAVEFORM_MIN_BAR_COUNT = 12
export const WAVEFORM_MAX_BAR_COUNT = 64
const WAVEFORM_PIXELS_PER_BAR = 8

export function quietWaveformLevels(
  barCount = WAVEFORM_MIN_BAR_COUNT
): number[] {
  return Array.from({ length: Math.max(0, barCount) }, () => 0.08)
}

export const QUIET_WAVEFORM = quietWaveformLevels()

export function waveformBarCountForWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return WAVEFORM_MIN_BAR_COUNT
  return Math.max(
    WAVEFORM_MIN_BAR_COUNT,
    Math.min(
      WAVEFORM_MAX_BAR_COUNT,
      Math.floor(width / WAVEFORM_PIXELS_PER_BAR)
    )
  )
}

export function waveformLevelsFromFrequencyData(
  data: ArrayLike<number>,
  barCount = WAVEFORM_MIN_BAR_COUNT
): number[] {
  if (barCount <= 0) return []

  return Array.from({ length: barCount }, (_, index) => {
    if (data.length === 0) return 0.08

    const start = Math.floor((index * data.length) / barCount)
    const end = Math.min(
      data.length,
      Math.max(start + 1, Math.ceil(((index + 1) * data.length) / barCount))
    )
    let peak = 0
    for (let offset = start; offset < end; offset += 1) {
      peak = Math.max(peak, Number(data[offset]) || 0)
    }
    return Math.max(0.08, Math.min(1, peak / 255))
  })
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

import { useEffect, useRef } from 'react'

import {
  QUIET_WAVEFORM,
  waveformBarCountForWidth,
} from './turn-based-voice-waveform'

export function useResponsiveVoiceWaveform(
  onBarCountChange: (barCount: number) => void
) {
  const waveformContainerRef = useRef<HTMLDivElement | null>(null)
  const waveformBarCountRef = useRef(QUIET_WAVEFORM.length)
  const onBarCountChangeRef = useRef(onBarCountChange)
  onBarCountChangeRef.current = onBarCountChange

  useEffect(() => {
    const container = waveformContainerRef.current
    if (!container) return

    const updateBarCount = (width: number) => {
      const nextCount = waveformBarCountForWidth(width)
      if (waveformBarCountRef.current === nextCount) return
      waveformBarCountRef.current = nextCount
      onBarCountChangeRef.current(nextCount)
    }

    updateBarCount(container.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) updateBarCount(entry.contentRect.width)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return { waveformBarCountRef, waveformContainerRef }
}

import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { trainingSessionEntryDestination } from './session-entry-navigation'
import type { TrainingSessionStatus } from './types'

export function TrainingSessionEntryLink({
  children,
  className,
  sessionId,
  status,
}: {
  children?: ReactNode
  className?: string
  sessionId: string
  status: TrainingSessionStatus
}) {
  const destination = trainingSessionEntryDestination(status, sessionId)

  if (destination.kind === 'resume') {
    return (
      <Link
        className={className}
        search={destination.search}
        to={destination.to}
      >
        {children}
      </Link>
    )
  }

  return (
    <Link className={className} params={destination.params} to={destination.to}>
      {children}
    </Link>
  )
}

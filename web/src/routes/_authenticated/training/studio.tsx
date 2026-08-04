import { createFileRoute, redirect } from '@tanstack/react-router'

import { TrainingStudio } from '@/features/training/studio'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

function normalizeTrainingStudioSearch(search: Record<string, unknown>): {
  session?: string
} {
  const session =
    typeof search.session === 'string' ? search.session.trim() : ''
  return session ? { session } : {}
}

export const Route = createFileRoute('/_authenticated/training/studio')({
  validateSearch: normalizeTrainingStudioSearch,
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('training', 'studio')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: TrainingStudioPage,
})

function TrainingStudioPage() {
  const { session } = Route.useSearch()
  return <TrainingStudio sessionId={session} />
}

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { PlaygroundChat } from '@/features/playground/components/chat/playground-chat'
import type { Message as PlaygroundMessage } from '@/features/playground/types'

const assistantMessage = {
  key: 'assistant-1',
  from: 'assistant' as const,
  versions: [{ id: 'assistant-1', content: 'A regular chat reply.' }],
  status: 'complete' as const,
}

function renderChat(
  onEditMessage?: (message: PlaygroundMessage) => void
) {
  return renderToStaticMarkup(
    <PlaygroundChat
      messages={[assistantMessage]}
      {...(onEditMessage ? { onEditMessage } : {})}
    />
  )
}

describe('training conversation edit actions', () => {
  test('hides edit actions when the training caller omits the edit callback', () => {
    const markup = renderChat()

    expect(markup).not.toMatch(/aria-label="Edit"/)
    expect(markup).not.toMatch(/>Edit</)
  })

  test('keeps ordinary chat editing when the caller opts in', () => {
    const markup = renderChat(() => undefined)

    expect(markup).toMatch(/aria-label="Edit"/)
  })
})

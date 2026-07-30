/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import axios from 'axios'

import { api } from '@/lib/http-client'
import { useAuthStore } from '@/stores/auth-store'

const DEFAULT_CONVERSATION_API_BASE = '/api/talkwise/conversations'

interface TalkWiseResponse<T> {
  code: number
  message: string
  data: T
}

export interface ConversationRoom {
  id: number
  name: string
  type: 'private' | 'group' | 'battle_prep'
  persona_ids: string[]
  created_at: string | null
  last_message_at: string | null
}

export interface ConversationMessage {
  id: number
  room_id: number
  sender_type: 'user' | 'persona' | 'system'
  sender_id: string
  content: string
  timestamp: string | null
  metadata?: Record<string, unknown>
}

export interface ConversationRoomDetail {
  room: ConversationRoom
  messages: ConversationMessage[]
}

export interface ConversationPersona {
  id: string
  name: string
  role: string
  avatar_color: string | null
}

export type ConversationStreamEvent = {
  event: string
  data: unknown
}

function unwrap<T>(response: TalkWiseResponse<T>): T {
  if (response.code !== 0 || response.data === undefined) {
    throw new Error(response.message || 'TalkWise request failed')
  }
  return response.data
}

export function conversationApiUrl(apiBase: string, path: string): string {
  const base =
    apiBase.trim().replace(/\/+$/, '') || DEFAULT_CONVERSATION_API_BASE
  return `${base}${path}`
}

export function conversationRequestErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as
      | { detail?: string | { message?: string }; message?: string }
      | undefined
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : payload?.detail?.message
    return detail || payload?.message || error.message || fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export async function listConversationRooms(
  apiBase: string
): Promise<ConversationRoom[]> {
  const response = await api.get<TalkWiseResponse<ConversationRoom[]>>(
    conversationApiUrl(apiBase, '/rooms?limit=100'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return unwrap(response.data)
}

export async function getConversationRoom(
  apiBase: string,
  roomId: number
): Promise<ConversationRoomDetail> {
  const response = await api.get<TalkWiseResponse<ConversationRoomDetail>>(
    conversationApiUrl(apiBase, `/rooms/${roomId}?limit=200`),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return unwrap(response.data)
}

export async function deleteConversationRoom(
  apiBase: string,
  roomId: number
): Promise<void> {
  await api.delete<TalkWiseResponse<null>>(
    conversationApiUrl(apiBase, `/rooms/${roomId}`),
    { skipBusinessError: true, skipErrorHandler: true }
  )
}

export async function listConversationPersonas(
  apiBase: string
): Promise<ConversationPersona[]> {
  const response = await api.get<TalkWiseResponse<ConversationPersona[]>>(
    conversationApiUrl(apiBase, '/personas'),
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return unwrap(response.data)
}

export async function createConversationRoom(
  apiBase: string,
  input: {
    name: string
    type: 'private' | 'group'
    personaIds: string[]
  }
): Promise<ConversationRoom> {
  const response = await api.post<TalkWiseResponse<ConversationRoom>>(
    conversationApiUrl(apiBase, '/rooms'),
    {
      name: input.name,
      type: input.type,
      persona_ids: input.personaIds,
    },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return unwrap(response.data)
}

let defaultPersonaSequence = 0

export async function createDefaultConversationRoom(
  apiBase: string
): Promise<ConversationRoom> {
  defaultPersonaSequence += 1
  const personaId = `newapi-conversation-guide-${Date.now().toString(36)}-${defaultPersonaSequence}`
  await api.post<TalkWiseResponse<{ id: string }>>(
    conversationApiUrl(apiBase, '/personas'),
    {
      id: personaId,
      name: 'TalkWise Guide',
      role: 'Conversation partner',
      avatar_color: '#0f766e',
      content: [
        'You are the default TalkWise conversation partner.',
        'Keep replies concise, practical, and useful.',
      ].join('\n'),
      organization_id: null,
      team_id: null,
      temporary: true,
    },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return createConversationRoom(apiBase, {
    name: 'General conversation',
    type: 'private',
    personaIds: [personaId],
  })
}

export async function sendConversationMessage(
  apiBase: string,
  roomId: number,
  content: string
): Promise<ConversationMessage> {
  const response = await api.post<TalkWiseResponse<ConversationMessage>>(
    conversationApiUrl(apiBase, `/rooms/${roomId}/messages`),
    {
      content,
      metadata: { source: 'newapi_conversation_library' },
    },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  return unwrap(response.data)
}

function parseSseEvent(rawEvent: string): ConversationStreamEvent | null {
  const lines = rawEvent.split(/\r?\n/)
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }

  if (dataLines.length === 0) return null
  const data = dataLines.join('\n')
  try {
    return { event, data: JSON.parse(data) }
  } catch {
    return { event, data }
  }
}

export function streamConversationRoom(
  apiBase: string,
  roomId: number,
  handlers: {
    onEvent: (event: ConversationStreamEvent) => void
    onError: (error: Error) => void
  }
): () => void {
  const controller = new AbortController()
  const accessToken = useAuthStore.getState().auth.accessToken

  void (async () => {
    try {
      const response = await fetch(
        conversationApiUrl(apiBase, `/rooms/${roomId}/stream`),
        {
          credentials: 'include',
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
          signal: controller.signal,
        }
      )
      if (!response.ok || !response.body) {
        throw new Error(`Unable to connect to the conversation stream (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const rawEvent = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const event = parseSseEvent(rawEvent)
          if (event) handlers.onEvent(event)
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      handlers.onError(
        error instanceof Error
          ? error
          : new Error('Conversation stream disconnected')
      )
    }
  })()

  return () => controller.abort()
}

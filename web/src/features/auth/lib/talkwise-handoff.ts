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
import { api } from '@/lib/api'

const DEFAULT_TALKWISE_CLIENT_ID = 'talkwise'
const PENDING_TALKWISE_HANDOFF_KEY = 'newapi.talkwise_handoff.pending'
const TALKWISE_HANDOFF_STATE_PREFIX = 'newapi.talkwise_handoff.state.'

export interface TalkWiseHandoff {
  clientId: string
  redirectUri: string
  returnTo: string
  state?: string
}

export interface TalkWiseHandoffSearch {
  talkwise_client_id?: string
  talkwise_redirect_uri?: string
  talkwise_return?: string
  state?: string
}

interface TalkWiseHandoffResponse {
  success: boolean
  message?: string
  data?: {
    redirect_url?: string
  }
}

function normalizeText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text || undefined
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage ?? null
  } catch {
    return null
  }
}

function storageKeyForState(state: string): string {
  return `${TALKWISE_HANDOFF_STATE_PREFIX}${state}`
}

function readHandoffFromStorage(
  key: string,
  remove: boolean
): TalkWiseHandoff | null {
  const storage = getSessionStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(key)
    if (remove) storage.removeItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TalkWiseHandoff>
    return normalizeTalkWiseHandoff({
      talkwise_client_id: parsed.clientId,
      talkwise_redirect_uri: parsed.redirectUri,
      talkwise_return: parsed.returnTo,
      state: parsed.state,
    })
  } catch {
    return null
  }
}

export function normalizeTalkWiseHandoff(
  search: TalkWiseHandoffSearch
): TalkWiseHandoff | null {
  const returnTo = normalizeText(search.talkwise_return)
  const redirectUri = normalizeText(search.talkwise_redirect_uri) || returnTo
  if (!redirectUri) return null

  return {
    clientId:
      normalizeText(search.talkwise_client_id) ?? DEFAULT_TALKWISE_CLIENT_ID,
    redirectUri,
    returnTo: returnTo ?? redirectUri,
    state: normalizeText(search.state),
  }
}

export function hasTalkWiseHandoffSearch(
  search: TalkWiseHandoffSearch
): boolean {
  return normalizeTalkWiseHandoff(search) !== null
}

export function savePendingTalkWiseHandoff(
  handoff: TalkWiseHandoff | null | undefined
): void {
  const storage = getSessionStorage()
  if (!storage) return
  if (!handoff) {
    storage.removeItem(PENDING_TALKWISE_HANDOFF_KEY)
    return
  }
  try {
    storage.setItem(PENDING_TALKWISE_HANDOFF_KEY, JSON.stringify(handoff))
  } catch {
    // Handoff is best-effort for browser flows that leave the current page.
  }
}

export function peekPendingTalkWiseHandoff(): TalkWiseHandoff | null {
  return readHandoffFromStorage(PENDING_TALKWISE_HANDOFF_KEY, false)
}

export function clearPendingTalkWiseHandoff(): void {
  const storage = getSessionStorage()
  if (!storage) return
  storage.removeItem(PENDING_TALKWISE_HANDOFF_KEY)
}

export function saveTalkWiseHandoffForState(
  state: string,
  handoff: TalkWiseHandoff | null | undefined
): void {
  const flowState = normalizeText(state)
  const storage = getSessionStorage()
  if (!flowState || !handoff || !storage) return
  try {
    storage.setItem(storageKeyForState(flowState), JSON.stringify(handoff))
  } catch {
    // OAuth can still finish normally; only the TalkWise return is skipped.
  }
}

export function consumeTalkWiseHandoffForState(
  state: string | undefined
): TalkWiseHandoff | null {
  const flowState = normalizeText(state)
  if (!flowState) return null
  return readHandoffFromStorage(storageKeyForState(flowState), true)
}

export async function redirectToTalkWise(
  handoff: TalkWiseHandoff
): Promise<void> {
  const response = await api.post<TalkWiseHandoffResponse>(
    '/api/talkwise/auth/handoff',
    {
      client_id: handoff.clientId,
      redirect_uri: handoff.redirectUri,
      return_to: handoff.returnTo,
      state: handoff.state,
    },
    {
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  const redirectURL = normalizeText(response.data?.data?.redirect_url)
  if (!response.data?.success || !redirectURL) {
    throw new Error(response.data?.message || 'TalkWise handoff failed')
  }
  window.location.assign(redirectURL)
}

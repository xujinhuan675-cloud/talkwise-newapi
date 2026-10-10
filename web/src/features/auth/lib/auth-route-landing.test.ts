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
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { Route as SignInRoute } from '@/routes/(auth)/sign-in'
import { Route as SignUpRoute } from '@/routes/(auth)/sign-up'
import { Route as DashboardRoute } from '@/routes/_authenticated/dashboard/index'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

const bundle: AuthBundle = {
  access_token: 'authenticated-user',
  token_type: 'Bearer',
  access_expires_at: 9999999999,
  user: { id: 42, username: 'training-user', role: 1 },
  session: {
    sid: 'training-session',
    current: true,
    login_method: 'password',
    ip: '',
    user_agent: '',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}

const beforeSignIn = SignInRoute.options.beforeLoad as (context: {
  search: { redirect?: string }
}) => Promise<void>
const beforeSignUp = SignUpRoute.options.beforeLoad as () => Promise<void>
const beforeDashboard = DashboardRoute.options.beforeLoad as () => void

beforeEach(() => {
  useAuthStore.getState().auth.setBundle(bundle)
})

afterEach(() => {
  useAuthStore.getState().auth.reset('idle')
})

describe('authenticated public-auth page landing', () => {
  test('sends an already signed-in ordinary user to training instead of the administrator dashboard', async () => {
    await expect(beforeSignIn({ search: {} })).rejects.toMatchObject({
      options: { href: '/training', replace: true },
    })
  })

  test('sends an already signed-in user away from registration to training', async () => {
    await expect(beforeSignUp()).rejects.toMatchObject({
      options: { to: '/training' },
    })
  })

  test('preserves an explicit internal destination on a repeated sign-in visit', async () => {
    await expect(
      beforeSignIn({ search: { redirect: '/training/scenarios?category=sales' } })
    ).rejects.toMatchObject({
      options: { href: '/training/scenarios?category=sales' },
    })
  })

  test('uses training when a repeated sign-in visit has an external redirect', async () => {
    await expect(
      beforeSignIn({ search: { redirect: 'https://attacker.example/' } })
    ).rejects.toMatchObject({
      options: { href: '/training' },
    })
  })

  test('still denies an ordinary user who explicitly opens the administrator dashboard', () => {
    let result: unknown
    try {
      beforeDashboard()
    } catch (error) {
      result = error
    }
    expect(result).toMatchObject({ options: { to: '/403' } })
  })
})

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
import { Link, useSearch } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { AuthLayout } from '../auth-layout'
import { TermsFooter } from '../components/terms-footer'
import {
  normalizeTalkWiseHandoff,
  redirectToTalkWise,
} from '../lib/talkwise-handoff'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/(auth)/sign-in' })
  const { status } = useStatus()
  const user = useAuthStore((state) => state.auth.user)
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const talkWiseHandoff = useMemo(
    () => normalizeTalkWiseHandoff(search),
    [search]
  )

  useEffect(() => {
    if (!user || !talkWiseHandoff) return
    setHandoffError(null)
    void redirectToTalkWise(talkWiseHandoff).catch((error: unknown) => {
      setHandoffError(
        error instanceof Error ? error.message : t('Request failed')
      )
    })
  }, [talkWiseHandoff, t, user])

  if (user && talkWiseHandoff) {
    return (
      <AuthLayout>
        <div className='w-full space-y-4 text-center sm:text-left'>
          <h2 className='text-2xl font-semibold tracking-tight'>
            {t('Returning to TalkWise')}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {t('Please wait while NewAPI connects your account.')}
          </p>
          {handoffError ? (
            <p className='text-destructive text-sm'>{handoffError}</p>
          ) : null}
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t('Sign in')}
          </h2>
          {!status?.self_use_mode_enabled &&
            status?.register_enabled !== false && (
              <p className='text-muted-foreground text-left text-sm sm:text-base'>
                {t("Don't have an account?")}{' '}
                <Link
                  to='/sign-up'
                  className='hover:text-primary font-medium underline underline-offset-4'
                >
                  {t('Sign up')}
                </Link>
                .
              </p>
            )}
        </div>

        <UserAuthForm
          redirectTo={search.redirect}
          talkWiseHandoff={talkWiseHandoff}
        />

        <TermsFooter
          variant='sign-in'
          status={status}
          className='text-center'
        />
      </div>
    </AuthLayout>
  )
}

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
import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

import type { HomeAction, HomeHeroContent } from '../../types'
import { HeroTerminalDemo } from '../hero-terminal-demo'

export interface HeroProps {
  className?: string
  isAuthenticated?: boolean
  content?: HomeHeroContent
}

// Stylized three-dots indicator representing "More"
const MoreIcon = () => (
  <svg
    className='text-muted-foreground/60 group-hover:text-foreground size-6 shrink-0 transition-colors'
    viewBox='0 0 24 24'
    fill='none'
    xmlns='http://www.w3.org/2000/svg'
  >
    <circle cx='6' cy='12' r='2' fill='currentColor' />
    <circle cx='12' cy='12' r='2' fill='currentColor' />
    <circle cx='18' cy='12' r='2' fill='currentColor' />
  </svg>
)

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'

  const renderAction = (action: HomeAction) => (
    <Button
      key={action.id}
      variant={action.variant}
      className={
        action.variant === 'outline'
          ? 'border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
          : 'group h-11 rounded-lg px-5 text-sm font-medium'
      }
      render={action.render}
    >
      {action.label}
      {action.trailingIcon ??
        (action.variant !== 'outline' ? (
          <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
        ) : null)}
    </Button>
  )

  const renderDocsButton = () => {
    const isExternal = docsUrl.startsWith('http')
    if (isExternal) {
      return (
        <Button
          variant='outline'
          className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
          render={
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          }
        >
          <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
          <span>{t('Docs')}</span>
        </Button>
      )
    }
    return (
      <Button
        variant='outline'
        className='group border-border/50 hover:border-border hover:bg-muted/50 inline-flex h-11 items-center gap-1.5 rounded-lg px-5 text-sm font-medium'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='text-muted-foreground/80 group-hover:text-foreground size-4 transition-colors duration-200' />
        <span>{t('Docs')}</span>
      </Button>
    )
  }

  const renderActions = () => {
    if (props.content?.actions) {
      return props.content.actions.map(renderAction)
    }

    if (props.isAuthenticated) {
      return (
        <>
          <Button
            className='group h-11 rounded-lg px-5 text-sm font-medium'
            render={<Link to='/dashboard' />}
          >
            {t('Go to Dashboard')}
            <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
          </Button>
          {renderDocsButton()}
        </>
      )
    }

    return (
      <>
        <Button
          className='group h-11 rounded-lg px-5 text-sm font-medium'
          render={<Link to='/sign-up' />}
        >
          {t('Get Started')}
          <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
        </Button>
        <Button
          variant='outline'
          className='border-border/50 hover:border-border hover:bg-muted/50 h-11 rounded-lg px-5 text-sm font-medium'
          render={<Link to='/pricing' />}
        >
          {t('View Pricing')}
        </Button>
        {renderDocsButton()}
      </>
    )
  }

  return (
    <section className='relative z-10 overflow-hidden px-6 pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-36 lg:pb-28'>
      {/* Radial gradient background */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 opacity-25 dark:opacity-[0.12]'
        style={{
          background: [
            'radial-gradient(ellipse 60% 50% at 20% 20%, oklch(0.72 0.18 250 / 80%) 0%, transparent 70%)',
            'radial-gradient(ellipse 50% 40% at 80% 15%, oklch(0.65 0.15 200 / 60%) 0%, transparent 70%)',
            'radial-gradient(ellipse 40% 35% at 40% 80%, oklch(0.70 0.12 280 / 40%) 0%, transparent 70%)',
          ].join(', '),
        }}
      />
      {/* Grid pattern */}
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_30%,black_20%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.08]'
      />

      <div className='mx-auto grid max-w-6xl grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-8'>
        {/* Left Column: Title, description, action buttons and application support */}
        <div className='flex flex-col items-start text-left lg:col-span-6'>
          {/* Top Pill Badge */}
          <div
            className='landing-animate-fade-up mb-5 inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-[11px] font-medium text-blue-600 opacity-0 shadow-xs dark:border-blue-400/20 dark:bg-blue-400/5 dark:text-blue-400'
            style={{ animationDelay: '0ms' }}
          >
            <span className='relative flex size-1.5'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75' />
              <span className='relative inline-flex size-1.5 rounded-full bg-blue-500 dark:bg-blue-400' />
            </span>
            <span>
              {props.content?.badge ??
                t('AI Application Infrastructure Foundation')}
            </span>
          </div>

          <h1
            className='landing-animate-fade-up text-[clamp(2.25rem,4.5vw,3.25rem)] leading-[1.15] font-bold tracking-tight'
            style={{ animationDelay: '60ms' }}
          >
            {props.content?.title ?? t('Unified API Gateway for')}
            <br />
            <span className='bg-gradient-to-r from-blue-400 via-violet-400 to-purple-500 bg-clip-text text-transparent'>
              {props.content?.highlightedTitle ?? t('Vast Range of AI Models')}
            </span>
          </h1>
          <p
            className='landing-animate-fade-up text-muted-foreground/80 mt-5 max-w-xl text-base leading-relaxed opacity-0 md:text-[15px]'
            style={{ animationDelay: '120ms' }}
          >
            {props.content?.description ??
              t(
                'Access a vast selection of models via a standard, unified API protocol. Power AI applications, manage digital assets, and connect the Future.'
              )}
          </p>

          <div
            className='landing-animate-fade-up mt-8 flex flex-wrap items-center gap-3 opacity-0'
            style={{ animationDelay: '180ms' }}
          >
            {renderActions()}
          </div>

          {props.content?.support !== null && (
            <div
              className='landing-animate-fade-up mt-10 w-full max-w-xl opacity-0'
              style={{ animationDelay: '240ms' }}
            >
              <div className='mb-4 flex flex-col gap-1'>
                <span className='text-muted-foreground/50 text-[10px] font-bold tracking-[0.15em] uppercase'>
                  {props.content?.support?.eyebrow ??
                    t('Supported Applications')}
                </span>
                <p className='text-muted-foreground/60 text-xs leading-relaxed'>
                  {props.content?.support?.description ??
                    t(
                      'Supports one-click configuration and perfectly adapts to NewAPI multi-protocol configuration.'
                    )}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-3'>
                {props.content?.support ? (
                  props.content.support.items.map((item) => {
                    const className =
                      'group border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground flex items-center gap-3 rounded-full border px-5 py-2.5 text-sm font-medium shadow-[0_1px_2.5px_rgba(0,0,0,0.01)] backdrop-blur-xs transition-all duration-300 hover:scale-[1.02]'
                    const children = (
                      <>
                        {item.icon}
                        <span>{item.label}</span>
                      </>
                    )

                    return item.href ? (
                      <a
                        key={item.id}
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noopener noreferrer' : undefined}
                        className={className}
                      >
                        {children}
                      </a>
                    ) : (
                      <div key={item.id} className={className}>
                        {children}
                      </div>
                    )
                  })
                ) : (
                  <>
                    {/* Cherry Studio */}
                    <a
                      href='https://cherry-ai.com'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='group border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground flex items-center gap-3 rounded-full border px-5 py-2.5 text-sm font-medium shadow-[0_1px_2.5px_rgba(0,0,0,0.01)] backdrop-blur-xs transition-all duration-300 hover:scale-[1.02]'
                    >
                      <CherryStudio.Color size={24} className='shrink-0' />
                      <span>Cherry Studio</span>
                    </a>

                    {/* CC Switch */}
                    <a
                      href='https://ccswitch.io'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='group border-border/40 bg-muted/15 text-foreground/80 hover:border-border hover:bg-muted/30 hover:text-foreground flex items-center gap-3 rounded-full border px-5 py-2.5 text-sm font-medium shadow-[0_1px_2.5px_rgba(0,0,0,0.01)] backdrop-blur-xs transition-all duration-300 hover:scale-[1.02]'
                    >
                      <img
                        src='https://ccswitch.io/favicon.png'
                        alt='CC Switch'
                        className='size-6 shrink-0 rounded-md object-contain'
                        onError={(e) => {
                          // Fallback to a styled text avatar if the remote favicon fails to load in sandbox or local environments
                          e.currentTarget.style.display = 'none'
                          const fallback = e.currentTarget
                            .nextSibling as HTMLElement
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                      <span
                        style={{ display: 'none' }}
                        className='size-6 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-[10px] font-bold text-blue-600 dark:bg-blue-400/10 dark:text-blue-400'
                      >
                        CC
                      </span>
                      <span>CC Switch</span>
                    </a>

                    {/* "更多" */}
                    <div className='group border-border/40 bg-muted/15 text-foreground/55 hover:border-border hover:bg-muted/30 hover:text-foreground flex cursor-default items-center gap-2.5 rounded-full border px-5 py-2.5 text-sm font-medium shadow-[0_1px_2.5px_rgba(0,0,0,0.01)] backdrop-blur-xs transition-all duration-300 hover:scale-[1.02]'>
                      <MoreIcon />
                      <span>{t('More Apps')}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Hero Terminal API Demo */}
        <div
          className='landing-animate-fade-up flex w-full justify-center opacity-0 lg:col-span-6'
          style={{ animationDelay: '320ms' }}
        >
          {props.content && props.content.preview !== undefined ? (
            props.content.preview
          ) : (
            <HeroTerminalDemo
              className='mt-8 lg:mt-0'
              demos={props.content?.previewDemos}
            />
          )}
        </div>
      </div>
    </section>
  )
}

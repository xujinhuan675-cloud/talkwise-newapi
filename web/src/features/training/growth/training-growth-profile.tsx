/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  CircleAlert,
  Download,
  LoaderCircle,
  RefreshCw,
  Share2,
  UserRound,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { getAffiliateCode } from '@/features/wallet/api'
import { generateAffiliateLink } from '@/features/wallet/lib'
import { copyToClipboard } from '@/lib/copy-to-clipboard'

import { TrainingHostProvider, useTrainingHost } from '../host'
import {
  reviewRequestAccessState,
  reviewRequestErrorMessage,
} from '../review/api'
import { CommunicationProfileCard } from './communication-profile-card'
import {
  buildTrainingProfileCardShareText,
  generateTrainingProfileCard,
} from './profile-card'

async function captureCard(
  element: HTMLDivElement,
  errorMessage: string
): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas-pro')
  const canvas = await html2canvas(element, {
    backgroundColor: null,
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
  })
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  )
  if (!blob) throw new Error(errorMessage)
  return blob
}

function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'talkwise-communication-profile.png'
  link.click()
  URL.revokeObjectURL(url)
}

function TrainingGrowthProfileContent() {
  const { i18n, t } = useTranslation()
  const host = useTrainingHost()
  const cardRef = useRef<HTMLDivElement>(null)
  const [exportAction, setExportAction] = useState<'download' | 'share' | null>(
    null
  )
  const [includeInvitation, setIncludeInvitation] = useState(false)
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })
  const profileMutation = useMutation({
    mutationFn: generateTrainingProfileCard,
  })
  const affiliateQuery = useQuery({
    queryKey: ['training', 'growth', 'profile-card', 'affiliate-link'],
    enabled: host.authStatus === 'authenticated',
    queryFn: async () => {
      const response = await getAffiliateCode()
      if (!response.success) {
        throw new Error(
          response.message ||
            localize('Unable to load referral link', '无法加载推荐链接')
        )
      }
      return response.data ? generateAffiliateLink(response.data) : ''
    },
    staleTime: 5 * 60 * 1000,
  })

  if (host.authStatus === 'loading') {
    return <Skeleton className='h-96 w-full' />
  }
  if (host.authStatus === 'anonymous') {
    return (
      <Alert variant='destructive'>
        <CircleAlert />
        <AlertTitle>
          {localize('Sign-in required', '\u9700\u8981\u767b\u5f55')}
        </AlertTitle>
        <AlertDescription>
          {localize(
            'Your session is no longer available.',
            '\u5f53\u524d\u767b\u5f55\u4f1a\u8bdd\u5df2\u4e0d\u53ef\u7528\u3002'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  const card = profileMutation.data
  const errorState = profileMutation.error
    ? reviewRequestAccessState(profileMutation.error)
    : null
  const hasProfile = Boolean(card && Object.keys(card.scores).length)
  const learnerName =
    host.user?.displayName ||
    host.user?.username ||
    localize('Current learner', '\u5f53\u524d\u5b66\u5458')
  const invitationLink =
    includeInvitation && affiliateQuery.data ? affiliateQuery.data : undefined
  let invitationStatusText = localize(
    'No registration link is available for this account.',
    '\u5f53\u524d\u8d26\u53f7\u6ca1\u6709\u53ef\u7528\u7684\u6ce8\u518c\u9080\u8bf7\u94fe\u63a5\u3002'
  )
  if (affiliateQuery.isPending) {
    invitationStatusText = localize(
      'Loading your registration link...',
      '\u6b63\u5728\u52a0\u8f7d\u6ce8\u518c\u9080\u8bf7\u94fe\u63a5...'
    )
  } else if (affiliateQuery.isError) {
    invitationStatusText = localize(
      'Your registration link could not be loaded. Try again before enabling it.',
      '\u65e0\u6cd5\u52a0\u8f7d\u6ce8\u518c\u9080\u8bf7\u94fe\u63a5\uff0c\u8bf7\u91cd\u8bd5\u540e\u518d\u5f00\u542f\u3002'
    )
  } else if (affiliateQuery.data) {
    invitationStatusText = localize(
      'When enabled, the card image and shared message include your TalkWise registration QR code.',
      '\u5f00\u542f\u540e\uff0c\u540d\u7247\u56fe\u7247\u548c\u5206\u4eab\u6587\u6848\u4f1a\u5305\u542b\u4f60\u7684 TalkWise \u6ce8\u518c\u4e8c\u7ef4\u7801\u3002'
    )
  }

  const exportCard = async (action: 'download' | 'share') => {
    if (!card || !cardRef.current) return
    setExportAction(action)
    try {
      const blob = await captureCard(
        cardRef.current,
        localize(
          'Unable to create the profile card image',
          '无法生成沟通名片图片'
        )
      )
      if (action === 'download') {
        downloadBlob(blob)
        toast.success(
          localize(
            'Profile card downloaded',
            '\u6c9f\u901a\u540d\u7247\u5df2\u4e0b\u8f7d'
          )
        )
        return
      }

      const file = new File([blob], 'talkwise-communication-profile.png', {
        type: 'image/png',
      })
      const shareData: ShareData = {
        files: [file],
        title: localize(
          'TalkWise communication profile',
          'TalkWise \u6c9f\u901a\u540d\u7247'
        ),
        text: buildTrainingProfileCardShareText(card, invitationLink),
      }
      if (invitationLink) shareData.url = invitationLink
      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare(shareData))
      ) {
        await navigator.share(shareData)
        return
      }

      const copied = await copyToClipboard(shareData.text ?? '')
      if (!copied) {
        downloadBlob(blob)
        toast.success(
          localize(
            'Profile card downloaded',
            '\u6c9f\u901a\u540d\u7247\u5df2\u4e0b\u8f7d'
          )
        )
        return
      }
      toast.success(
        localize(
          'Profile summary copied',
          '\u6c9f\u901a\u6458\u8981\u5df2\u590d\u5236'
        )
      )
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      toast.error(
        reviewRequestErrorMessage(
          error,
          localize(
            'Unable to export profile card',
            '\u65e0\u6cd5\u5bfc\u51fa\u6c9f\u901a\u540d\u7247'
          )
        )
      )
    } finally {
      setExportAction(null)
    }
  }

  return (
    <div className='space-y-4'>
      {profileMutation.error && (
        <Alert variant='destructive'>
          <CircleAlert />
          <AlertTitle>
            {errorState === 'forbidden'
              ? localize(
                  'Profile access denied',
                  '\u65e0\u6743\u8bbf\u95ee\u6c9f\u901a\u540d\u7247'
                )
              : localize(
                  'Unable to generate profile',
                  '\u65e0\u6cd5\u751f\u6210\u6c9f\u901a\u540d\u7247'
                )}
          </AlertTitle>
          <AlertDescription>
            {reviewRequestErrorMessage(
              profileMutation.error,
              localize('Request failed', '\u8bf7\u6c42\u5931\u8d25')
            )}
          </AlertDescription>
        </Alert>
      )}

      {card && !hasProfile && (
        <Alert>
          <CircleAlert />
          <AlertTitle>
            {localize(
              'More evaluated sessions required',
              '\u9700\u8981\u66f4\u591a\u5df2\u8bc4\u4f30\u8bad\u7ec3'
            )}
          </AlertTitle>
          <AlertDescription>
            {card.summary ||
              localize(
                'Complete at least two evaluated sessions before generating a profile.',
                '\u81f3\u5c11\u5b8c\u6210\u4e24\u6b21\u5df2\u8bc4\u4f30\u8bad\u7ec3\u540e\u518d\u751f\u6210\u540d\u7247\u3002'
              )}
          </AlertDescription>
        </Alert>
      )}

      {!card && (
        <div className='rounded-lg border p-8'>
          <Empty className='border-none p-0'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <UserRound />
              </EmptyMedia>
              <EmptyTitle>
                {localize(
                  'Generate your communication profile',
                  '\u751f\u6210\u4f60\u7684\u6c9f\u901a\u540d\u7247'
                )}
              </EmptyTitle>
              <EmptyDescription>
                {localize(
                  'The profile uses only evaluated training data available to your current account.',
                  '\u540d\u7247\u4ec5\u4f7f\u7528\u5f53\u524d\u8d26\u53f7\u53ef\u8bbf\u95ee\u7684\u5df2\u8bc4\u4f30\u8bad\u7ec3\u6570\u636e\u3002'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}

      {card && hasProfile && (
        <CommunicationProfileCard
          ref={cardRef}
          card={card}
          learnerName={learnerName}
          localize={localize}
          invitationLink={invitationLink}
        />
      )}

      {card && hasProfile && (
        <div className='bg-muted/20 flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='min-w-0'>
            <label
              htmlFor='training-profile-invitation'
              className='text-sm font-medium'
            >
              {localize(
                'Include my registration link',
                '\u9644\u5e26\u6211\u7684\u6ce8\u518c\u9080\u8bf7\u94fe\u63a5'
              )}
            </label>
            <p className='text-muted-foreground text-xs'>
              {invitationStatusText}
            </p>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            {affiliateQuery.isError && (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => void affiliateQuery.refetch()}
              >
                <RefreshCw />
                {localize('Retry', '\u91cd\u8bd5')}
              </Button>
            )}
            <Switch
              id='training-profile-invitation'
              aria-label={localize(
                'Include my registration link',
                '\u9644\u5e26\u6211\u7684\u6ce8\u518c\u9080\u8bf7\u94fe\u63a5'
              )}
              checked={includeInvitation}
              disabled={
                affiliateQuery.isPending ||
                affiliateQuery.isError ||
                !affiliateQuery.data
              }
              onCheckedChange={setIncludeInvitation}
            />
          </div>
        </div>
      )}

      <div className='flex flex-wrap gap-2'>
        <Button
          onClick={() => profileMutation.mutate()}
          disabled={profileMutation.isPending || exportAction !== null}
        >
          {profileMutation.isPending ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <RefreshCw />
          )}
          {card
            ? localize('Regenerate', '\u91cd\u65b0\u751f\u6210')
            : localize('Generate profile', '\u751f\u6210\u540d\u7247')}
        </Button>
        {card && hasProfile && (
          <>
            <Button
              variant='outline'
              onClick={() => void exportCard('download')}
              disabled={exportAction !== null}
            >
              {exportAction === 'download' ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              {localize('Download', '\u4e0b\u8f7d')}
            </Button>
            <Button
              variant='outline'
              onClick={() => void exportCard('share')}
              disabled={exportAction !== null}
            >
              {exportAction === 'share' ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Share2 />
              )}
              {localize('Share', '\u5206\u4eab')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function TrainingGrowthProfilePage() {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Breadcrumb>
          <Button
            variant='ghost'
            size='sm'
            render={<Link to='/training/growth' />}
          >
            <ArrowLeft />
            {localize('Growth', '\u6210\u957f')}
          </Button>
        </SectionPageLayout.Breadcrumb>
        <SectionPageLayout.Title>
          {localize('Communication profile', '\u6c9f\u901a\u540d\u7247')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <TrainingGrowthProfileContent />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

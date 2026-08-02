/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { MessageSquareText } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { forwardRef } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress'

import type { TrainingProfileCard } from './profile-card'

const PROFILE_SCORE_LABELS: Record<string, readonly [string, string]> = {
  attentiveness: ['Attentiveness', '\u503e\u542c\u5173\u6ce8'],
  expression: ['Expression', '\u8868\u8fbe\u6e05\u6670'],
  coordination: ['Coordination', '\u4e92\u52a8\u534f\u8c03'],
  composure: ['Composure', '\u6c89\u7740\u5e94\u5bf9'],
}

interface CommunicationProfileCardProps {
  card: TrainingProfileCard
  learnerName: string
  localize: (english: string, chinese: string) => string
  invitationLink?: string
}

export const CommunicationProfileCard = forwardRef<
  HTMLDivElement,
  CommunicationProfileCardProps
>(function CommunicationProfileCard(props, ref) {
  const { card, learnerName, localize, invitationLink } = props
  const scores = Object.entries(card.scores)

  return (
    <div ref={ref} className='bg-background w-full max-w-3xl p-1'>
      <Card className='overflow-hidden'>
        <CardHeader className='border-b'>
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0'>
              <CardDescription>TalkWise</CardDescription>
              <CardTitle className='mt-1 flex items-center gap-2'>
                <MessageSquareText className='text-primary size-5' />
                {localize('Communication profile', '\u6c9f\u901a\u540d\u7247')}
              </CardTitle>
            </div>
            <Badge variant='secondary' className='max-w-48 truncate'>
              {learnerName}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-5 py-5'>
          {scores.length > 0 && (
            <div className='grid gap-x-6 gap-y-4 sm:grid-cols-2'>
              {scores.map(([dimensionId, score]) => {
                const labels = PROFILE_SCORE_LABELS[dimensionId]
                const label = labels
                  ? localize(labels[0], labels[1])
                  : dimensionId
                return (
                  <Progress key={dimensionId} value={(score - 1) * 25}>
                    <ProgressLabel>{label}</ProgressLabel>
                    <ProgressValue>
                      {() => `${score.toFixed(1)}/5`}
                    </ProgressValue>
                  </Progress>
                )
              })}
            </div>
          )}

          {card.summary && (
            <p className='text-muted-foreground text-sm leading-6'>
              {card.summary}
            </p>
          )}

          {invitationLink && (
            <div className='bg-muted/40 flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center'>
              <div className='shrink-0 rounded-md bg-white p-2'>
                <QRCodeSVG
                  value={invitationLink}
                  size={104}
                  level='M'
                  title={localize(
                    'TalkWise registration link',
                    'TalkWise \u6ce8\u518c\u94fe\u63a5'
                  )}
                />
              </div>
              <div className='min-w-0 space-y-1'>
                <div className='font-medium'>
                  {localize(
                    'Train with TalkWise',
                    '\u4e00\u8d77\u4f7f\u7528 TalkWise \u8bad\u7ec3'
                  )}
                </div>
                <p className='text-muted-foreground text-sm'>
                  {localize(
                    'Scan to create an account and start communication training.',
                    '\u626b\u7801\u6ce8\u518c\u8d26\u53f7\uff0c\u5f00\u59cb\u6c9f\u901a\u8bad\u7ec3\u3002'
                  )}
                </p>
                <p className='text-muted-foreground font-mono text-xs break-all'>
                  {invitationLink}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

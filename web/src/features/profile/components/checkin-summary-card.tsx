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
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Turnstile } from '@/components/turnstile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatQuotaWithCurrency } from '@/lib/currency'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import { getCheckinStatus, performCheckin } from '../api'
import { shouldShowCheckinCard, sumCheckinQuota } from './checkin-presentation'

interface CheckinSummaryCardProps {
  checkinEnabled: boolean
  turnstileEnabled: boolean
  turnstileSiteKey: string
  onAvailabilityChange?: (available: boolean) => void
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CheckinSummaryCard({
  checkinEnabled,
  turnstileEnabled,
  turnstileSiteKey,
  onAvailabilityChange,
}: CheckinSummaryCardProps) {
  const { t } = useTranslation()
  const today = useMemo(() => new Date(), [])
  const todayMonthKey = getMonthKey(today)
  const todayKey = formatDateKey(today)
  const [currentMonth, setCurrentMonth] = useState(() => getMonthStart(today))
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState(false)
  const [turnstileModalVisible, setTurnstileModalVisible] = useState(false)
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0)

  const currentMonthKey = getMonthKey(currentMonth)
  const fetchStatus = useCallback(
    async (month: string) => {
      const response = await getCheckinStatus(month)
      if (response.success && response.data) return response.data
      throw new Error(response.message || t('Failed to fetch checkin status'))
    },
    [t]
  )

  const summaryQuery = useQuery({
    queryKey: ['checkin-status', todayMonthKey],
    queryFn: () => fetchStatus(todayMonthKey),
    enabled: checkinEnabled,
    staleTime: 30000,
  })
  const calendarQuery = useQuery({
    queryKey: ['checkin-status', currentMonthKey],
    queryFn: () => fetchStatus(currentMonthKey),
    enabled: checkinEnabled && detailsOpen && currentMonthKey !== todayMonthKey,
    staleTime: 30000,
  })

  const summaryData = summaryQuery.data
  const available = shouldShowCheckinCard(checkinEnabled, summaryData)
  const calendarData =
    currentMonthKey === todayMonthKey ? summaryData : calendarQuery.data
  const calendarLoading =
    currentMonthKey === todayMonthKey
      ? summaryQuery.isLoading
      : calendarQuery.isLoading

  useEffect(() => {
    onAvailabilityChange?.(available)
    if (!available) {
      setDetailsOpen(false)
      setTurnstileModalVisible(false)
    }
  }, [available, onAvailabilityChange])

  const checkinRecordsMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const record of calendarData?.stats.records ?? []) {
      map[record.checkin_date] = record.quota_awarded
    }
    return map
  }, [calendarData?.stats.records])

  const checkedToday = summaryData?.stats.checked_in_today === true
  const todayAward = summaryData?.stats.records.find(
    (record) => record.checkin_date === todayKey
  )?.quota_awarded
  const monthlyQuota = sumCheckinQuota(summaryData?.stats.records)

  const shouldTriggerTurnstile = useCallback(
    (message?: string) => {
      if (!turnstileEnabled) return false
      if (typeof message !== 'string') return true
      return message.includes('Turnstile')
    },
    [turnstileEnabled]
  )

  const doCheckin = useCallback(
    async (token?: string) => {
      if (!available) return
      setCheckinLoading(true)
      try {
        const response = await performCheckin(token)
        if (response.success && response.data) {
          toast.success(
            `${t('Check-in successful! Received')} ${formatQuotaWithCurrency(response.data.quota_awarded)}`
          )
          await summaryQuery.refetch()
          setTurnstileModalVisible(false)
        } else {
          if (!token && shouldTriggerTurnstile(response.message)) {
            if (!turnstileSiteKey) {
              toast.error(t('Turnstile is enabled but site key is empty.'))
              return
            }
            setTurnstileModalVisible(true)
            return
          }
          if (token && shouldTriggerTurnstile(response.message)) {
            setTurnstileWidgetKey((value) => value + 1)
          }
          toast.error(response.message || t('Check-in failed'))
        }
      } catch {
        toast.error(t('Check-in failed'))
      } finally {
        setCheckinLoading(false)
      }
    },
    [available, shouldTriggerTurnstile, summaryQuery, t, turnstileSiteKey]
  )

  const openDetails = () => {
    setCurrentMonth(getMonthStart(today))
    setDetailsOpen(true)
  }

  const handleDetailsCheckin = () => {
    setDetailsOpen(false)
    void doCheckin()
  }

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: Array<{ date: Date; isCurrentMonth: boolean }> = []

    for (let index = 0; index < firstDay.getDay(); index += 1) {
      days.push({
        date: new Date(year, month, index - firstDay.getDay() + 1),
        isCurrentMonth: false,
      })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push({ date: new Date(year, month, day), isCurrentMonth: true })
    }
    const remainder = days.length % 7
    if (remainder) {
      for (let day = 1; day <= 7 - remainder; day += 1) {
        days.push({
          date: new Date(year, month + 1, day),
          isCurrentMonth: false,
        })
      }
    }
    return days
  }, [currentMonth])

  if (!available) return null

  if (summaryQuery.isLoading) {
    return (
      <Card className='h-full gap-0 py-0'>
        <div className='flex min-h-56 flex-col justify-between gap-5 p-6'>
          <div className='space-y-2'>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='h-4 w-full' />
          </div>
          <div className='grid grid-cols-2 gap-3'>
            <Skeleton className='h-12 w-full' />
            <Skeleton className='h-12 w-full' />
          </div>
          <Skeleton className='h-9 w-full' />
        </div>
      </Card>
    )
  }

  let checkinButtonLabel = t('Check in now')
  if (checkinLoading) {
    checkinButtonLabel = t('Loading...')
  } else if (checkedToday) {
    checkinButtonLabel = t('Checked in')
  }

  return (
    <TooltipProvider delay={100}>
      <Dialog
        open={turnstileModalVisible && available}
        onOpenChange={(open) => {
          setTurnstileModalVisible(open)
          if (!open) setTurnstileWidgetKey((value) => value + 1)
        }}
        title={t('Security Check')}
        contentClassName='sm:max-w-md'
        bodyClassName='space-y-4'
      >
        <div className='text-muted-foreground text-sm'>
          {t('Please complete the security check to continue.')}
        </div>
        <div className='flex justify-center py-4'>
          <Turnstile
            key={turnstileWidgetKey}
            siteKey={turnstileSiteKey}
            onVerify={(token) => {
              void doCheckin(token)
            }}
            onExpire={() => setTurnstileWidgetKey((value) => value + 1)}
          />
        </div>
      </Dialog>

      <Dialog
        open={detailsOpen && available}
        onOpenChange={setDetailsOpen}
        title={t('Daily Check-in')}
        description={t('Check in daily to receive random quota rewards')}
        contentHeight='min(70vh, 42rem)'
        contentClassName='sm:max-w-2xl'
        footer={
          <Button
            onClick={handleDetailsCheckin}
            disabled={checkinLoading || checkedToday}
          >
            <Sparkles />
            {checkinButtonLabel}
          </Button>
        }
      >
        <div className='space-y-5'>
          <div className='grid grid-cols-3 divide-x rounded-lg border'>
            <div className='p-3 text-center sm:p-4'>
              <div className='text-xl font-semibold tabular-nums'>
                {summaryData?.stats.total_checkins || 0}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('Total check-ins')}
              </div>
            </div>
            <div className='p-3 text-center sm:p-4'>
              <div className='text-xl font-semibold tabular-nums'>
                {formatQuotaWithCurrency(monthlyQuota, { digitsLarge: 0 })}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('This month')}
              </div>
            </div>
            <div className='p-3 text-center sm:p-4'>
              <div className='text-xl font-semibold tabular-nums'>
                {formatQuotaWithCurrency(summaryData?.stats.total_quota || 0, {
                  digitsLarge: 0,
                })}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {t('Total earned')}
              </div>
            </div>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between gap-3'>
              <h4 className='text-sm font-semibold'>
                {dayjs(currentMonth).format('YYYY-MM')}
              </h4>
              <div className='flex items-center gap-1'>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  onClick={() =>
                    setCurrentMonth(
                      new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth() - 1,
                        1
                      )
                    )
                  }
                  aria-label={t('Previous')}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  onClick={() =>
                    setCurrentMonth(
                      new Date(
                        currentMonth.getFullYear(),
                        currentMonth.getMonth() + 1,
                        1
                      )
                    )
                  }
                  aria-label={t('Next')}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            {calendarLoading ? (
              <Skeleton className='h-64 w-full' />
            ) : (
              <div className='grid grid-cols-7 gap-1'>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                  <div
                    key={day}
                    className='text-muted-foreground flex h-8 items-center justify-center text-xs font-medium'
                  >
                    {day}
                  </div>
                ))}
                {calendarDays.map((dayObject) => {
                  const dateKey = formatDateKey(dayObject.date)
                  const quotaAwarded = checkinRecordsMap[dateKey]
                  const checked = quotaAwarded !== undefined
                  const isToday = dateKey === todayKey
                  const dayCell = (
                    <div
                      key={dateKey}
                      className={cn(
                        'relative flex h-10 items-center justify-center rounded-lg text-sm tabular-nums',
                        !dayObject.isCurrentMonth && 'text-muted-foreground/40',
                        isToday && 'bg-primary text-primary-foreground',
                        checked && !isToday && 'font-semibold'
                      )}
                      aria-current={isToday ? 'date' : undefined}
                      tabIndex={checked ? 0 : undefined}
                    >
                      {dayObject.date.getDate()}
                      {checked && !isToday && (
                        <span className='bg-success absolute bottom-1 size-1 rounded-full' />
                      )}
                    </div>
                  )

                  if (checked && dayObject.isCurrentMonth) {
                    return (
                      <Tooltip key={dateKey}>
                        <TooltipTrigger render={dayCell} />
                        <TooltipContent>
                          <div className='text-xs'>
                            <div className='font-medium'>{t('Checked in')}</div>
                            <div className='text-muted-foreground mt-0.5'>
                              +{formatQuotaWithCurrency(quotaAwarded)}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )
                  }
                  return dayCell
                })}
              </div>
            )}
          </div>

          <div className='text-muted-foreground border-t pt-4 text-center text-xs'>
            {t('You can only check in once per day')}
          </div>
          <ul className='text-muted-foreground list-disc space-y-1 pl-5 text-xs'>
            <li>{t('Check in daily to receive random quota rewards')}</li>
            <li>{t('Rewards will be added directly to your balance')}</li>
            <li>{t('Do not repeat check-in; only once per day')}</li>
          </ul>
        </div>
      </Dialog>

      <Card className='h-full'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <CalendarDays className='text-muted-foreground size-4' />
            {t('Daily Check-in')}
          </CardTitle>
          <CardDescription className='line-clamp-2'>
            {checkedToday && todayAward !== undefined
              ? `${t('Today')} +${formatQuotaWithCurrency(todayAward)}`
              : t('Check in daily to receive random quota rewards')}
          </CardDescription>
          {checkedToday && (
            <CardAction>
              <Badge
                variant='secondary'
                className='text-emerald-600 dark:text-emerald-400'
              >
                <Sparkles />
                {t('Checked in')}
              </Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className='flex flex-1 flex-col gap-4'>
          {summaryQuery.isError ? (
            <div className='flex flex-1 flex-wrap items-center justify-between gap-3'>
              <span className='text-muted-foreground text-sm'>
                {t('Failed to fetch checkin status')}
              </span>
              <Button
                size='sm'
                variant='outline'
                onClick={() => void summaryQuery.refetch()}
              >
                <RefreshCw />
                {t('Retry')}
              </Button>
            </div>
          ) : (
            <>
              <div className='grid grid-cols-2 divide-x border-y'>
                <div className='py-3 text-center'>
                  <div className='text-xl font-semibold tabular-nums'>
                    {summaryData?.stats.total_checkins || 0}
                  </div>
                  <div className='text-muted-foreground mt-1 text-xs'>
                    {t('Total check-ins')}
                  </div>
                </div>
                <div className='py-3 text-center'>
                  <div className='text-xl font-semibold tabular-nums'>
                    {formatQuotaWithCurrency(monthlyQuota, { digitsLarge: 0 })}
                  </div>
                  <div className='text-muted-foreground mt-1 text-xs'>
                    {t('This month')}
                  </div>
                </div>
              </div>
              <div className='mt-auto grid grid-cols-2 gap-2'>
                <Button
                  onClick={() => void doCheckin()}
                  disabled={checkinLoading || checkedToday}
                  size='sm'
                >
                  <Sparkles />
                  {checkinButtonLabel}
                </Button>
                <Button variant='outline' size='sm' onClick={openDetails}>
                  <CalendarDays />
                  {t('View details')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}

import { formatDateTimeStr } from '@/lib/format'

export function formatTrainingDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatDateTimeStr(date)
}

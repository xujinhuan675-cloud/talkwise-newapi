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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  MessagesSquare,
  Target,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'

const TRAINING_ENTRIES = [
  {
    titleKey: 'Training goal',
    titleZh: '训练目标',
    descriptionKey: 'Define the outcome and focus for this training session.',
    descriptionZh: '明确本次训练要达成的结果与关注重点。',
    actionKey: 'Configure goal',
    actionZh: '配置目标',
    section: 'scenarios',
    icon: Target,
    tone: 'chart-1',
  },
  {
    titleKey: 'Scenario training',
    titleZh: '场景训练',
    descriptionKey: 'Practice a key conversation in a realistic scenario.',
    descriptionZh: '在真实场景中练习一次关键沟通。',
    actionKey: 'Open scenarios',
    actionZh: '打开场景',
    section: 'scenarios',
    icon: MessagesSquare,
    tone: 'chart-2',
  },
  {
    titleKey: 'Sessions and review',
    titleZh: '训练与复盘',
    descriptionKey:
      'Return to completed sessions and review the selected path.',
    descriptionZh: '回到已完成的训练，并复盘所选择的对话路径。',
    actionKey: 'View sessions',
    actionZh: '查看训练记录',
    section: 'sessions',
    icon: ClipboardCheck,
    tone: 'chart-3',
  },
  {
    titleKey: 'Growth',
    titleZh: '成长',
    descriptionKey: 'Track recurring strengths and the next area to improve.',
    descriptionZh: '跟踪反复出现的优势与下一项改进重点。',
    actionKey: 'View growth',
    actionZh: '查看成长',
    section: 'growth',
    icon: BarChart3,
    tone: 'chart-4',
  },
] as const

export function TrainingOverview() {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <CardStaggerContainer className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
      {TRAINING_ENTRIES.map((entry) => {
        const Icon = entry.icon

        return (
          <CardStaggerItem key={entry.titleKey}>
            <Card className='h-full'>
              <CardHeader>
                <IconBadge tone={entry.tone as IconBadgeTone} size='title'>
                  <Icon />
                </IconBadge>
                <CardAction>
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={localize(entry.actionKey, entry.actionZh)}
                    render={
                      <Link
                        to='/training/$section'
                        params={{ section: entry.section }}
                      />
                    }
                  >
                    <ArrowRight />
                  </Button>
                </CardAction>
                <CardTitle>{localize(entry.titleKey, entry.titleZh)}</CardTitle>
                <CardDescription>
                  {localize(entry.descriptionKey, entry.descriptionZh)}
                </CardDescription>
              </CardHeader>
            </Card>
          </CardStaggerItem>
        )
      })}
    </CardStaggerContainer>
  )
}

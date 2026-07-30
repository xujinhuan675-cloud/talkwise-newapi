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
import { Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { TrainingHostProvider } from '../host'

export function TrainingLeaderboardPage() {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {localize('Scenario leaderboard', '\u573a\u666f\u6392\u884c')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='rounded-lg border p-8'>
            <Empty className='border-none p-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <Trophy />
                </EmptyMedia>
                <EmptyTitle>
                  {localize(
                    'Leaderboard data is not available',
                    '\u6392\u884c\u6570\u636e\u6682\u672a\u63a5\u5165'
                  )}
                </EmptyTitle>
                <EmptyDescription>
                  {localize(
                    'The current training API does not expose a scope-safe cross-user ranking.',
                    '\u5f53\u524d\u8bad\u7ec3 API \u672a\u63d0\u4f9b\u5b89\u5168\u7684\u8de8\u7528\u6237\u6392\u884c\u6570\u636e\u3002'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

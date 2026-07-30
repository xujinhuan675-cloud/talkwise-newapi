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
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'

import { TrainingOverview } from './components/training-overview'
import { TrainingSectionEmpty } from './components/training-section-empty'
import { TrainingHostProvider } from './host'
import { TrainingScenarios } from './scenarios/training-scenarios'

type TrainingPageShellProps = {
  title: string
  titleZh: string
  children: ReactNode
}

type TrainingPlaceholderPageProps = {
  icon: LucideIcon
  title: string
  titleZh: string
  description: string
  descriptionZh: string
}

function TrainingPageShell(props: TrainingPageShellProps) {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <TrainingHostProvider>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {localize(props.title, props.titleZh)}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>{props.children}</SectionPageLayout.Content>
      </SectionPageLayout>
    </TrainingHostProvider>
  )
}

export function TrainingOverviewPage() {
  return (
    <TrainingPageShell title='Training' titleZh='训练'>
      <TrainingOverview />
    </TrainingPageShell>
  )
}

export function TrainingScenariosPage() {
  return (
    <TrainingPageShell title='Scenarios' titleZh='场景训练'>
      <TrainingScenarios />
    </TrainingPageShell>
  )
}

export function TrainingPlaceholderPage(props: TrainingPlaceholderPageProps) {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <TrainingPageShell title={props.title} titleZh={props.titleZh}>
      <TrainingSectionEmpty
        icon={props.icon}
        title={localize(props.title, props.titleZh)}
        description={localize(props.description, props.descriptionZh)}
      />
    </TrainingPageShell>
  )
}

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
import { Link } from '@tanstack/react-router'
import {
  BarChart3,
  ClipboardCheck,
  Headphones,
  MessageSquareText,
  Mic,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { useTheme } from '@/context/theme-provider'
import { useStatus } from '@/hooks/use-status'
import { isLikelyHtml } from '@/lib/content-format'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

import { getTrainingScenarioConfig } from '../training/config/api'
import { listPersonas } from '../training/personas/api'
import { CTA, Features, Hero, HowItWorks, Stats } from './components'
import { parseHomePageConfig, resolveHomePageLocale } from './config'
import { useHomePageContent } from './hooks'
import type {
  HomeCtaContent,
  HomeFeaturesContent,
  HomeHeroContent,
  HomeHowItWorksContent,
  HomeStat,
} from './types'

export function Home() {
  const { i18n, t } = useTranslation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { resolvedTheme } = useTheme()
  const { auth } = useAuthStore()
  const { status } = useStatus()
  const isAuthenticated = !!auth.user
  const { content, isLoaded, isUrl } = useHomePageContent()
  const homePageConfig = useMemo(
    () => parseHomePageConfig(status?.home_page_config),
    [status?.home_page_config]
  )
  const homePageCopy = useMemo(
    () =>
      resolveHomePageLocale(
        homePageConfig,
        i18n.resolvedLanguage || i18n.language
      ),
    [homePageConfig, i18n.language, i18n.resolvedLanguage]
  )
  const trainingEnabled =
    parseHeaderNavModulesFromStatus(status).training !== false
  const scenarioConfigQuery = useQuery({
    queryKey: ['training', 'scenario-config', ''],
    queryFn: () => getTrainingScenarioConfig(''),
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
  const personasQuery = useQuery({
    queryKey: ['training', 'personas'],
    queryFn: listPersonas,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
  const trainingScenarioCount = scenarioConfigQuery.data?.scenarios.length ?? 0
  const personaCount = personasQuery.data?.length ?? 0
  const localized = useCallback(
    (english: string, chinese: string) =>
      t(english, {
        defaultValue: i18n.language.startsWith('zh') ? chinese : english,
      }),
    [i18n.language, t]
  )
  const homePageText = useCallback(
    (override: string, english: string, chinese: string) =>
      override || localized(english, chinese),
    [localized]
  )

  const talkWiseHero = useMemo<HomeHeroContent>(
    () => ({
      badge: homePageText(
        homePageCopy.hero.badge,
        'AI Communication Training',
        'AI 沟通训练'
      ),
      title: homePageText(
        homePageCopy.hero.title,
        'For every important conversation',
        '为每一次重要沟通'
      ),
      highlightedTitle: homePageText(
        homePageCopy.hero.highlightedTitle,
        'be prepared',
        '做好准备'
      ),
      description: homePageText(
        homePageCopy.hero.description,
        'Rehearse realistic conversations, receive guidance in the moment, and turn every review into the next focused practice session.',
        '把重要沟通放进可重复演练的真实场景，在对话中获得提示，并把每次复盘变成下一轮针对性训练。'
      ),
      actions: trainingEnabled
        ? [
            {
              id: 'start-training',
              label: localized('Start training', '开始训练'),
              render: <Link to='/training' />,
            },
            ...(homePageConfig.sections.workflow
              ? [
                  {
                    id: 'view-flow',
                    label: localized('View training flow', '查看训练流程'),
                    render: <a href='#training-workflow' />,
                    variant: 'outline' as const,
                  },
                ]
              : []),
          ]
        : [],
      support: homePageConfig.sections.scenarioSupport
        ? {
            eyebrow: homePageText(
              homePageCopy.hero.supportEyebrow,
              'Training scenarios',
              '训练场景'
            ),
            description: homePageText(
              homePageCopy.hero.supportDescription,
              'Choose a goal, counterpart, and difficulty, then keep every modality in one training context.',
              '选择目标、对手角色与难度，让文本、语音与复盘共用同一训练上下文。'
            ),
            items: [
              {
                id: 'interview',
                label: localized('Interview', '面试'),
                icon: <Target className='size-5 text-emerald-500' />,
              },
              {
                id: 'sales',
                label: localized('Sales', '销售'),
                icon: <UsersRound className='size-5 text-blue-500' />,
              },
              {
                id: 'negotiation',
                label: localized('Negotiation', '谈判'),
                icon: <MessageSquareText className='size-5 text-violet-500' />,
              },
              {
                id: 'workplace',
                label: localized('Workplace', '职场沟通'),
                icon: <Sparkles className='size-5 text-amber-500' />,
              },
            ],
          }
        : null,
      previewDemos: [
        {
          id: 'scenario',
          label: localized('Scenario', '场景'),
          method: 'POST',
          endpoint: '/training/scenarios',
          headers: ['"goal": "key conversation"'],
          request: [
            '"counterpart": "stakeholder",',
            '"difficulty": "adaptive"',
          ],
          response: [
            '{',
            '  "status": <text>,',
            '  "usage": { "total_tokens": <tokens> }',
            '}',
          ],
          responseHighlights: ['<text>', '<tokens>'],
          responseText: localized('Scenario ready', '场景已就绪'),
          status: localized('Ready', '已就绪'),
          requestLabel: localized('Setup', '设置'),
          responseLabel: localized('Training state', '训练状态'),
          tokens: 24,
          latency: 96,
          accent: 'emerald',
          meta: (
            <TrainingPreviewMeta
              icon={<Target className='size-3.5' />}
              label={localized('Scenario setup', '场景配置')}
              value={localized('Key client conversation', '关键客户沟通')}
              tone='emerald'
            />
          ),
          body: (
            <ScenarioPreview
              objective={localized(
                'Secure agreement on the next pilot step',
                '推动客户确认下一步试点'
              )}
              counterpart={localized('Operations director', '运营负责人')}
              difficulty={localized('Adaptive', '自适应')}
              focus={localized(
                'Clarify value before discussing price',
                '先澄清价值，再讨论价格'
              )}
            />
          ),
          footerContent: (
            <TrainingPreviewFooter
              items={[
                localized('Goal confirmed', '目标已确认'),
                localized('Counterpart configured', '对手角色已配置'),
              ]}
            />
          ),
        },
        {
          id: 'dialogue',
          label: localized('Dialogue', '对话'),
          method: 'POST',
          endpoint: '/training/sessions/current/messages',
          headers: ['"mode": "text-or-voice"'],
          request: ['"role": "trainee",', '"content": "..."'],
          response: [
            '{',
            '  "guidance": <text>,',
            '  "usage": { "total_tokens": <tokens> }',
            '}',
          ],
          responseHighlights: ['<text>', '<tokens>'],
          responseText: localized('Dialogue in progress', '对话进行中'),
          status: localized('Training', '训练中'),
          requestLabel: localized('Turn', '对话轮次'),
          responseLabel: localized('Live guidance', '实时提示'),
          tokens: 38,
          latency: 128,
          accent: 'amber',
          meta: (
            <TrainingPreviewMeta
              icon={<MessageSquareText className='size-3.5' />}
              label={localized('Live practice', '实时演练')}
              value={localized('Handling price objections', '处理价格异议')}
              tone='amber'
            />
          ),
          body: (
            <DialoguePreview
              counterpart={localized(
                'Your proposal is still above our budget.',
                '你们的方案还是超出了我们的预算。'
              )}
              trainee={localized(
                'Before comparing price, may I confirm which outcome matters most this quarter?',
                '在比较价格前，我想先确认一下，您这个季度最看重哪项结果？'
              )}
              guidance={localized(
                'Good: redirect the discussion from price to business outcome.',
                '很好：把讨论从价格重新引导到业务结果。'
              )}
            />
          ),
          footerContent: (
            <TrainingPreviewFooter
              items={[
                localized('Round 3', '第 3 轮'),
                localized('Live guidance on', '实时提示已开启'),
              ]}
            />
          ),
        },
        {
          id: 'review',
          label: localized('Review', '复盘'),
          method: 'GET',
          endpoint: '/training/sessions/current/review',
          headers: ['"include": "evaluation,guidance"'],
          request: ['"selected_path": "current"'],
          response: [
            '{',
            '  "summary": <text>,',
            '  "usage": { "total_tokens": <tokens> }',
            '}',
          ],
          responseHighlights: ['<text>', '<tokens>'],
          responseText: localized('Review available', '复盘已生成'),
          status: localized('Reviewed', '已复盘'),
          requestLabel: localized('Context', '复盘上下文'),
          responseLabel: localized('Evaluation', '评估结果'),
          tokens: 52,
          latency: 164,
          accent: 'blue',
          meta: (
            <TrainingPreviewMeta
              icon={<ClipboardCheck className='size-3.5' />}
              label={localized('Session review', '训练复盘')}
              value={localized('Price objection practice', '价格异议演练')}
              tone='blue'
            />
          ),
          body: (
            <ReviewPreview
              score={82}
              summary={localized(
                'You stayed composed and redirected the conversation toward value.',
                '你保持了稳定表达，并成功把讨论重新引导到价值。'
              )}
              strength={localized(
                'Asked a focused clarifying question',
                '提出了聚焦的澄清问题'
              )}
              improvement={localized(
                'Make the next-step proposal more concrete',
                '让下一步建议更加具体'
              )}
              labels={{
                score: localized('Overall score', '综合评分'),
                strength: localized('Strength', '表现亮点'),
                improvement: localized('Next improvement', '下一项改进'),
              }}
            />
          ),
          footerContent: (
            <TrainingPreviewFooter
              items={[
                localized('Review complete', '复盘已完成'),
                localized('2 focused actions', '2 项针对性行动'),
              ]}
            />
          ),
        },
        {
          id: 'growth',
          label: localized('Growth', '成长'),
          method: 'GET',
          endpoint: '/training/growth/next-plan',
          headers: ['"source": "latest-review"'],
          request: ['"focus": "weakest-skill"'],
          response: [
            '{',
            '  "next_session": <text>,',
            '  "usage": { "total_tokens": <tokens> }',
            '}',
          ],
          responseHighlights: ['<text>', '<tokens>'],
          responseText: localized('Next practice prepared', '下一轮训练已准备'),
          status: localized('Improving', '持续改进'),
          requestLabel: localized('Weakness', '待提升项'),
          responseLabel: localized('Next plan', '下一步计划'),
          tokens: 41,
          latency: 112,
          accent: 'violet',
          meta: (
            <TrainingPreviewMeta
              icon={<BarChart3 className='size-3.5' />}
              label={localized('Growth plan', '成长计划')}
              value={localized('Consultative communication', '顾问式沟通')}
              tone='violet'
            />
          ),
          body: (
            <GrowthPreview
              skills={[
                {
                  label: localized('Clarifying needs', '需求澄清'),
                  value: 84,
                },
                {
                  label: localized('Value framing', '价值表达'),
                  value: 72,
                },
                {
                  label: localized('Closing next steps', '推进下一步'),
                  value: 64,
                },
              ]}
              nextTitle={localized('Next focused practice', '下一轮针对性训练')}
              nextAction={localized(
                'Practice turning vague interest into a concrete commitment.',
                '练习把模糊意向推进为明确承诺。'
              )}
            />
          ),
          footerContent: (
            <TrainingPreviewFooter
              items={[
                localized('4 sessions completed', '已完成 4 次训练'),
                localized('12% improvement this week', '本周提升 12%'),
              ]}
            />
          ),
        },
      ],
    }),
    [
      homePageConfig.sections,
      homePageCopy.hero,
      homePageText,
      localized,
      trainingEnabled,
    ]
  )

  const talkWiseStats = useMemo<readonly HomeStat[]>(
    () => [
      {
        id: 'training-stages',
        end: 4,
        label: localized('training stages', '训练环节'),
      },
      {
        id: 'practice-modes',
        end: 2,
        label: localized('text and voice modes', '文本与语音模式'),
      },
      {
        id: 'personas',
        end: personaCount,
        label: localized('personas', '角色数'),
      },
      {
        id: 'training-scenarios',
        end: trainingScenarioCount,
        label: localized('training scenarios', '训练场景'),
      },
    ],
    [localized, personaCount, trainingScenarioCount]
  )

  const talkWiseFeatures = useMemo<HomeFeaturesContent>(
    () => ({
      eyebrow: localized('Core Capabilities', '核心能力'),
      heading: [
        localized('Turn communication practice into', '把沟通练习变成'),
        localized('a continuous improvement workflow', '可持续改进的工作流'),
      ],
      primary: [
        {
          title: localized('Start with a goal', '从目标开始'),
          description: localized(
            'Build practice around interviews, sales, negotiation, and workplace conversations.',
            '围绕面试、销售、谈判与职场沟通建立练习。'
          ),
          icon: <Target className='size-4 text-emerald-400' />,
          visual: (
            <div className='mt-4 grid grid-cols-3 gap-2'>
              {[
                localized('Interview', '面试'),
                localized('Sales', '销售'),
                localized('Negotiation', '谈判'),
                localized('Management', '管理'),
                localized('Feedback', '反馈'),
                localized('Presentation', '述职'),
              ].map((name) => (
                <div
                  key={name}
                  className='border-border/30 bg-muted/20 text-muted-foreground flex items-center justify-center rounded-lg border px-3 py-2 text-xs transition-colors duration-300 hover:border-blue-500/30 hover:bg-blue-500/5'
                >
                  {name}
                </div>
              ))}
            </div>
          ),
        },
        {
          title: localized('Define the counterpart', '明确对手角色'),
          description: localized(
            'Use personas, stakeholders, and difficulty to shape pressure and direction.',
            '用 persona、利益相关者和难度控制对话的压力与方向。'
          ),
          icon: <UsersRound className='size-4 text-blue-400' />,
          visual: (
            <div className='mt-4 flex items-center justify-center'>
              <div className='relative'>
                <div className='flex size-16 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5'>
                  <UsersRound
                    className='size-7 text-emerald-500/70'
                    strokeWidth={1.5}
                  />
                </div>
                <div className='absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-emerald-500'>
                  <ShieldCheck
                    className='size-2.5 text-white'
                    strokeWidth={3}
                  />
                </div>
              </div>
            </div>
          ),
        },
        {
          title: localized('Keep training context', '保持训练上下文'),
          description: localized(
            'Keep dialogue, live guidance, and session state on one continuous path.',
            '让训练对话、实时提示与会话状态在同一条路径中连续呈现。'
          ),
          icon: <MessageSquareText className='size-4 text-violet-400' />,
          visual: (
            <div className='mt-4 space-y-2'>
              {[
                localized('Set the goal', '设定目标'),
                localized('Practice', '完成对话'),
                localized('Review', '复盘改进'),
              ].map((step, index) => (
                <div key={step} className='flex items-center gap-2'>
                  <div
                    className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      index === 1
                        ? 'border border-blue-500/30 bg-blue-500/20 text-blue-500'
                        : 'border-border/40 bg-muted text-muted-foreground border'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <div className='bg-border/40 h-px flex-1' />
                  <span className='text-muted-foreground text-xs'>{step}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          title: localized('Trace every review', '形成可追溯复盘'),
          description: localized(
            'Separate session evidence, evaluation, and growth records, then practice the weakest skill again.',
            '区分训练会话、评估与成长记录，再回到需要强化的地方。'
          ),
          icon: <ShieldCheck className='size-4 text-amber-400' />,
          visual: (
            <div className='mt-4 flex items-center gap-3'>
              <div className='flex -space-x-2'>
                {[
                  localized('Text', '文本'),
                  localized('Voice', '语音'),
                  localized('Guide', '提示'),
                  localized('Review', '复盘'),
                ].map((label) => (
                  <div
                    key={label}
                    className='border-background from-muted to-muted/60 text-muted-foreground flex size-8 items-center justify-center rounded-full border-2 bg-gradient-to-br text-[9px] font-bold'
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className='text-muted-foreground flex items-center gap-1.5 text-xs'>
                <ShieldCheck className='size-3.5 text-blue-500' />
                {localized('One training loop', '统一训练闭环')}
              </div>
            </div>
          ),
        },
      ],
      additional: [
        {
          title: localized('Voice practice', '语音练习'),
          description: localized(
            'Choose economical near-real-time or full realtime voice.',
            '按需选择经济型近实时或真正实时语音。'
          ),
          icon: <Mic className='size-5' strokeWidth={1.5} />,
        },
        {
          title: localized('Structured feedback', '结构化反馈'),
          description: localized(
            'Connect observations to concrete next actions.',
            '把表现观察连接到具体的下一步行动。'
          ),
          icon: <ClipboardCheck className='size-5' strokeWidth={1.5} />,
        },
        {
          title: localized('Growth records', '成长记录'),
          description: localized(
            'Track recurring strengths and weaknesses across sessions.',
            '跨会话跟踪反复出现的优势与弱项。'
          ),
          icon: <BarChart3 className='size-5' strokeWidth={1.5} />,
        },
        {
          title: localized('Live coaching', '实时引导'),
          description: localized(
            'Receive concise prompts without breaking the conversation.',
            '在不打断对话的前提下获得简洁提示。'
          ),
          icon: <Headphones className='size-5' strokeWidth={1.5} />,
        },
      ],
    }),
    [localized]
  )

  const talkWiseFlow = useMemo<HomeHowItWorksContent>(
    () => ({
      eyebrow: localized('Training Flow', '训练流程'),
      heading: localized(
        'Three steps to the next better conversation',
        '三个环节，回到下一次更好的表达'
      ),
      steps: [
        {
          id: 'set-goal',
          title: localized('Set the goal', '设定目标'),
          description: localized(
            'Choose the scenario, counterpart, and level of challenge.',
            '选择要练的场景、对手角色与挑战难度。'
          ),
          icon: <Target className='size-6' strokeWidth={1.5} />,
        },
        {
          id: 'practice',
          title: localized('Practice the conversation', '完成对话'),
          description: localized(
            'Complete a realistic exchange in text or voice with live guidance.',
            '在文本或语音中完成一轮真实表达，并接收实时提示。'
          ),
          icon: <MessageSquareText className='size-6' strokeWidth={1.5} />,
        },
        {
          id: 'review',
          title: localized('Review the next step', '复盘下一步'),
          description: localized(
            'Review performance and continue practicing the weakest skill.',
            '回看表现与建议，并针对弱点继续训练。'
          ),
          icon: <ClipboardCheck className='size-6' strokeWidth={1.5} />,
        },
      ],
    }),
    [localized]
  )

  const talkWiseCta = useMemo<HomeCtaContent>(
    () => ({
      title: [
        homePageText(
          homePageCopy.cta.titleFirst,
          'Prepare for the next',
          '从下一场'
        ),
        homePageText(
          homePageCopy.cta.titleSecond,
          'conversation that matters',
          '重要沟通开始准备'
        ),
      ],
      description: homePageText(
        homePageCopy.cta.description,
        'Enter the training workspace, choose a scenario, and begin a focused rehearsal.',
        '进入训练工作台，选择你的场景，开始一次有针对性的演练。'
      ),
      actions: [
        {
          id: 'enter-training',
          label: homePageText(
            homePageCopy.cta.actionLabel,
            'Enter training',
            '进入训练'
          ),
          render: <Link to='/training' />,
        },
      ],
    }),
    [homePageCopy.cta, homePageText]
  )

  const syncIframePreferences = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { themeMode: resolvedTheme },
        '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        { lang: i18n.language },
        '*'
      )
    } catch {
      // Cross-origin frames may reject access while navigating.
    }
  }, [i18n.language, resolvedTheme])

  useEffect(() => {
    if (isUrl) {
      syncIframePreferences()
    }
  }, [isUrl, syncIframePreferences])

  if (!isLoaded) {
    return (
      <PublicLayout showMainContainer={false}>
        <main className='flex min-h-screen items-center justify-center'>
          <div className='text-muted-foreground'>{t('Loading...')}</div>
        </main>
      </PublicLayout>
    )
  }

  if (content) {
    if (isUrl) {
      return (
        <PublicLayout showMainContainer={false} showFooter={false}>
          {/*
            allow-top-navigation-by-user-activation: the custom home page URL is
            admin-configured (trusted); this lets its target="_top" nav/menu links
            navigate the top-level window on user click. The default sandbox blocks
            this on desktop, while some mobile browsers allow it via allow-popups,
            causing inconsistent behavior. This token only permits user-activated
            top-level navigation and does NOT grant same-origin access.
          */}
          <iframe
            ref={iframeRef}
            src={content}
            className='h-screen w-full border-none'
            title={t('Custom Home Page')}
            sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts allow-top-navigation-by-user-activation'
            onLoad={syncIframePreferences}
          />
        </PublicLayout>
      )
    }

    const contentIsHtml = isLikelyHtml(content)

    if (contentIsHtml) {
      return (
        <PublicLayout showMainContainer={false}>
          <RichContent
            mode='html'
            htmlVariant='isolated'
            content={content}
            className='custom-home-content'
          />
        </PublicLayout>
      )
    }

    return (
      <PublicLayout>
        <div className='mx-auto max-w-6xl px-4 py-8'>
          <RichContent
            mode='markdown'
            content={content}
            className='custom-home-content'
          />
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <Hero isAuthenticated={isAuthenticated} content={talkWiseHero} />
      {homePageConfig.sections.stats && <Stats stats={talkWiseStats} />}
      {homePageConfig.sections.features && (
        <Features content={talkWiseFeatures} />
      )}
      {homePageConfig.sections.workflow && (
        <HowItWorks id='training-workflow' content={talkWiseFlow} />
      )}
      {homePageConfig.sections.cta && trainingEnabled && (
        <CTA content={talkWiseCta} />
      )}
    </PublicLayout>
  )
}

type PreviewTone = 'emerald' | 'amber' | 'blue' | 'violet'

const PREVIEW_TONE_CLASSES: Record<PreviewTone, string> = {
  emerald:
    'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
  amber:
    'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
  blue: 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300',
  violet:
    'bg-violet-500/10 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
}

function TrainingPreviewMeta(props: {
  icon: ReactNode
  label: ReactNode
  value: ReactNode
  tone: PreviewTone
}) {
  return (
    <div className='border-border/40 flex items-center gap-2.5 border-b px-5 py-3 dark:border-white/[0.04]'>
      <span
        className={`flex size-6 items-center justify-center rounded-md ${PREVIEW_TONE_CLASSES[props.tone]}`}
      >
        {props.icon}
      </span>
      <span className='text-muted-foreground font-sans text-xs'>
        {props.label}
      </span>
      <span className='text-foreground/75 ml-auto truncate font-sans text-xs font-medium'>
        {props.value}
      </span>
    </div>
  )
}

function PreviewSectionLabel(props: { children: ReactNode }) {
  return (
    <p className='text-muted-foreground text-[10px] font-semibold tracking-wider uppercase'>
      {props.children}
    </p>
  )
}

function ScenarioPreview(props: {
  objective: ReactNode
  counterpart: ReactNode
  difficulty: ReactNode
  focus: ReactNode
}) {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <div className='flex h-full flex-col font-sans'>
      <div className='px-5 py-5'>
        <PreviewSectionLabel>
          {localize('Training objective', '训练目标')}
        </PreviewSectionLabel>
        <p className='mt-2 text-base font-semibold'>{props.objective}</p>
        <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
          {localize(
            'The AI counterpart will adapt its pressure and response strategy during the conversation.',
            'AI 对手会在对话中根据表现动态调整压力和回应策略。'
          )}
        </p>
      </div>
      <div className='border-border/40 grid grid-cols-2 border-y dark:border-white/[0.04]'>
        <PreviewFact
          label={localize('Counterpart', '对手角色')}
          value={props.counterpart}
        />
        <PreviewFact
          label={localize('Difficulty', '训练难度')}
          value={props.difficulty}
          bordered
        />
      </div>
      <div className='flex-1 px-5 py-5'>
        <PreviewSectionLabel>
          {localize('Practice focus', '练习重点')}
        </PreviewSectionLabel>
        <div className='mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm leading-relaxed'>
          {props.focus}
        </div>
      </div>
    </div>
  )
}

function PreviewFact(props: {
  label: ReactNode
  value: ReactNode
  bordered?: boolean
}) {
  return (
    <div
      className={`px-5 py-4 ${props.bordered ? 'border-border/40 border-l dark:border-white/[0.04]' : ''}`}
    >
      <PreviewSectionLabel>{props.label}</PreviewSectionLabel>
      <p className='mt-1.5 text-sm font-medium'>{props.value}</p>
    </div>
  )
}

function DialoguePreview(props: {
  counterpart: ReactNode
  trainee: ReactNode
  guidance: ReactNode
}) {
  const { i18n, t } = useTranslation()
  const localize = (english: string, chinese: string) =>
    t(english, {
      defaultValue: i18n.language.startsWith('zh') ? chinese : english,
    })

  return (
    <div className='flex h-full flex-col gap-4 px-5 py-5 font-sans'>
      <div className='max-w-[82%]'>
        <PreviewSectionLabel>
          {localize('Counterpart', '对手角色')}
        </PreviewSectionLabel>
        <div className='bg-muted/70 mt-2 rounded-lg rounded-tl-sm px-4 py-3 text-sm leading-relaxed'>
          {props.counterpart}
        </div>
      </div>
      <div className='ml-auto max-w-[84%] text-right'>
        <PreviewSectionLabel>{localize('You', '你')}</PreviewSectionLabel>
        <div className='text-foreground mt-2 rounded-lg rounded-tr-sm bg-amber-500/10 px-4 py-3 text-left text-sm leading-relaxed'>
          {props.trainee}
        </div>
      </div>
      <div className='mt-auto flex gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3'>
        <Headphones className='mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400' />
        <div>
          <PreviewSectionLabel>
            {localize('Live guidance', '实时提示')}
          </PreviewSectionLabel>
          <p className='mt-1 text-xs leading-relaxed'>{props.guidance}</p>
        </div>
      </div>
    </div>
  )
}

function ReviewPreview(props: {
  score: number
  summary: ReactNode
  strength: ReactNode
  improvement: ReactNode
  labels: { score: ReactNode; strength: ReactNode; improvement: ReactNode }
}) {
  return (
    <div className='flex h-full flex-col font-sans'>
      <div className='flex items-center gap-5 px-5 py-5'>
        <div className='flex size-20 shrink-0 flex-col items-center justify-center rounded-full border border-blue-500/25 bg-blue-500/5'>
          <span className='text-2xl font-semibold text-blue-600 dark:text-blue-400'>
            {props.score}
          </span>
          <span className='text-muted-foreground text-[10px]'>/ 100</span>
        </div>
        <div>
          <PreviewSectionLabel>{props.labels.score}</PreviewSectionLabel>
          <p className='mt-2 text-sm leading-relaxed'>{props.summary}</p>
        </div>
      </div>
      <div className='border-border/40 grid flex-1 grid-cols-2 border-t dark:border-white/[0.04]'>
        <ReviewFact
          icon={<ShieldCheck className='size-4 text-emerald-500' />}
          label={props.labels.strength}
          value={props.strength}
        />
        <ReviewFact
          icon={<Target className='size-4 text-blue-500' />}
          label={props.labels.improvement}
          value={props.improvement}
          bordered
        />
      </div>
    </div>
  )
}

function ReviewFact(props: {
  icon: ReactNode
  label: ReactNode
  value: ReactNode
  bordered?: boolean
}) {
  return (
    <div
      className={`px-5 py-5 ${props.bordered ? 'border-border/40 border-l dark:border-white/[0.04]' : ''}`}
    >
      <div className='flex items-center gap-2'>
        {props.icon}
        <PreviewSectionLabel>{props.label}</PreviewSectionLabel>
      </div>
      <p className='mt-3 text-sm leading-relaxed'>{props.value}</p>
    </div>
  )
}

function GrowthPreview(props: {
  skills: readonly { label: ReactNode; value: number }[]
  nextTitle: ReactNode
  nextAction: ReactNode
}) {
  return (
    <div className='flex h-full flex-col px-5 py-5 font-sans'>
      <div className='space-y-5'>
        {props.skills.map((skill) => (
          <div key={String(skill.label)}>
            <div className='mb-2 flex items-center justify-between text-xs'>
              <span className='font-medium'>{skill.label}</span>
              <span className='text-muted-foreground tabular-nums'>
                {skill.value}%
              </span>
            </div>
            <div className='bg-muted h-1.5 overflow-hidden rounded-full'>
              <div
                className='h-full rounded-full bg-violet-500'
                style={{ width: `${skill.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className='mt-auto rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-4'>
        <PreviewSectionLabel>{props.nextTitle}</PreviewSectionLabel>
        <p className='mt-2 text-sm leading-relaxed'>{props.nextAction}</p>
      </div>
    </div>
  )
}

function TrainingPreviewFooter(props: { items: readonly ReactNode[] }) {
  return (
    <div className='text-foreground/45 flex items-center gap-3 font-sans text-[10px]'>
      {props.items.map((item) => (
        <span key={String(item)} className='flex items-center gap-1.5'>
          <span className='size-1 rounded-full bg-emerald-500' />
          {item}
        </span>
      ))}
    </div>
  )
}

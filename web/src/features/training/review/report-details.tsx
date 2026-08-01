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
import { FileSearch, FileText, MessageSquareQuote } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import {
  getReviewEvidenceCoverage,
  hasStructuredReviewContent,
  normalizeReviewReportContent,
  type ReviewDimension,
  type ReviewEvidenceCoverage,
  type ReviewMessageAnchor,
} from './report-contract'
import type { ReviewBranchContext, TrainingSessionReportDTO } from './types'

type Localize = (english: string, chinese: string) => string

function formatReportDate(value: string | null, locale: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusBadgeVariant(status: ReviewEvidenceCoverage['status']) {
  if (status === 'covered') return 'secondary' as const
  if (status === 'partial' || status === 'not_verifiable') {
    return 'secondary' as const
  }
  return 'outline' as const
}

function coverageLabel(
  coverage: ReviewEvidenceCoverage,
  localize: Localize
): string {
  const labels = {
    covered: ['Known references covered', '已覆盖已知引用'],
    no_evidence: ['No selected-path evidence', '无选中路径证据'],
    no_selection: ['No selected-path reference', '无选中路径引用'],
    not_verifiable: ['Coverage not verifiable', '覆盖情况无法验证'],
    partial: ['Partially covered', '部分覆盖'],
  } as const
  const [english, chinese] = labels[coverage.status]
  return localize(english, chinese)
}

function coverageDescription(
  coverage: ReviewEvidenceCoverage,
  localize: Localize
): string {
  if (coverage.status === 'no_selection') {
    return localize(
      'No persisted selected message reference is available, so this report cannot be compared with a selected path.',
      '当前没有已持久化的选中消息引用，因此无法将报告与选中路径对照。'
    )
  }
  if (coverage.status === 'no_evidence') {
    return localize(
      'The report does not cite any evidence anchor from the persisted selected references.',
      '报告未引用任何来自已持久化选中引用的证据锚点。'
    )
  }
  if (coverage.status === 'not_verifiable') {
    return localize(
      'Evidence items contain message anchors, but those anchors do not include source message IDs for selected-path verification.',
      '证据条目包含消息锚点，但锚点没有选中路径校验所需的源消息 ID。'
    )
  }
  if (coverage.status === 'partial') {
    return localize(
      'Only some persisted selected message references are cited by report evidence.',
      '报告证据仅引用了部分已持久化的选中消息引用。'
    )
  }
  if (!coverage.fullSelectedPathReferencesAvailable) {
    return localize(
      'All persisted selected message references are cited, but the available IDs do not prove coverage of every node in the full selected path.',
      '所有已持久化的选中消息引用都已被证据引用，但现有 ID 不足以证明完整选中路径的每个节点都被覆盖。'
    )
  }
  return localize(
    'Every persisted selected-path message reference is cited by report evidence.',
    '报告证据已引用所有已持久化的选中路径消息引用。'
  )
}

function MessageReferences({ indices }: { indices: readonly number[] }) {
  if (indices.length === 0) return null
  return (
    <div className='flex flex-wrap gap-1.5'>
      {indices.map((index) => (
        <Badge key={index} variant='outline' className='font-mono'>
          #{index}
        </Badge>
      ))}
    </div>
  )
}

function AnchorList({
  anchors,
  localize,
}: {
  anchors: readonly ReviewMessageAnchor[]
  localize: Localize
}) {
  if (anchors.length === 0) return null
  return (
    <div className='space-y-2'>
      {anchors.map((anchor) => (
        <div
          key={`${anchor.messageIndex}:${anchor.sourceMessageId ?? anchor.messageId ?? ''}`}
          className='bg-muted/30 rounded-md border px-3 py-2'
        >
          <div className='mb-1.5 flex flex-wrap items-center gap-1.5'>
            <Badge variant='outline' className='font-mono'>
              #{anchor.messageIndex}
            </Badge>
            {(anchor.speaker || anchor.senderType) && (
              <Badge variant='secondary'>
                {anchor.speaker || anchor.senderType}
              </Badge>
            )}
            {anchor.emotionLabel && (
              <Badge variant='outline'>
                {anchor.emotionLabel}
                {anchor.emotionScore !== null
                  ? ` (${anchor.emotionScore})`
                  : ''}
              </Badge>
            )}
          </div>
          {anchor.quote && (
            <blockquote className='border-l-2 pl-3 text-sm leading-6 whitespace-pre-wrap'>
              {anchor.quote}
            </blockquote>
          )}
          {anchor.sourceMessageId && (
            <div className='text-muted-foreground mt-1.5 truncate font-mono text-xs'>
              {localize('Source message', '源消息')}: {anchor.sourceMessageId}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function DetailRow({
  title,
  meta,
  children,
  messageIndices = [],
  anchors = [],
  localize,
}: {
  title: string
  meta?: ReactNode
  children?: ReactNode
  messageIndices?: readonly number[]
  anchors?: readonly ReviewMessageAnchor[]
  localize: Localize
}) {
  return (
    <div className='space-y-2 py-3 first:pt-0 last:pb-0'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='font-medium'>{title}</div>
        {meta}
      </div>
      {children}
      <MessageReferences indices={messageIndices} />
      <AnchorList anchors={anchors} localize={localize} />
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <span className='flex min-w-0 items-center gap-2'>
      <span className='truncate'>{title}</span>
      <Badge variant='secondary' className='tabular-nums'>
        {count}
      </Badge>
    </span>
  )
}

function DimensionRow({
  dimension,
  localize,
}: {
  dimension: ReviewDimension
  localize: Localize
}) {
  const title =
    dimension.key === 'content_delivery'
      ? localize('Content delivery', '内容表达')
      : localize('Camera presence', '镜头表现')
  const statusLabels = {
    not_applicable: ['Not applicable', '不适用'],
    observed: ['Observed', '已评估'],
    placeholder: ['Placeholder', '占位状态'],
  } as const
  const statusLabel = dimension.status ? statusLabels[dimension.status] : null
  return (
    <DetailRow
      title={title}
      meta={
        <div className='flex items-center gap-1.5'>
          {dimension.status && (
            <Badge
              variant={
                dimension.status === 'observed' ? 'secondary' : 'outline'
              }
            >
              {statusLabel && localize(statusLabel[0], statusLabel[1])}
            </Badge>
          )}
          {dimension.score !== null && (
            <Badge variant='secondary' className='tabular-nums'>
              {dimension.score}/100
            </Badge>
          )}
        </div>
      }
      messageIndices={dimension.messageIndices}
      anchors={dimension.messageAnchors}
      localize={localize}
    >
      {dimension.label && (
        <div className='text-sm font-medium'>{dimension.label}</div>
      )}
      {dimension.rationale && (
        <p className='text-muted-foreground text-sm leading-6'>
          {dimension.rationale}
        </p>
      )}
      {dimension.evidence.length > 0 && (
        <ul className='list-disc space-y-1 pl-5 text-sm'>
          {dimension.evidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {dimension.suggestions.length > 0 && (
        <div className='space-y-1 text-sm'>
          <div className='text-muted-foreground text-xs font-medium'>
            {localize('Suggestions', '改进建议')}
          </div>
          <ul className='list-disc space-y-1 pl-5'>
            {dimension.suggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </DetailRow>
  )
}

export function ReviewReportDetails({
  report,
  branchContext,
  locale,
  localize,
}: {
  report: TrainingSessionReportDTO
  branchContext: ReviewBranchContext | null
  locale: string
  localize: Localize
}) {
  const content = useMemo(
    () => normalizeReviewReportContent(report.content),
    [report.content]
  )
  const coverage = useMemo(
    () => getReviewEvidenceCoverage(branchContext, content),
    [branchContext, content]
  )
  const hasStructuredContent = hasStructuredReviewContent(content)
  const hasEvidenceSections = Boolean(
    content.resistanceRanking.length ||
    content.effectiveArguments.length ||
    content.communicationSuggestions.length ||
    content.messageAnchors.length ||
    content.evidenceReviews.length ||
    content.alternativePhrasings.length ||
    content.rewriteDemos.length ||
    content.microDrills.length ||
    content.highSignalMoments.length
  )

  return (
    <div className='space-y-3'>
      <Card>
        <CardHeader>
          <CardTitle>{localize('Review report', '复盘报告')}</CardTitle>
          <CardDescription>
            {formatReportDate(report.created_at ?? null, locale)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.summary ? (
            <p className='leading-6 whitespace-pre-wrap'>{report.summary}</p>
          ) : (
            <span className='text-muted-foreground'>
              {localize(
                'The report has no summary text.',
                '该报告未包含摘要正文。'
              )}
            </span>
          )}
        </CardContent>
      </Card>

      {content.dimensions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{localize('Detailed scores', '详细评分')}</CardTitle>
            <CardDescription>
              {localize(
                'Only dimensions returned by the report are shown.',
                '仅展示报告真实返回的评分维度。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='divide-y'>
            {content.dimensions.map((dimension) => (
              <DimensionRow
                key={dimension.key}
                dimension={dimension}
                localize={localize}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <FileSearch className='size-4' />
            {localize('Selected-path evidence coverage', '选中路径证据覆盖')}
          </CardTitle>
          <CardDescription>
            {coverageDescription(coverage, localize)}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap gap-2'>
          <Badge variant={statusBadgeVariant(coverage.status)}>
            {coverageLabel(coverage, localize)}
          </Badge>
          <Badge variant='outline' className='tabular-nums'>
            {localize('Selected references', '选中引用')}:{' '}
            {coverage.selectedReferenceCount}
          </Badge>
          <Badge variant='outline' className='tabular-nums'>
            {localize('Evidence anchors', '证据锚点')}:{' '}
            {coverage.reportEvidenceAnchorCount}
          </Badge>
          <Badge variant='outline' className='tabular-nums'>
            {localize('Matched', '已匹配')}: {coverage.matchedReferenceCount}
          </Badge>
        </CardContent>
      </Card>

      {!hasStructuredContent && (
        <Card>
          <CardContent className='py-8'>
            <Empty className='border-none p-0'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>
                  {localize(
                    'No structured report details',
                    '暂无结构化报告详情'
                  )}
                </EmptyTitle>
                <EmptyDescription>
                  {localize(
                    'The server returned no score dimensions, evidence items, recommendations, or message anchors.',
                    '服务端未返回评分维度、证据条目、建议或消息锚点。'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      {hasEvidenceSections && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <MessageSquareQuote className='size-4' />
              {localize('Report evidence', '报告证据')}
            </CardTitle>
            <CardDescription>
              {localize(
                'Structured findings and their server-provided message references.',
                '结构化分析结果与服务端返回的消息引用。'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion multiple defaultValue={['evidence', 'recommendations']}>
              {content.evidenceReviews.length > 0 && (
                <AccordionItem value='evidence'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Evidence review', '证据复盘')}
                      count={content.evidenceReviews.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.evidenceReviews.map((item) => (
                      <DetailRow
                        key={`${item.claim}:${item.evidence}:${item.messageIndices.join(',')}`}
                        title={
                          item.claim || localize('Evidence item', '证据条目')
                        }
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.evidence && (
                          <blockquote className='border-l-2 pl-3 text-sm leading-6 whitespace-pre-wrap'>
                            {item.evidence}
                          </blockquote>
                        )}
                        {item.insight && (
                          <p className='text-muted-foreground text-sm leading-6'>
                            {item.insight}
                          </p>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.effectiveArguments.length > 0 && (
                <AccordionItem value='arguments'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Effective arguments', '有效论点')}
                      count={content.effectiveArguments.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.effectiveArguments.map((item) => (
                      <DetailRow
                        key={`${item.argument}:${item.targetPersona}:${item.messageIndices.join(',')}`}
                        title={
                          item.argument ||
                          localize('Effective move', '有效表达')
                        }
                        meta={
                          item.targetPersona ? (
                            <Badge variant='outline'>
                              {item.targetPersona}
                            </Badge>
                          ) : null
                        }
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.effectiveness && (
                          <p className='text-muted-foreground text-sm leading-6'>
                            {item.effectiveness}
                          </p>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.resistanceRanking.length > 0 && (
                <AccordionItem value='resistance'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Resistance ranking', '阻力分析')}
                      count={content.resistanceRanking.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.resistanceRanking.map((item) => (
                      <DetailRow
                        key={`${item.personaId}:${item.reason}:${item.messageIndices.join(',')}`}
                        title={
                          item.personaName ||
                          item.personaId ||
                          localize('Stakeholder', '利益相关者')
                        }
                        meta={
                          item.score !== null ? (
                            <Badge variant='outline' className='tabular-nums'>
                              {item.score > 0 ? '+' : ''}
                              {item.score}/5
                            </Badge>
                          ) : null
                        }
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.reason && (
                          <p className='text-muted-foreground text-sm leading-6'>
                            {item.reason}
                          </p>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.communicationSuggestions.length > 0 && (
                <AccordionItem value='recommendations'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Communication suggestions', '沟通建议')}
                      count={content.communicationSuggestions.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.communicationSuggestions.map((item) => (
                      <DetailRow
                        key={`${item.personaId}:${item.suggestion}`}
                        title={
                          item.personaName ||
                          item.personaId ||
                          localize('General recommendation', '通用建议')
                        }
                        meta={
                          item.priority ? (
                            <Badge variant='outline'>{item.priority}</Badge>
                          ) : null
                        }
                        localize={localize}
                      >
                        <p className='text-sm leading-6'>{item.suggestion}</p>
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.highSignalMoments.length > 0 && (
                <AccordionItem value='moments'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('High-signal moments', '高信号时刻')}
                      count={content.highSignalMoments.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.highSignalMoments.map((item) => (
                      <DetailRow
                        key={`${item.title}:${item.momentType}:${item.messageIndices.join(',')}`}
                        title={
                          item.title ||
                          localize('High-signal moment', '高信号时刻')
                        }
                        meta={
                          item.momentType ? (
                            <Badge variant='outline'>{item.momentType}</Badge>
                          ) : null
                        }
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.whyItMatters && (
                          <p className='text-muted-foreground text-sm leading-6'>
                            {item.whyItMatters}
                          </p>
                        )}
                        {item.recommendation && (
                          <p className='text-sm leading-6'>
                            {item.recommendation}
                          </p>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.alternativePhrasings.length > 0 && (
                <AccordionItem value='alternatives'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Alternative phrasing', '替代表达')}
                      count={content.alternativePhrasings.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.alternativePhrasings.map((item) => (
                      <DetailRow
                        key={`${item.situation}:${item.original}:${item.alternative}`}
                        title={
                          item.situation || localize('Alternative', '替代表达')
                        }
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.original && (
                          <div className='text-muted-foreground text-sm line-through'>
                            {item.original}
                          </div>
                        )}
                        {item.alternative && (
                          <div className='text-sm font-medium'>
                            {item.alternative}
                          </div>
                        )}
                        {item.rationale && (
                          <p className='text-muted-foreground text-sm leading-6'>
                            {item.rationale}
                          </p>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.rewriteDemos.length > 0 && (
                <AccordionItem value='rewrites'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Rewrite examples', '改写示例')}
                      count={content.rewriteDemos.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.rewriteDemos.map((item) => (
                      <DetailRow
                        key={`${item.original}:${item.rewritten}:${item.principle}`}
                        title={item.principle || localize('Rewrite', '改写')}
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.original && (
                          <div className='text-muted-foreground text-sm line-through'>
                            {item.original}
                          </div>
                        )}
                        {item.rewritten && (
                          <div className='text-sm font-medium'>
                            {item.rewritten}
                          </div>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.microDrills.length > 0 && (
                <AccordionItem value='drills'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize('Micro drills', '微练习')}
                      count={content.microDrills.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent className='divide-y'>
                    {content.microDrills.map((item) => (
                      <DetailRow
                        key={`${item.title}:${item.prompt}:${item.targetPersona}`}
                        title={item.title || localize('Practice drill', '练习')}
                        meta={
                          item.targetPersona ? (
                            <Badge variant='outline'>
                              {item.targetPersona}
                            </Badge>
                          ) : null
                        }
                        messageIndices={item.messageIndices}
                        anchors={item.messageAnchors}
                        localize={localize}
                      >
                        {item.goal && (
                          <p className='text-muted-foreground text-sm leading-6'>
                            {item.goal}
                          </p>
                        )}
                        {item.prompt && (
                          <p className='text-sm leading-6'>{item.prompt}</p>
                        )}
                        {item.practiceSteps.length > 0 && (
                          <ol className='list-decimal space-y-1 pl-5 text-sm'>
                            {item.practiceSteps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {item.successCriteria.length > 0 && (
                          <ul className='list-disc space-y-1 pl-5 text-sm'>
                            {item.successCriteria.map((criterion) => (
                              <li key={criterion}>{criterion}</li>
                            ))}
                          </ul>
                        )}
                      </DetailRow>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )}

              {content.messageAnchors.length > 0 && (
                <AccordionItem value='anchors'>
                  <AccordionTrigger>
                    <SectionHeader
                      title={localize(
                        'Transcript anchor index',
                        '转写锚点索引'
                      )}
                      count={content.messageAnchors.length}
                    />
                  </AccordionTrigger>
                  <AccordionContent>
                    <AnchorList
                      anchors={content.messageAnchors}
                      localize={localize}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

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
import type { ReviewBranchContext } from './types'

export interface ReviewMessageAnchor {
  readonly messageIndex: number
  readonly messageId: number | null
  readonly senderType: string
  readonly senderId: string
  readonly speaker: string
  readonly quote: string
  readonly emotionScore: number | null
  readonly emotionLabel: string | null
  readonly sourceConversationId: string | null
  readonly sourceMessageId: string | null
  readonly sourceParentMessageId: string | null
  readonly sourceBranchId: string | null
  readonly trainingSessionId: string | null
}

interface ReviewAnchoredItem {
  readonly messageIndices: number[]
  readonly messageIds: number[]
  readonly messageAnchors: ReviewMessageAnchor[]
}

export interface ReviewResistanceItem extends ReviewAnchoredItem {
  readonly personaId: string
  readonly personaName: string
  readonly score: number | null
  readonly reason: string
}

export interface ReviewEffectiveArgument extends ReviewAnchoredItem {
  readonly argument: string
  readonly targetPersona: string
  readonly effectiveness: string
}

export interface ReviewCommunicationSuggestion {
  readonly personaId: string
  readonly personaName: string
  readonly suggestion: string
  readonly priority: 'high' | 'low' | 'medium' | null
}

export interface ReviewEvidenceItem extends ReviewAnchoredItem {
  readonly claim: string
  readonly evidence: string
  readonly insight: string
}

export interface ReviewAlternativePhrasing extends ReviewAnchoredItem {
  readonly situation: string
  readonly original: string
  readonly alternative: string
  readonly rationale: string
}

export interface ReviewRewriteDemo extends ReviewAnchoredItem {
  readonly original: string
  readonly rewritten: string
  readonly principle: string
}

export interface ReviewMicroDrill extends ReviewAnchoredItem {
  readonly title: string
  readonly goal: string
  readonly prompt: string
  readonly practiceSteps: string[]
  readonly successCriteria: string[]
  readonly targetPersona: string
}

export interface ReviewHighSignalMoment extends ReviewAnchoredItem {
  readonly title: string
  readonly momentType: string
  readonly whyItMatters: string
  readonly recommendation: string
}

export interface ReviewDimension extends ReviewAnchoredItem {
  readonly key: 'camera_presence' | 'content_delivery'
  readonly score: number | null
  readonly label: string
  readonly rationale: string
  readonly evidence: string[]
  readonly suggestions: string[]
  readonly status: 'not_applicable' | 'observed' | 'placeholder' | null
}

export interface ReviewReportContent {
  readonly resistanceRanking: ReviewResistanceItem[]
  readonly effectiveArguments: ReviewEffectiveArgument[]
  readonly communicationSuggestions: ReviewCommunicationSuggestion[]
  readonly messageAnchors: ReviewMessageAnchor[]
  readonly evidenceReviews: ReviewEvidenceItem[]
  readonly alternativePhrasings: ReviewAlternativePhrasing[]
  readonly rewriteDemos: ReviewRewriteDemo[]
  readonly microDrills: ReviewMicroDrill[]
  readonly highSignalMoments: ReviewHighSignalMoment[]
  readonly dimensions: ReviewDimension[]
}

export type ReviewEvidenceCoverageStatus =
  | 'covered'
  | 'no_evidence'
  | 'no_selection'
  | 'not_verifiable'
  | 'partial'

export interface ReviewEvidenceCoverage {
  readonly status: ReviewEvidenceCoverageStatus
  readonly selectedReferenceCount: number
  readonly selectedPathCount: number | null
  readonly matchedReferenceCount: number
  readonly reportEvidenceAnchorCount: number
  readonly sourceLinkedEvidenceAnchorCount: number
  readonly fullSelectedPathReferencesAvailable: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalText(value: unknown): string | null {
  const text = asText(value)
  return text || null
}

function asIdentifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return asOptionalText(value)
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asSafeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? Number(value) : null
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = asText(item)
        return text ? [text] : []
      })
    : []
}

function integerList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const integer = asSafeInteger(item)
        return integer !== null ? [integer] : []
      })
    : []
}

function recordList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = asRecord(item)
        return record ? [record] : []
      })
    : []
}

function hasText(...values: string[]): boolean {
  return values.some(Boolean)
}

function normalizeMessageAnchor(value: unknown): ReviewMessageAnchor | null {
  const record = asRecord(value)
  if (!record) return null
  const messageIndex = asSafeInteger(record.message_index)
  if (messageIndex === null || messageIndex < 1) return null
  return {
    messageIndex,
    messageId: asSafeInteger(record.message_id),
    senderType: asText(record.sender_type),
    senderId: asText(record.sender_id),
    speaker: asText(record.speaker),
    quote: asText(record.quote),
    emotionScore: asFiniteNumber(record.emotion_score),
    emotionLabel: asOptionalText(record.emotion_label),
    sourceConversationId: asIdentifier(record.source_conversation_id),
    sourceMessageId: asIdentifier(record.source_message_id),
    sourceParentMessageId: asIdentifier(record.source_parent_message_id),
    sourceBranchId: asIdentifier(record.source_branch_id),
    trainingSessionId: asIdentifier(record.training_session_id),
  }
}

function normalizeMessageAnchors(value: unknown): ReviewMessageAnchor[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const anchor = normalizeMessageAnchor(item)
        return anchor ? [anchor] : []
      })
    : []
}

function anchoredFields(record: Record<string, unknown>): ReviewAnchoredItem {
  return {
    messageIndices: integerList(record.message_indices),
    messageIds: integerList(record.message_ids),
    messageAnchors: normalizeMessageAnchors(record.message_anchors),
  }
}

function normalizeResistance(value: unknown): ReviewResistanceItem[] {
  return recordList(value).flatMap((record) => {
    const item = {
      personaId: asText(record.persona_id),
      personaName: asText(record.persona_name),
      score: asFiniteNumber(record.score),
      reason: asText(record.reason),
      ...anchoredFields(record),
    }
    return hasText(item.personaId, item.personaName, item.reason) ||
      item.score !== null ||
      item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeArguments(value: unknown): ReviewEffectiveArgument[] {
  return recordList(value).flatMap((record) => {
    const item = {
      argument: asText(record.argument),
      targetPersona: asText(record.target_persona),
      effectiveness: asText(record.effectiveness),
      ...anchoredFields(record),
    }
    return hasText(item.argument, item.targetPersona, item.effectiveness) ||
      item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeSuggestions(value: unknown): ReviewCommunicationSuggestion[] {
  return recordList(value).flatMap((record) => {
    const suggestion = asText(record.suggestion)
    if (!suggestion) return []
    const priority = asText(record.priority)
    return [
      {
        personaId: asText(record.persona_id),
        personaName: asText(record.persona_name),
        suggestion,
        priority:
          priority === 'high' || priority === 'medium' || priority === 'low'
            ? priority
            : null,
      },
    ]
  })
}

function normalizeEvidence(value: unknown): ReviewEvidenceItem[] {
  return recordList(value).flatMap((record) => {
    const item = {
      claim: asText(record.claim),
      evidence: asText(record.evidence),
      insight: asText(record.insight),
      ...anchoredFields(record),
    }
    return hasText(item.claim, item.evidence, item.insight) ||
      item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeAlternatives(value: unknown): ReviewAlternativePhrasing[] {
  return recordList(value).flatMap((record) => {
    const item = {
      situation: asText(record.situation),
      original: asText(record.original),
      alternative: asText(record.alternative),
      rationale: asText(record.rationale),
      ...anchoredFields(record),
    }
    return hasText(
      item.situation,
      item.original,
      item.alternative,
      item.rationale
    ) || item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeRewrites(value: unknown): ReviewRewriteDemo[] {
  return recordList(value).flatMap((record) => {
    const item = {
      original: asText(record.original),
      rewritten: asText(record.rewritten),
      principle: asText(record.principle),
      ...anchoredFields(record),
    }
    return hasText(item.original, item.rewritten, item.principle) ||
      item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeDrills(value: unknown): ReviewMicroDrill[] {
  return recordList(value).flatMap((record) => {
    const item = {
      title: asText(record.title),
      goal: asText(record.goal),
      prompt: asText(record.prompt),
      practiceSteps: textList(record.practice_steps),
      successCriteria: textList(record.success_criteria),
      targetPersona: asText(record.target_persona),
      ...anchoredFields(record),
    }
    return hasText(item.title, item.goal, item.prompt, item.targetPersona) ||
      item.practiceSteps.length > 0 ||
      item.successCriteria.length > 0 ||
      item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeMoments(value: unknown): ReviewHighSignalMoment[] {
  return recordList(value).flatMap((record) => {
    const item = {
      title: asText(record.title),
      momentType: asText(record.moment_type),
      whyItMatters: asText(record.why_it_matters),
      recommendation: asText(record.recommendation),
      ...anchoredFields(record),
    }
    return hasText(
      item.title,
      item.momentType,
      item.whyItMatters,
      item.recommendation
    ) || item.messageAnchors.length > 0
      ? [item]
      : []
  })
}

function normalizeDimension(
  content: Record<string, unknown>,
  key: ReviewDimension['key']
): ReviewDimension | null {
  const record = asRecord(content[key])
  if (!record) return null
  const score = asFiniteNumber(record.score)
  const status = asText(record.status)
  return {
    key,
    score: score !== null && score >= 0 && score <= 100 ? score : null,
    label: asText(record.label),
    rationale: asText(record.rationale),
    evidence: textList(record.evidence),
    suggestions: textList(record.suggestions),
    status:
      status === 'observed' ||
      status === 'placeholder' ||
      status === 'not_applicable'
        ? status
        : null,
    ...anchoredFields(record),
  }
}

export function normalizeReviewReportContent(
  value: unknown
): ReviewReportContent {
  const content = asRecord(value) ?? {}
  return {
    resistanceRanking: normalizeResistance(content.resistance_ranking),
    effectiveArguments: normalizeArguments(content.effective_arguments),
    communicationSuggestions: normalizeSuggestions(
      content.communication_suggestions
    ),
    messageAnchors: normalizeMessageAnchors(content.message_anchors),
    evidenceReviews: normalizeEvidence(content.evidence_reviews),
    alternativePhrasings: normalizeAlternatives(content.alternative_phrasings),
    rewriteDemos: normalizeRewrites(content.rewrite_demos),
    microDrills: normalizeDrills(content.micro_drills),
    highSignalMoments: normalizeMoments(content.high_signal_moments),
    dimensions: (
      [
        normalizeDimension(content, 'content_delivery'),
        normalizeDimension(content, 'camera_presence'),
      ] as const
    ).filter((item): item is ReviewDimension => item !== null),
  }
}

function evidenceAnchors(content: ReviewReportContent): ReviewMessageAnchor[] {
  const anchoredItems = [
    ...content.resistanceRanking,
    ...content.effectiveArguments,
    ...content.evidenceReviews,
    ...content.alternativePhrasings,
    ...content.rewriteDemos,
    ...content.microDrills,
    ...content.highSignalMoments,
    ...content.dimensions,
  ]
  const topLevelAnchorsByIndex = new Map(
    content.messageAnchors.map((anchor) => [anchor.messageIndex, anchor])
  )
  return anchoredItems.flatMap((item) => [
    ...item.messageAnchors,
    ...item.messageIndices.flatMap((index) => {
      const anchor = topLevelAnchorsByIndex.get(index)
      return anchor ? [anchor] : []
    }),
  ])
}

function uniqueAnchors(anchors: ReviewMessageAnchor[]): ReviewMessageAnchor[] {
  const seen = new Set<string>()
  return anchors.filter((anchor) => {
    const key = [
      anchor.sourceConversationId,
      anchor.sourceMessageId,
      anchor.sourceBranchId,
      anchor.messageId,
      anchor.messageIndex,
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getReviewEvidenceCoverage(
  branch: ReviewBranchContext | null,
  content: ReviewReportContent
): ReviewEvidenceCoverage {
  const selectedReferences = [
    ...new Set(
      [
        ...(branch?.selectedPath.map((item) => item.publicId) ?? []),
        branch?.selectedTailMessageId,
      ].flatMap((value) => (value ? [value] : []))
    ),
  ]
  const anchors = uniqueAnchors(evidenceAnchors(content))
  const sourceLinkedAnchors = anchors.filter((anchor) => anchor.sourceMessageId)
  const matchedReferences = selectedReferences.filter((messageId) =>
    sourceLinkedAnchors.some(
      (anchor) =>
        anchor.sourceMessageId === messageId &&
        (!branch?.branchId ||
          !anchor.sourceBranchId ||
          anchor.sourceBranchId === branch.branchId)
    )
  )
  let status: ReviewEvidenceCoverageStatus = 'no_selection'
  if (selectedReferences.length > 0 && anchors.length === 0) {
    status = 'no_evidence'
  } else if (
    selectedReferences.length > 0 &&
    sourceLinkedAnchors.length === 0
  ) {
    status = 'not_verifiable'
  } else if (
    selectedReferences.length > 0 &&
    matchedReferences.length === selectedReferences.length
  ) {
    status = 'covered'
  } else if (matchedReferences.length > 0) {
    status = 'partial'
  } else if (selectedReferences.length > 0) {
    status = 'no_evidence'
  }

  return {
    status,
    selectedReferenceCount: selectedReferences.length,
    selectedPathCount: branch?.pathCount ?? null,
    matchedReferenceCount: matchedReferences.length,
    reportEvidenceAnchorCount: anchors.length,
    sourceLinkedEvidenceAnchorCount: sourceLinkedAnchors.length,
    fullSelectedPathReferencesAvailable: Boolean(
      branch?.pathCount && selectedReferences.length >= branch.pathCount
    ),
  }
}

export function hasStructuredReviewContent(
  content: ReviewReportContent
): boolean {
  return Boolean(
    content.resistanceRanking.length ||
    content.effectiveArguments.length ||
    content.communicationSuggestions.length ||
    content.messageAnchors.length ||
    content.evidenceReviews.length ||
    content.alternativePhrasings.length ||
    content.rewriteDemos.length ||
    content.microDrills.length ||
    content.highSignalMoments.length ||
    content.dimensions.length
  )
}

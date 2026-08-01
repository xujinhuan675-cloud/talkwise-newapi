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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  getReviewEvidenceCoverage,
  hasStructuredReviewContent,
  normalizeReviewReportContent,
} from '../report-contract'
import type { ReviewBranchContext } from '../types'

function selectedBranch(): ReviewBranchContext {
  return {
    source: 'session',
    sourceDetail: 'session.task_config.metadata',
    provider: 'message-tree',
    conversationId: 'conversation-42',
    branchId: 'branch-selected',
    selectedTailMessageId: 'message-2',
    forkPointMessageId: 'message-0',
    pathCount: 3,
    pathSummary: null,
    lastReplyPreview: null,
    pathTextState: 'id_only',
    selectedPath: [
      {
        publicId: 'message-1',
        role: 'user',
        content: '',
        branchId: 'branch-selected',
        parentMessageId: 'message-0',
      },
      {
        publicId: 'message-2',
        role: 'assistant',
        content: '',
        branchId: 'branch-selected',
        parentMessageId: 'message-1',
      },
    ],
  }
}

describe('training review report contract', () => {
  test('normalizes the real report DTO without inventing missing fields', () => {
    const content = normalizeReviewReportContent({
      resistance_ranking: [
        {
          persona_id: 'persona-1',
          persona_name: 'Procurement lead',
          score: -3,
          reason: 'Budget concern remained unresolved.',
          message_indices: [2],
          message_anchors: [
            {
              message_index: 2,
              message_id: 202,
              speaker: 'Procurement lead',
              quote: 'The budget is fixed.',
              source_conversation_id: 42,
              source_message_id: 'message-2',
              source_branch_id: 'branch-selected',
            },
          ],
        },
      ],
      effective_arguments: [
        {
          argument: 'Tie the proposal to renewal risk.',
          target_persona: 'Procurement lead',
          effectiveness: 'It reframed cost as avoided risk.',
          message_indices: [1],
        },
      ],
      communication_suggestions: [
        {
          persona_id: 'persona-1',
          persona_name: 'Procurement lead',
          suggestion: 'Ask for the acceptable trade-off first.',
          priority: 'high',
        },
        { suggestion: '', priority: 'high' },
      ],
      evidence_reviews: [
        {
          claim: 'The user acknowledged the objection.',
          evidence: 'I understand the budget is fixed.',
          insight: 'Acknowledgement reduced resistance.',
          message_indices: [1],
        },
      ],
      alternative_phrasings: [
        {
          situation: 'Budget objection',
          original: 'This is our best price.',
          alternative: 'Which outcome would justify this investment?',
          rationale: 'Moves from defense to discovery.',
          message_indices: [1],
        },
      ],
      rewrite_demos: [
        {
          original: 'You need this.',
          rewritten: 'Would reducing renewal risk help?',
          principle: 'Use a calibrated question.',
          message_indices: [1],
        },
      ],
      micro_drills: [
        {
          title: 'Budget discovery',
          goal: 'Surface the real constraint.',
          prompt: 'Ask one calibrated budget question.',
          practice_steps: ['Acknowledge', 'Ask'],
          success_criteria: ['No premature pitch'],
          target_persona: 'Procurement lead',
          message_indices: [2],
        },
      ],
      high_signal_moments: [
        {
          title: 'Objection surfaced',
          moment_type: 'resistance',
          why_it_matters: 'The constraint became explicit.',
          recommendation: 'Pause and clarify.',
          message_indices: [2],
        },
      ],
      content_delivery: {
        score: 84,
        label: 'Clear',
        rationale: 'Concise and structured.',
        evidence: ['Clear opening'],
        suggestions: ['Pause after the question'],
        status: 'observed',
        message_indices: [1],
      },
      camera_presence: {
        score: 140,
        label: 'Unavailable',
        status: 'placeholder',
      },
      message_anchors: [
        {
          message_index: 1,
          message_id: 201,
          source_conversation_id: 42,
          source_message_id: 'message-1',
          source_branch_id: 'branch-selected',
        },
      ],
    })

    assert.equal(content.resistanceRanking[0]?.score, -3)
    assert.equal(
      content.resistanceRanking[0]?.messageAnchors[0]?.sourceConversationId,
      '42'
    )
    assert.equal(content.communicationSuggestions.length, 1)
    assert.equal(content.effectiveArguments[0]?.messageIndices[0], 1)
    assert.equal(
      content.alternativePhrasings[0]?.alternative.startsWith('Which'),
      true
    )
    assert.equal(
      content.rewriteDemos[0]?.principle,
      'Use a calibrated question.'
    )
    assert.deepEqual(content.microDrills[0]?.practiceSteps, [
      'Acknowledge',
      'Ask',
    ])
    assert.equal(content.highSignalMoments[0]?.momentType, 'resistance')
    assert.equal(content.dimensions[0]?.score, 84)
    assert.equal(content.dimensions[1]?.score, null)
    assert.equal(hasStructuredReviewContent(content), true)
  })

  test('resolves evidence message indices through the top-level anchor index', () => {
    const content = normalizeReviewReportContent({
      evidence_reviews: [
        {
          claim: 'Selected messages support this finding.',
          message_indices: [1, 2],
        },
      ],
      message_anchors: [
        {
          message_index: 1,
          source_message_id: 'message-1',
          source_branch_id: 'branch-selected',
        },
        {
          message_index: 2,
          source_message_id: 'message-2',
          source_branch_id: 'branch-selected',
        },
      ],
    })

    assert.deepEqual(getReviewEvidenceCoverage(selectedBranch(), content), {
      status: 'covered',
      selectedReferenceCount: 2,
      selectedPathCount: 3,
      matchedReferenceCount: 2,
      reportEvidenceAnchorCount: 2,
      sourceLinkedEvidenceAnchorCount: 2,
      fullSelectedPathReferencesAvailable: false,
    })
  })

  test('does not count the transcript anchor index as report evidence by itself', () => {
    const content = normalizeReviewReportContent({
      message_anchors: [
        {
          message_index: 1,
          source_message_id: 'message-1',
          source_branch_id: 'branch-selected',
        },
        {
          message_index: 2,
          source_message_id: 'message-2',
          source_branch_id: 'branch-selected',
        },
      ],
    })

    assert.equal(
      getReviewEvidenceCoverage(selectedBranch(), content).status,
      'no_evidence'
    )
  })

  test('keeps partial, unverified, and missing selection coverage explicit', () => {
    const partialContent = normalizeReviewReportContent({
      evidence_reviews: [
        {
          claim: 'Only one selected message is cited.',
          message_anchors: [
            {
              message_index: 1,
              source_message_id: 'message-1',
              source_branch_id: 'branch-selected',
            },
          ],
        },
      ],
    })
    const legacyContent = normalizeReviewReportContent({
      evidence_reviews: [
        {
          claim: 'Legacy evidence',
          message_anchors: [{ message_index: 1, message_id: 100 }],
        },
      ],
    })

    assert.equal(
      getReviewEvidenceCoverage(selectedBranch(), partialContent).status,
      'partial'
    )
    assert.equal(
      getReviewEvidenceCoverage(selectedBranch(), legacyContent).status,
      'not_verifiable'
    )
    assert.equal(
      getReviewEvidenceCoverage(null, partialContent).status,
      'no_selection'
    )
  })
})

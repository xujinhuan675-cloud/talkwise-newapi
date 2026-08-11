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
import type { TrainingFeedbackMode } from './training-feedback'

export type TrainingModeModality = 'text' | 'voice' | 'video'
export type TrainingModeInteraction = 'turn_based' | 'realtime'

export interface TrainingModeSelection {
  readonly modality: TrainingModeModality
  readonly feedbackMode: TrainingFeedbackMode
  readonly interactionMode: TrainingModeInteraction
}

export function trainingFeedbackRequiredInteractionMode(
  feedbackMode: TrainingFeedbackMode
): TrainingModeInteraction | null {
  if (feedbackMode === 'drill') return 'turn_based'
  if (feedbackMode === 'assisted') return 'realtime'
  return null
}

export function resolveTrainingInteractionMode(
  selection: TrainingModeSelection
): TrainingModeInteraction {
  if (selection.modality !== 'voice') return selection.interactionMode
  return (
    trainingFeedbackRequiredInteractionMode(selection.feedbackMode) ??
    selection.interactionMode
  )
}

export function isTrainingInteractionModeCompatible(
  selection: TrainingModeSelection
): boolean {
  return resolveTrainingInteractionMode(selection) === selection.interactionMode
}

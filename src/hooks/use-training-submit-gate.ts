'use client'

import { useMemo } from 'react'

import { LORA_TRAINING } from '@/constants/config'
import type { LoraTrainingBaseModel } from '@/constants/lora'

export type TrainingSubmitBadge = 'incomplete' | 'invalid' | 'ready'

export type TrainingSubmitReasonKey =
  | 'noImages'
  | 'tooFewImages'
  | 'noName'
  | 'invalidName'
  | 'noTrigger'
  | 'invalidTrigger'
  | 'unsupportedBaseModel'
  | 'noApiKey'
  | 'uploading'

export interface TrainingSubmitGateInput {
  name: string
  triggerWord: string
  baseModel: LoraTrainingBaseModel
  imageCount: number
  uploadsInFlight: number
  hasApiKey: boolean
}

export interface TrainingSubmitGate {
  disabled: boolean
  reasonKey: TrainingSubmitReasonKey | null
  badge: TrainingSubmitBadge
}

const TRIGGER_WORD_PATTERN = /^[A-Za-z0-9_]+$/
const NAME_INVALID_PATTERN = /[<>:"/\\|?*\x00-\x1f]/

/**
 * Single source of truth for "should the Submit button be enabled?". Used
 * by both the desktop form and the mobile bottom sheet, plus the test
 * suite — so the answer is consistent across every entry point.
 *
 * Returns `{disabled, reasonKey, badge}`:
 *   - `disabled`: whether the submit button should be in disabled state
 *   - `reasonKey`: i18n key under `LoraTraining.submitGate.*` explaining
 *     why (null when enabled). Order is fixed — earlier reasons take
 *     precedence so the user sees the most actionable hint first.
 *   - `badge`: visual hint state for the SubmitSummaryCard:
 *       'invalid'    = user typed something we can't accept (red)
 *       'incomplete' = still has fields left to fill (amber)
 *       'ready'      = all gates pass (green)
 *
 * The check order matters: we surface NO_IMAGES before TOO_FEW_IMAGES so
 * an empty-form user sees "upload images" instead of "upload at least 5".
 */
export function useTrainingSubmitGate(
  input: TrainingSubmitGateInput,
): TrainingSubmitGate {
  return useMemo(() => {
    const trimmedName = input.name.trim()
    const trimmedTrigger = input.triggerWord.trim()

    // Hard validation errors first — these mean the user typed something
    // wrong and need to fix it (red badge), not just complete more fields.
    if (trimmedName.length > 0 && NAME_INVALID_PATTERN.test(trimmedName)) {
      return {
        disabled: true,
        reasonKey: 'invalidName',
        badge: 'invalid',
      }
    }
    if (
      trimmedTrigger.length > 0 &&
      !TRIGGER_WORD_PATTERN.test(trimmedTrigger)
    ) {
      return {
        disabled: true,
        reasonKey: 'invalidTrigger',
        badge: 'invalid',
      }
    }

    if (input.baseModel !== 'flux-1-d') {
      return {
        disabled: true,
        reasonKey: 'unsupportedBaseModel',
        badge: 'invalid',
      }
    }

    // Soft incomplete states — user just hasn't filled everything yet.
    if (input.imageCount === 0) {
      return { disabled: true, reasonKey: 'noImages', badge: 'incomplete' }
    }
    if (input.imageCount < LORA_TRAINING.MIN_IMAGES) {
      return { disabled: true, reasonKey: 'tooFewImages', badge: 'incomplete' }
    }
    if (trimmedName.length === 0) {
      return { disabled: true, reasonKey: 'noName', badge: 'incomplete' }
    }
    if (trimmedTrigger.length === 0) {
      return { disabled: true, reasonKey: 'noTrigger', badge: 'incomplete' }
    }
    if (!input.hasApiKey) {
      return { disabled: true, reasonKey: 'noApiKey', badge: 'incomplete' }
    }
    if (input.uploadsInFlight > 0) {
      return { disabled: true, reasonKey: 'uploading', badge: 'incomplete' }
    }

    return { disabled: false, reasonKey: null, badge: 'ready' }
  }, [
    input.name,
    input.triggerWord,
    input.baseModel,
    input.imageCount,
    input.uploadsInFlight,
    input.hasApiKey,
  ])
}

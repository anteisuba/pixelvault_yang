import 'server-only'

import { MODEL_STRENGTHS } from '@/constants/model-strengths'
import { AI_MODELS } from '@/constants/models'
import type { ImageIntent } from '@/types'

const TAG_QUALITY_PREFIX = 'masterpiece, best quality, highres'
const TAG_NEGATIVE_QUALITY =
  'worst quality, low quality, blurry, text, watermark, signature'

function toTag(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '_')
}

function compileTagBased(intent: ImageIntent): string {
  const tags: string[] = [TAG_QUALITY_PREFIX]

  tags.push(toTag(intent.subject))
  if (intent.subjectDetails) tags.push(toTag(intent.subjectDetails))
  if (intent.actionOrPose) tags.push(toTag(intent.actionOrPose))
  if (intent.scene) tags.push(toTag(intent.scene))
  if (intent.style) tags.push(toTag(intent.style))
  if (intent.composition) tags.push(toTag(intent.composition))
  if (intent.lighting) tags.push(toTag(intent.lighting))
  if (intent.colorPalette) tags.push(toTag(intent.colorPalette))
  if (intent.mood) tags.push(toTag(intent.mood))
  if (intent.mustInclude) {
    for (const item of intent.mustInclude) tags.push(toTag(item))
  }

  return tags.join(', ')
}

function compilePhotorealistic(intent: ImageIntent): string {
  const parts: string[] = []

  const subject = [intent.subject, intent.subjectDetails]
    .filter(Boolean)
    .join(', ')
  parts.push(subject)

  if (intent.actionOrPose) parts.push(intent.actionOrPose)
  if (intent.scene) parts.push(`in ${intent.scene}`)
  if (intent.camera) parts.push(intent.camera)
  if (intent.lighting) parts.push(intent.lighting)
  if (intent.colorPalette) parts.push(`${intent.colorPalette} color grading`)
  if (intent.mood) parts.push(`${intent.mood} mood`)
  if (intent.composition) parts.push(intent.composition)
  if (intent.style) parts.push(`${intent.style} style`)
  if (intent.mustInclude) {
    for (const item of intent.mustInclude) parts.push(item)
  }

  return parts.join(', ')
}

function compileNaturalLanguage(intent: ImageIntent): string {
  const parts: string[] = []

  if (intent.style) parts.push(`${intent.style} style`)
  const subject = [intent.subject, intent.subjectDetails]
    .filter(Boolean)
    .join(', ')
  parts.push(subject)
  if (intent.actionOrPose) parts.push(intent.actionOrPose)
  if (intent.scene) parts.push(intent.scene)
  if (intent.composition) parts.push(intent.composition)
  if (intent.camera) parts.push(intent.camera)
  if (intent.lighting) parts.push(intent.lighting)
  if (intent.colorPalette) parts.push(intent.colorPalette)
  if (intent.mood) parts.push(`${intent.mood} mood`)
  if (intent.mustInclude) {
    for (const item of intent.mustInclude) parts.push(item)
  }

  return parts.join(', ')
}

/**
 * Compile a model-specific prompt string from structured intent.
 * Pure function: no I/O, no LLM, no DB.
 */
export function compilePrompt(intent: ImageIntent, modelId: string): string {
  const strength = MODEL_STRENGTHS[modelId as AI_MODELS]

  if (strength?.promptStyle === 'tag-based') {
    return compileTagBased(intent)
  }

  if (strength?.bestFor.includes('photorealistic')) {
    return compilePhotorealistic(intent)
  }

  return compileNaturalLanguage(intent)
}

/**
 * Compile a negative prompt from intent.mustAvoid and model strategy.
 * Returns undefined when there is nothing to negate.
 */
export function compileNegativePrompt(
  intent: ImageIntent,
  modelId: string,
): string | undefined {
  const strength = MODEL_STRENGTHS[modelId as AI_MODELS]
  const isTagBased = strength?.promptStyle === 'tag-based'
  const parts: string[] = []

  if (isTagBased) {
    parts.push(TAG_NEGATIVE_QUALITY)
  }

  if (intent.mustAvoid && intent.mustAvoid.length > 0) {
    const formatted = isTagBased
      ? intent.mustAvoid.map(toTag)
      : intent.mustAvoid
    parts.push(...formatted)
  }

  return parts.length > 0 ? parts.join(', ') : undefined
}

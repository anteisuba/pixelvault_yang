import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import {
  openAISafetyIdentifierFor,
  toOpenAISafetyIdentifier,
} from './openai-safety-identifier'

describe('toOpenAISafetyIdentifier', () => {
  it('is a stable 64-char hex hash that never contains the raw id', () => {
    const id = toOpenAISafetyIdentifier('user_abc')
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(id).toBe(toOpenAISafetyIdentifier('user_abc'))
    expect(id).not.toContain('user_abc')
    expect(id).not.toBe(toOpenAISafetyIdentifier('user_abd'))
  })
})

describe('openAISafetyIdentifierFor', () => {
  it.each([
    AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
    AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
    AI_MODELS.OPENAI_GPT_IMAGE_26_FLARE,
    AI_MODELS.OPENAI_GPT_IMAGE_26_SUNBURST,
  ])('hashes for %s', (modelId) => {
    expect(
      openAISafetyIdentifierFor(AI_ADAPTER_TYPES.OPENAI, modelId, 'u1'),
    ).toBe(toOpenAISafetyIdentifier('u1'))
  })

  it('skips gpt-image-2 (unverified) and non-OpenAI adapters', () => {
    expect(
      openAISafetyIdentifierFor(
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
        'u1',
      ),
    ).toBeUndefined()
    expect(
      openAISafetyIdentifierFor(
        AI_ADAPTER_TYPES.FAL,
        AI_MODELS.OPENAI_GPT_IMAGE_26_FLARE,
        'u1',
      ),
    ).toBeUndefined()
  })
})

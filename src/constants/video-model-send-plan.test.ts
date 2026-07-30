import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { getVideoModelSendContract } from './video-model-send-plan'

describe('video model send contracts', () => {
  it('defines Seedance Reference as a 12-item multimodal pool', () => {
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      AI_ADAPTER_TYPES.FAL,
    )

    expect(contract).toMatchObject({
      family: 'seedance',
      referenceMode: 'multimodal-reference',
      slots: {
        images: 9,
        videos: 3,
        audio: 3,
        total: 12,
        audioRequiresVisual: true,
      },
      execution: 'ready',
      positionalImageTokens: true,
    })
  })

  it.each([
    [AI_MODELS.KLING_V3_PRO, 'kling'],
    [AI_MODELS.KLING_O3_PRO, 'kling'],
    [AI_MODELS.HAPPYHORSE_10, 'happyhorse'],
  ] as const)('%s accepts one first frame only', (modelId, family) => {
    const contract = getVideoModelSendContract(modelId, AI_ADAPTER_TYPES.FAL)

    expect(contract.family).toBe(family)
    expect(contract.referenceMode).toBe('text-or-first-frame')
    expect(contract.slots).toEqual({
      images: 1,
      videos: 0,
      audio: 0,
    })
    expect(contract.execution).toBe('ready')
  })

  it('does not invent a Gemini image cap and reports its missing worker route', () => {
    const contract = getVideoModelSendContract(
      AI_MODELS.GEMINI_OMNI_FLASH,
      AI_ADAPTER_TYPES.GEMINI,
    )

    expect(contract.referenceMode).toBe('image-content-array')
    expect(contract.slots.images).toBeUndefined()
    expect(contract.slots.videos).toBe(0)
    expect(contract.slots.audio).toBe(0)
    expect(contract.execution).toBe('execution-not-migrated')
  })

  it('does not mark an unknown Fal video model runnable from its adapter alone', () => {
    const contract = getVideoModelSendContract(
      'custom-fal-video-model',
      AI_ADAPTER_TYPES.FAL,
    )

    expect(contract.family).toBe('fallback')
    expect(contract.execution).toBe('execution-not-migrated')
  })
})

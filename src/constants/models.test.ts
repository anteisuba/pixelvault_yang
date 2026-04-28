import { describe, expect, it } from 'vitest'

import {
  AI_MODELS,
  getExecutionModelId,
  getModelById,
  getModelFamily,
  getModelMessageKey,
  isBuiltInModel,
  MODEL_OPTIONS,
  normalizeModelId,
} from '@/constants/models'

describe('models', () => {
  it('keeps renamed video model IDs canonical in the active catalog', () => {
    const modelIds = MODEL_OPTIONS.map((model) => model.id)

    expect(modelIds).toContain(AI_MODELS.VEO_31)
    expect(modelIds).toContain(AI_MODELS.PIKA_V25)
    expect(modelIds).not.toContain('veo-3')
    expect(modelIds).not.toContain('pika-v2.2')
  })

  it('resolves legacy video IDs to canonical model configs', () => {
    expect(normalizeModelId('veo-3')).toBe(AI_MODELS.VEO_31)
    expect(normalizeModelId('pika-v2.2')).toBe(AI_MODELS.PIKA_V25)

    expect(getModelById('veo-3')?.id).toBe(AI_MODELS.VEO_31)
    expect(getModelById('pika-v2.2')?.id).toBe(AI_MODELS.PIKA_V25)
    expect(getExecutionModelId('veo-3')).toBe('fal-ai/veo3.1')
    expect(getExecutionModelId('pika-v2.2')).toBe(
      'fal-ai/pika/v2.5/text-to-video',
    )
  })

  it('resolves legacy video IDs for labels and family grouping', () => {
    expect(isBuiltInModel('veo-3')).toBe(true)
    expect(isBuiltInModel('pika-v2.2')).toBe(true)
    expect(getModelMessageKey('veo-3')).toBe('veo31')
    expect(getModelMessageKey('pika-v2.2')).toBe('pikaV25')
    expect(getModelFamily('veo-3')).toBe('Veo')
    expect(getModelFamily('pika-v2.2')).toBe('Pika')
  })
})

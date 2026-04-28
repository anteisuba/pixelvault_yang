import { describe, expect, it } from 'vitest'

import {
  AI_MODELS,
  getAvailableImageModels,
  getAvailableModels,
  getAvailableVideoModels,
  getExecutionModelId,
  getModelById,
  getModelFamily,
  getModelMessageKey,
  isBuiltInModel,
  isFreeTierModel,
  isRetiredModelId,
  MODEL_OPTIONS,
  normalizeModelId,
  RETIRED_MODEL_IDS,
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

  it('keeps retired models resolvable but hidden from available lists', () => {
    const availableModelIds = getAvailableModels().map((model) => model.id)
    const availableImageModelIds = getAvailableImageModels().map(
      (model) => model.id,
    )
    const availableVideoModelIds = getAvailableVideoModels().map(
      (model) => model.id,
    )

    for (const modelId of RETIRED_MODEL_IDS) {
      const model = getModelById(modelId)

      expect(isRetiredModelId(modelId)).toBe(true)
      expect(model).toBeDefined()
      expect(model?.available).toBe(false)
      expect(availableModelIds).not.toContain(modelId)

      if (model?.outputType === 'IMAGE') {
        expect(availableImageModelIds).not.toContain(modelId)
      }

      if (model?.outputType === 'VIDEO') {
        expect(availableVideoModelIds).not.toContain(modelId)
      }
    }

    expect(getModelMessageKey(AI_MODELS.RECRAFT_V3)).toBe('recraftV3')
    expect(getModelFamily(AI_MODELS.RECRAFT_V3)).toBe('Recraft')
  })

  it('does not treat retired free-tier models as active free-tier options', () => {
    expect(isFreeTierModel(AI_MODELS.GEMINI_25_FLASH_IMAGE)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import {
  AI_MODELS,
  getAvailableAudioModels,
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
import { getWorkflowStudioDefaults, WORKFLOWS } from '@/constants/workflows'

describe('models', () => {
  it('keeps renamed video model IDs canonical in the active catalog', () => {
    const modelIds = MODEL_OPTIONS.map((model) => model.id)

    expect(modelIds).toContain(AI_MODELS.VEO_31)
    expect(modelIds).toContain(AI_MODELS.HAPPYHORSE_10)
    expect(modelIds).toContain(AI_MODELS.LTX_23)
    expect(modelIds).not.toContain('veo-3')
  })

  it('resolves supported model aliases to canonical model configs', () => {
    expect(normalizeModelId('veo-3')).toBe(AI_MODELS.VEO_31)
    expect(normalizeModelId('gemini-3.1-flash-image')).toBe(
      AI_MODELS.GEMINI_FLASH_IMAGE,
    )

    expect(getModelById('veo-3')?.id).toBe(AI_MODELS.VEO_31)
    expect(getModelById('gemini-3.1-flash-image')?.id).toBe(
      AI_MODELS.GEMINI_FLASH_IMAGE,
    )
    expect(getExecutionModelId('veo-3')).toBe('fal-ai/veo3.1')
    expect(getExecutionModelId('gemini-3.1-flash-image')).toBe(
      'gemini-3.1-flash-image',
    )
  })

  it('resolves legacy video IDs for labels and family grouping', () => {
    expect(isBuiltInModel('veo-3')).toBe(true)
    expect(getModelMessageKey('veo-3')).toBe('veo31')
    expect(getModelFamily('veo-3')).toBe('Veo')
  })

  it('resolves 3D model IDs for i18n labels', () => {
    expect(getModelMessageKey(AI_MODELS.RODIN_GEN_2_5)).toBe('rodinGen25')
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

    expect(getModelMessageKey(AI_MODELS.ANIMA_PENCIL_XL)).toBe('animaPencilXl')
    expect(getModelFamily(AI_MODELS.ANIMA_PENCIL_XL)).toBe('Anima')
  })

  it('keeps every unavailable catalog model in the retired ID list', () => {
    const retiredModelIds = new Set<string>(RETIRED_MODEL_IDS)

    for (const model of MODEL_OPTIONS) {
      if (!model.available) {
        expect(retiredModelIds.has(model.id)).toBe(true)
      }
    }
  })

  it('keeps workflow recommended models active', () => {
    const availableModelIds = new Set<string>(
      getAvailableModels().map((model) => model.id),
    )

    for (const workflow of WORKFLOWS) {
      const defaults = getWorkflowStudioDefaults(workflow.id)

      for (const modelId of defaults.recommendedModelIds ?? []) {
        expect(availableModelIds.has(modelId)).toBe(true)
        expect(isRetiredModelId(modelId)).toBe(false)
      }
    }
  })

  it('does not treat retired models as active free-tier options', () => {
    expect(isFreeTierModel(AI_MODELS.ANIMA_PENCIL_XL)).toBe(false)
    expect(isFreeTierModel(AI_MODELS.HUNYUAN3D_2_1)).toBe(false)
  })

  it('keeps supported audio generation models active', () => {
    expect(getAvailableAudioModels().map((model) => model.id)).toEqual([
      AI_MODELS.FISH_AUDIO_S2_PRO,
      AI_MODELS.ELEVENLABS_V3,
    ])
  })
})

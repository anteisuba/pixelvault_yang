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
  RESERVED_MODEL_IDS,
  RETIRED_MODEL_IDS,
} from '@/constants/models'
import { getWorkflowStudioDefaults, WORKFLOWS } from '@/constants/workflows'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

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

  it('keeps every unavailable catalog model retired, reserved, or feature-flag-gated', () => {
    const retiredModelIds = new Set<string>(RETIRED_MODEL_IDS)
    const reservedModelIds = new Set<string>(RESERVED_MODEL_IDS)

    for (const model of MODEL_OPTIONS) {
      if (!model.available) {
        // Comfy Runner (RunPod) models are unavailable-by-default behind
        // FEATURE_FLAGS.comfyRunner in test/CI envs — not permanently dead
        // like RETIRED_MODEL_IDS entries. See
        // docs/references/domains/runner.md.
        const isFlagGatedRunnerModel =
          model.adapterType === AI_ADAPTER_TYPES.RUNNER
        // RESERVED = fully modelled but the provider hasn't opened the API, so
        // it ships dark behind a placeholder externalModelId. Third legitimate
        // reason to be unavailable; anything outside these three is a mistake.
        expect(
          retiredModelIds.has(model.id) ||
            reservedModelIds.has(model.id) ||
            isFlagGatedRunnerModel,
          `${model.id} is unavailable but is neither retired, reserved, nor runner-flag-gated`,
        ).toBe(true)
      }
    }
  })

  it('never lets a model be both retired and reserved', () => {
    const retiredModelIds = new Set<string>(RETIRED_MODEL_IDS)
    for (const id of RESERVED_MODEL_IDS) {
      expect(
        retiredModelIds.has(id),
        `${id} cannot be reserved and retired at once`,
      ).toBe(false)
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
    // ELEVENLABS_V3 retired 2026-07-26 (priced ~6.7x Fish S2 Pro). SFX + Music
    // stay as non-speech audio kinds.
    expect(getAvailableAudioModels().map((model) => model.id)).toEqual([
      AI_MODELS.FISH_AUDIO_S2_PRO,
      AI_MODELS.ELEVENLABS_SFX_V2,
      AI_MODELS.ELEVENLABS_MUSIC_V2,
    ])
  })

  it('uses Fish s2.1-pro-free execution id while keeping stable catalog key', () => {
    expect(getExecutionModelId(AI_MODELS.FISH_AUDIO_S2_PRO)).toBe(
      's2.1-pro-free',
    )
  })

  it('registers Kling O3 Pro and FLUX.2 Pro Edit as available', () => {
    const available = new Set(getAvailableModels().map((m) => m.id))
    expect(available.has(AI_MODELS.KLING_O3_PRO)).toBe(true)
    expect(available.has(AI_MODELS.FLUX_2_PRO_EDIT)).toBe(true)
  })

  it('keeps NovelAI V4.5 and V5 available as BYOK image models', () => {
    const availableImageIds = new Set(
      getAvailableImageModels().map((model) => model.id),
    )

    for (const modelId of [
      AI_MODELS.NOVELAI_V45_FULL,
      AI_MODELS.NOVELAI_V45_CURATED,
      AI_MODELS.NOVELAI_V5_FULL,
      AI_MODELS.NOVELAI_V5_CURATED,
    ]) {
      const model = getModelById(modelId)
      expect(isRetiredModelId(modelId)).toBe(false)
      expect(model?.available).toBe(true)
      expect(model?.freeTier).toBeUndefined()
      expect(model?.adapterType).toBe(AI_ADAPTER_TYPES.NOVELAI)
      expect(availableImageIds.has(modelId)).toBe(true)
    }
  })
})

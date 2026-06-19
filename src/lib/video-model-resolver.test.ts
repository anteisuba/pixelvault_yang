import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VIDEO_BRAND_IDS, VIDEO_VARIANT_IDS } from '@/constants/video-brands'
import {
  deriveSwitcherStateFromModel,
  getSurfacedVideoBrands,
  isDualProviderBrand,
  pickDefaultProvider,
  resolveVideoModelId,
} from '@/lib/video-model-resolver'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'

function opt(
  modelId: string,
  sourceType: 'workspace' | 'saved' = 'workspace',
): NodeWorkflowModelOption {
  const model = getModelById(modelId)
  return {
    optionId: `${sourceType}:${modelId}`,
    modelId,
    adapterType: model?.adapterType ?? AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'Test', baseUrl: 'https://example.test' },
    requestCount: 0,
    sourceType,
    ...(sourceType === 'saved' ? { apiKeyId: `key-${modelId}` } : {}),
  }
}

const SEEDANCE_IDS = [
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
]

const ALL_OPTIONS = [
  ...SEEDANCE_IDS.map((id) => opt(id)),
  opt(AI_MODELS.KLING_V3_PRO),
  opt(AI_MODELS.VEO_31),
]

const { FAL, VOLCENGINE } = AI_ADAPTER_TYPES

function resolveId(
  brand: string,
  variant: (typeof VIDEO_VARIANT_IDS)[keyof typeof VIDEO_VARIANT_IDS],
  provider: typeof FAL | typeof VOLCENGINE,
  hasReferenceInputs: boolean,
): string | null {
  return (
    resolveVideoModelId(
      { brand, variant, provider, hasReferenceInputs },
      ALL_OPTIONS,
    )?.modelId ?? null
  )
}

describe('resolveVideoModelId — Seedance four quadrants × provider', () => {
  const S = VIDEO_BRAND_IDS.seedance
  const std = VIDEO_VARIANT_IDS.standard
  const fast = VIDEO_VARIANT_IDS.fast

  it('resolves fal non-reference', () => {
    expect(resolveId(S, std, FAL, false)).toBe(AI_MODELS.SEEDANCE_20)
    expect(resolveId(S, fast, FAL, false)).toBe(AI_MODELS.SEEDANCE_20_FAST)
  })

  it('resolves VolcEngine non-reference', () => {
    expect(resolveId(S, std, VOLCENGINE, false)).toBe(
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
    )
    expect(resolveId(S, fast, VOLCENGINE, false)).toBe(
      AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
    )
  })

  it('flips to the _REFERENCE id when reference inputs are bound (mode-by-input)', () => {
    expect(resolveId(S, std, FAL, true)).toBe(AI_MODELS.SEEDANCE_20_REFERENCE)
    expect(resolveId(S, fast, FAL, true)).toBe(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
    )
    expect(resolveId(S, std, VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    )
    expect(resolveId(S, fast, VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
    )
  })
})

describe('resolveVideoModelId — single-variant brands', () => {
  it('returns the single Kling/Veo id regardless of variant/provider/refs', () => {
    for (const refs of [false, true]) {
      expect(
        resolveId(VIDEO_BRAND_IDS.kling, VIDEO_VARIANT_IDS.standard, FAL, refs),
      ).toBe(AI_MODELS.KLING_V3_PRO)
      expect(
        resolveId(VIDEO_BRAND_IDS.veo, VIDEO_VARIANT_IDS.fast, FAL, refs),
      ).toBe(AI_MODELS.VEO_31)
    }
  })
})

describe('resolveVideoModelId — unavailable combo', () => {
  it('returns null when no option matches (e.g. VolcEngine with fal-only options)', () => {
    const falOnly = [
      opt(AI_MODELS.SEEDANCE_20),
      opt(AI_MODELS.SEEDANCE_20_FAST),
    ]
    expect(
      resolveVideoModelId(
        {
          brand: VIDEO_BRAND_IDS.seedance,
          variant: VIDEO_VARIANT_IDS.fast,
          provider: VOLCENGINE,
          hasReferenceInputs: false,
        },
        falOnly,
      ),
    ).toBeNull()
  })
})

describe('getSurfacedVideoBrands', () => {
  it('surfaces only Seedance/Kling/Veo, never LTX/HappyHorse', () => {
    const withHidden = [
      ...ALL_OPTIONS,
      opt(AI_MODELS.LTX_23),
      opt(AI_MODELS.HAPPYHORSE_10),
    ]
    expect(getSurfacedVideoBrands(withHidden)).toEqual([
      VIDEO_BRAND_IDS.seedance,
      VIDEO_BRAND_IDS.kling,
      VIDEO_BRAND_IDS.veo,
    ])
  })
})

describe('isDualProviderBrand / pickDefaultProvider', () => {
  it('marks Seedance dual-provider but not Kling', () => {
    expect(isDualProviderBrand(VIDEO_BRAND_IDS.seedance, ALL_OPTIONS)).toBe(
      true,
    )
    expect(isDualProviderBrand(VIDEO_BRAND_IDS.kling, ALL_OPTIONS)).toBe(false)
  })

  it('prefers the provider that has a saved key, else FAL', () => {
    expect(pickDefaultProvider(VIDEO_BRAND_IDS.seedance, ALL_OPTIONS)).toBe(FAL)
    const withSavedVolc = [
      ...SEEDANCE_IDS.map((id) =>
        id === AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE
          ? opt(id, 'saved')
          : opt(id),
      ),
    ]
    expect(pickDefaultProvider(VIDEO_BRAND_IDS.seedance, withSavedVolc)).toBe(
      VOLCENGINE,
    )
  })
})

describe('deriveSwitcherStateFromModel', () => {
  it('round-trips a Seedance reference VolcEngine id', () => {
    const model = getModelById(AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE)
    expect(
      deriveSwitcherStateFromModel({
        modelId: AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
        adapterType: model?.adapterType ?? VOLCENGINE,
      }),
    ).toEqual({
      brand: VIDEO_BRAND_IDS.seedance,
      variant: VIDEO_VARIANT_IDS.fast,
      provider: VOLCENGINE,
    })
  })

  it('returns null variant for single-variant brands', () => {
    expect(
      deriveSwitcherStateFromModel({
        modelId: AI_MODELS.KLING_V3_PRO,
        adapterType: FAL,
      }),
    ).toEqual({
      brand: VIDEO_BRAND_IDS.kling,
      variant: null,
      provider: FAL,
    })
  })

  it('returns all-null for undefined model', () => {
    expect(deriveSwitcherStateFromModel(undefined)).toEqual({
      brand: null,
      variant: null,
      provider: null,
    })
  })
})

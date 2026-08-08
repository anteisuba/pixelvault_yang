import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VIDEO_BRAND_IDS, VIDEO_VARIANT_IDS } from '@/constants/video-brands'
import {
  deriveSwitcherStateFromModel,
  pickDefaultProvider,
  resolveEffectiveVideoModelOption,
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

/**
 * ⚠ 这份夹具原本只有 2.0 的八条 —— `0fa75286` 接 Seedance 2.5 时没有扩它，于是
 * 「2.0 与 2.5 在 switcher 的 variant 轴上撞车」整整一轮没被任何测试碰到。
 * **往目录里加同系列新代次时，这里必须跟着加**，否则撞车照样是静默的。
 */
const SEEDANCE_IDS = [
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
]

const ALL_OPTIONS = [
  ...SEEDANCE_IDS.map((id) => opt(id)),
  opt(AI_MODELS.KLING_V3_PRO),
  opt(AI_MODELS.KLING_O3_PRO),
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

describe('resolveVideoModelId — Kling product-track variants', () => {
  it('resolves V3 Pro vs O3 Pro Omni by variant, with or without refs', () => {
    for (const refs of [false, true]) {
      expect(
        resolveId(VIDEO_BRAND_IDS.kling, VIDEO_VARIANT_IDS.v3, FAL, refs),
      ).toBe(AI_MODELS.KLING_V3_PRO)
      expect(
        resolveId(VIDEO_BRAND_IDS.kling, VIDEO_VARIANT_IDS.o3, FAL, refs),
      ).toBe(AI_MODELS.KLING_O3_PRO)
    }
  })
})

describe('resolveVideoModelId — single-variant brands', () => {
  it('returns the single Veo id regardless of variant/provider/refs', () => {
    for (const refs of [false, true]) {
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

describe('resolveEffectiveVideoModelOption — generate-time reference re-resolve', () => {
  function effectiveId(
    modelId: string,
    hasReferenceInputs: boolean,
    options = ALL_OPTIONS,
  ): string | null {
    const model = getModelById(modelId)
    return (
      resolveEffectiveVideoModelOption(
        { modelId, adapterType: model?.adapterType ?? FAL },
        hasReferenceInputs,
        options,
      )?.modelId ?? null
    )
  }

  it('upgrades a stale non-reference id to its _REFERENCE sibling when refs are bound', () => {
    // The exact bug: node defaulted to SEEDANCE_20_FAST, reference video +
    // character wired afterwards → must become SEEDANCE_20_FAST_REFERENCE so the
    // worker keeps video_urls instead of routing to buildSeedance20.
    expect(effectiveId(AI_MODELS.SEEDANCE_20_FAST, true)).toBe(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_20, true)).toBe(
      AI_MODELS.SEEDANCE_20_REFERENCE,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
    )
  })

  it('downgrades a reference id back to base when no refs remain (avoids requireReferenceImage throw)', () => {
    expect(effectiveId(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, false)).toBe(
      AI_MODELS.SEEDANCE_20_FAST,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_20_REFERENCE, false)).toBe(
      AI_MODELS.SEEDANCE_20,
    )
  })

  it('is idempotent when the persisted id already matches the input mode', () => {
    expect(effectiveId(AI_MODELS.SEEDANCE_20_FAST, false)).toBe(
      AI_MODELS.SEEDANCE_20_FAST,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_20_FAST_REFERENCE, true)).toBe(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
    )
  })

  it('preserves the chosen provider when flipping reference-ness', () => {
    expect(effectiveId(AI_MODELS.SEEDANCE_20_VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    )
  })

  it('never silently swaps a Seedance 2.5 selection for 2.0', () => {
    // 回归：switcher 的 variant 轴从 qualityTier 推，只编码速度档不编码代次 →
    // 2.0 与 2.5 都是 premium、撞进同一格 → pickBest 取数组第一个（2.0）。
    // 实测三种输入组合全中，用户选 2.5、提交跑 2.0，全程无提示。
    expect(effectiveId(AI_MODELS.SEEDANCE_25_VOLCENGINE, false)).toBe(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_25_VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE, false)).toBe(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
    )
  })

  it('keeps 2.0 selections on 2.0 now that 2.5 shares the variant cell', () => {
    // 对称方向：夹住型号之后，2.0 也不能被 2.5 抢走。
    expect(effectiveId(AI_MODELS.SEEDANCE_20_VOLCENGINE, false)).toBe(
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
    )
    expect(effectiveId(AI_MODELS.SEEDANCE_20_VOLCENGINE, true)).toBe(
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    )
  })

  it('returns null for Kling/Veo (no _REFERENCE sibling ids; signal at build time)', () => {
    for (const modelId of [AI_MODELS.KLING_V3_PRO, AI_MODELS.KLING_O3_PRO]) {
      const model = getModelById(modelId)
      expect(
        resolveEffectiveVideoModelOption(
          {
            modelId,
            adapterType: model?.adapterType ?? FAL,
          },
          true,
          ALL_OPTIONS,
        ),
      ).toBeNull()
    }
  })
})

describe('pickDefaultProvider', () => {
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

  it('maps Kling product tracks to v3 / o3 variants', () => {
    expect(
      deriveSwitcherStateFromModel({
        modelId: AI_MODELS.KLING_V3_PRO,
        adapterType: FAL,
      }),
    ).toEqual({
      brand: VIDEO_BRAND_IDS.kling,
      variant: VIDEO_VARIANT_IDS.v3,
      provider: FAL,
    })
    expect(
      deriveSwitcherStateFromModel({
        modelId: AI_MODELS.KLING_O3_PRO,
        adapterType: FAL,
      }),
    ).toEqual({
      brand: VIDEO_BRAND_IDS.kling,
      variant: VIDEO_VARIANT_IDS.o3,
      provider: FAL,
    })
  })

  it('returns null variant for single-variant brands (Veo)', () => {
    expect(
      deriveSwitcherStateFromModel({
        modelId: AI_MODELS.VEO_31,
        adapterType: FAL,
      }),
    ).toEqual({
      brand: VIDEO_BRAND_IDS.veo,
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

describe('pickDefaultProvider — provider-level key coverage', () => {
  it('prefers a provider-covered option over an uncovered one for the default provider', () => {
    const covered = ALL_OPTIONS.map((option) =>
      option.adapterType === VOLCENGINE
        ? { ...option, providerKeyId: 'volc-key-1' }
        : option,
    )

    expect(pickDefaultProvider(VIDEO_BRAND_IDS.seedance, covered)).toBe(
      VOLCENGINE,
    )
  })
})

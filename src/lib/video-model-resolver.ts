/**
 * Two-tier video model switcher resolver (canvas B2).
 *
 * Pure mapping between the switcher UI state — {brand, variant, provider,
 * hasReferenceInputs} — and a concrete `NodeWorkflowModelOption`.
 * - Seedance: multi-variant (standard/fast) + dual-provider + mode-by-input
 *   `_REFERENCE` sibling ids
 * - Kling: multi-variant product track (v3 / o3); reference signalled at
 *   request-build time (no separate catalog id)
 * - Veo: single catalog id
 * Reference-ness is mode-by-input: when the node has reference inputs bound,
 * the resolver picks the `_REFERENCE` model id automatically for brands that
 * ship sibling reference endpoints.
 */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  AI_MODELS,
  getModelById,
  getModelFamily,
  getModelVariant,
} from '@/constants/models'
import {
  VIDEO_BRAND_VARIANTS,
  VIDEO_VARIANT_IDS,
  type VideoVariantId,
} from '@/constants/video-brands'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'

export interface VideoSwitcherSelection {
  brand: string
  variant: VideoVariantId
  provider: AI_ADAPTER_TYPES
  hasReferenceInputs: boolean
}

export interface VideoSwitcherState {
  brand: string | null
  variant: VideoVariantId | null
  provider: AI_ADAPTER_TYPES | null
}

function optionFamily(option: NodeWorkflowModelOption): string | null {
  return getModelFamily(option.modelId)
}

/** Catalog id → switcher variant chip. */
export function getVideoVariantForModelId(
  modelId: string,
): VideoVariantId | null {
  switch (modelId) {
    case AI_MODELS.KLING_V3_PRO:
      return VIDEO_VARIANT_IDS.v3
    case AI_MODELS.KLING_O3_PRO:
      return VIDEO_VARIANT_IDS.o3
    default:
      break
  }
  const model = getModelById(modelId)
  if (!model) return null
  // Seedance speed tier: Fast = qualityTier 'standard', full Standard = 'premium'.
  return model.qualityTier === 'standard'
    ? VIDEO_VARIANT_IDS.fast
    : VIDEO_VARIANT_IDS.standard
}

function optionVariant(option: NodeWorkflowModelOption): VideoVariantId | null {
  return getVideoVariantForModelId(option.modelId)
}

function optionIsReference(option: NodeWorkflowModelOption): boolean {
  return getModelById(option.modelId)?.requiresReferenceImage === true
}

function optionAdapter(option: NodeWorkflowModelOption): AI_ADAPTER_TYPES {
  return option.adapterType as AI_ADAPTER_TYPES
}

/** saved (BYOK key) preferred over workspace, else first; null when empty. */
function pickBest(
  candidates: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  return (
    candidates.find((option) => option.sourceType === 'saved') ??
    candidates[0] ??
    null
  )
}

export function getBrandVariants(brand: string): readonly VideoVariantId[] {
  return VIDEO_BRAND_VARIANTS[brand] ?? []
}

/**
 * 2026-08-08 收敛：`getSurfacedVideoBrands` / `getBrandProviders` /
 * `isDualProviderBrand` / `getBrandKeyStatus` 已删 —— 它们服务的是那条早已不存在
 * 的 brand/variant/provider 切换栏。模型选择走 `BaseModelPickerPanel` 的三层钻取，
 * 「只露 Seedance/Kling/Veo」的白名单也随之失效（选择器本来就显示全部系列）。
 */

/**
 * A brand is runnable when any of its options is reachable with a key the user
 * already holds — either a key row bound to that exact model (`sourceType:
 * 'saved'`) or provider-level coverage (`providerKeyId`), since provider keys
 * are universal within their adapter. Matching only the former made every brand
 * the user hadn't individually keyed (Kling, Veo) look like it needed setup.
 */
function findKeyedOption(
  brandOptions: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  return (
    brandOptions.find((option) => option.sourceType === 'saved') ??
    brandOptions.find((option) => option.providerKeyId) ??
    null
  )
}

/** Default provider: one the user holds a key for, else any available, else FAL. */
export function pickDefaultProvider(
  brand: string,
  options: NodeWorkflowModelOption[],
): AI_ADAPTER_TYPES {
  const brandOptions = options.filter(
    (option) => optionFamily(option) === brand,
  )
  const keyed = findKeyedOption(brandOptions)
  if (keyed) return optionAdapter(keyed)
  const first = brandOptions[0]
  if (first) return optionAdapter(first)
  return AI_ADAPTER_TYPES.FAL
}

export function resolveVideoModelId(
  selection: VideoSwitcherSelection,
  options: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  const { brand, variant, provider, hasReferenceInputs } = selection
  const brandOptions = options.filter(
    (option) => optionFamily(option) === brand,
  )

  // Single-variant brands (Veo today): one catalog id; reference signalled at
  // request-build time, no separate _REFERENCE id and no provider split.
  if (getBrandVariants(brand).length === 0) {
    return pickBest(brandOptions)
  }

  // Multi-variant brands (Seedance speed / Kling product track): match provider
  // + variant. Reference-ness is only a discriminator when the brand ships
  // sibling `_REFERENCE` catalog ids (Seedance). Kling O3/V3 both stay
  // selectable with bound refs — they signal reference at request-build time.
  const brandHasReferenceSiblings = brandOptions.some(optionIsReference)
  const matches = brandOptions.filter((option) => {
    if (optionAdapter(option) !== provider) return false
    if (optionVariant(option) !== variant) return false
    if (
      brandHasReferenceSiblings &&
      optionIsReference(option) !== hasReferenceInputs
    ) {
      return false
    }
    return true
  })
  return pickBest(matches)
}

/**
 * Generate-time source of truth for Seedance reference-ness.
 *
 * The persisted `data.model` only captures the user's brand/variant/provider
 * choice; whether a run hits the `_REFERENCE` endpoint is mode-by-input and
 * must be derived from the ACTUAL harvested inputs at submit time — NOT from a
 * possibly-stale model id. A node can gain reference edges (character image,
 * reference video, voice) AFTER its model was first resolved, and
 * `useVideoComposer`'s autospawn effect resolves the model only once
 * (`if (data.model) return`). Without this re-resolve, a node defaulted to
 * `SEEDANCE_20_FAST` keeps that id even once references are wired, so the worker
 * routes it to `buildSeedance20` which silently drops `video_urls` /
 * `audio_urls` — the reference clip never reaches the provider.
 *
 * Returns the option whose reference-ness matches `hasReferenceInputs` for the
 * same brand/variant/provider, or null when nothing better resolves (caller
 * keeps the original model). Brands without `_REFERENCE` sibling ids
 * (Kling/Veo) leave the persisted id alone.
 */
export function resolveEffectiveVideoModelOption(
  model: { modelId: string; adapterType: string },
  hasReferenceInputs: boolean,
  options: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  const state = deriveSwitcherStateFromModel(model)
  if (!state.brand || !state.variant) return null
  // Only re-resolve when the brand ships sibling `_REFERENCE` catalog ids.
  // Kling has variants (v3/o3) but no reference siblings — leave them be.
  const brandOptions = options.filter(
    (option) => optionFamily(option) === state.brand,
  )
  if (!brandOptions.some(optionIsReference)) return null
  const provider =
    (state.provider as AI_ADAPTER_TYPES | null) ??
    pickDefaultProvider(state.brand, options)

  // ⚠ 止血（2026-08-08）：switcher 的 variant 轴是从 `qualityTier` 推的，只编码
  // 速度档（standard/fast），**不编码代次**。Seedance 2.0 与 2.5 都是 premium →
  // 撞进同一格 → `pickBest` 按数组顺序挑 → 选了 2.5 的节点在提交时被静默换成
  // 2.0（三种输入组合全中，实测）。用户看不到任何提示，付的钱和等的时间都花在
  // 另一个模型上。
  //
  // 这里先用目录的**型号键**（`MODEL_VARIANTS`，显式区分 2.0 / 2.0-fast / 2.5）
  // 把候选夹到与用户所选同一型号，再交给旧解析器挑端点。
  //
  // ⛔ 这是过渡措施，不是终局：整个「reference 靠输入自动判」的机制会在切片 4
  // 被「模式归节点」取代（见 canvas-video-domain-cleanup-2026-08-08.md §9.8），
  // 届时本函数连同 `video-brands.ts` 一起删。**别在这上面继续加东西。**
  const pickedVariant = getModelVariant(model.modelId)
  const sameVariantOptions = pickedVariant
    ? options.filter((o) => getModelVariant(o.modelId) === pickedVariant)
    : options

  return resolveVideoModelId(
    {
      brand: state.brand,
      variant: state.variant,
      provider,
      hasReferenceInputs,
    },
    sameVariantOptions,
  )
}

/** Inverse: a stored model selection → switcher display state. */
export function deriveSwitcherStateFromModel(
  model: { modelId: string; adapterType: string } | undefined,
): VideoSwitcherState {
  if (!model) return { brand: null, variant: null, provider: null }
  const brand = getModelFamily(model.modelId)
  const hasVariants = brand ? getBrandVariants(brand).length > 0 : false
  return {
    brand,
    variant: hasVariants ? getVideoVariantForModelId(model.modelId) : null,
    provider: (model.adapterType as AI_ADAPTER_TYPES) ?? null,
  }
}

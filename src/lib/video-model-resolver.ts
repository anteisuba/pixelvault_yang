/**
 * Two-tier video model switcher resolver (canvas B2).
 *
 * Pure mapping between the switcher UI state — {brand, variant, provider,
 * hasReferenceInputs} — and a concrete `NodeWorkflowModelOption`. Seedance is
 * the only multi-variant / dual-provider brand; Kling & Veo each have a single
 * catalog id (reference signalled at request-build time, no separate id).
 * Reference-ness is mode-by-input: when the node has reference inputs bound,
 * the resolver picks the `_REFERENCE` model id automatically.
 */

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getModelById, getModelFamily } from '@/constants/models'
import {
  SURFACED_VIDEO_BRANDS,
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

// Seedance speed tier: Fast = qualityTier 'standard', full Standard = 'premium'.
function optionVariant(option: NodeWorkflowModelOption): VideoVariantId | null {
  const model = getModelById(option.modelId)
  if (!model) return null
  return model.qualityTier === 'standard'
    ? VIDEO_VARIANT_IDS.fast
    : VIDEO_VARIANT_IDS.standard
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

/** Surfaced brands that actually have ≥1 available option, in surfaced order. */
export function getSurfacedVideoBrands(
  options: NodeWorkflowModelOption[],
): string[] {
  return SURFACED_VIDEO_BRANDS.filter((brand) =>
    options.some((option) => optionFamily(option) === brand),
  )
}

/** Unique providers (adapterTypes) available for a brand. */
export function getBrandProviders(
  brand: string,
  options: NodeWorkflowModelOption[],
): AI_ADAPTER_TYPES[] {
  const seen = new Set<AI_ADAPTER_TYPES>()
  for (const option of options) {
    if (optionFamily(option) === brand) {
      seen.add(optionAdapter(option))
    }
  }
  return Array.from(seen)
}

export function isDualProviderBrand(
  brand: string,
  options: NodeWorkflowModelOption[],
): boolean {
  return getBrandProviders(brand, options).length > 1
}

export interface BrandKeyStatus {
  /** True when the user has a saved (BYOK) key for this brand → runnable now. */
  ready: boolean
  /** Representative option to drive QuickSetupDialog when a key is missing. */
  setupOption: NodeWorkflowModelOption | null
  /** Saved key's label / masked value, shown next to a ready brand. */
  keyLabel?: string
}

/**
 * Per-brand key status for the model rail. There is no platform/free tier in
 * this deployment — a brand is either backed by the user's own saved key
 * ("ready") or it needs one (route the click through QuickSetupDialog, Hard
 * Rule #8), never disabled.
 */
export function getBrandKeyStatus(
  brand: string,
  options: NodeWorkflowModelOption[],
): BrandKeyStatus {
  const brandOptions = options.filter(
    (option) => optionFamily(option) === brand,
  )
  const saved = brandOptions.find((option) => option.sourceType === 'saved')
  return {
    ready: Boolean(saved),
    setupOption: pickBest(brandOptions),
    keyLabel: saved?.keyLabel ?? saved?.maskedKey,
  }
}

/** Default provider: one with a saved key, else any available, else FAL. */
export function pickDefaultProvider(
  brand: string,
  options: NodeWorkflowModelOption[],
): AI_ADAPTER_TYPES {
  const brandOptions = options.filter(
    (option) => optionFamily(option) === brand,
  )
  const saved = brandOptions.find((option) => option.sourceType === 'saved')
  if (saved) return optionAdapter(saved)
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

  // Single-variant brands (Kling / Veo): one catalog id; reference signalled at
  // request-build time, no separate _REFERENCE id and no provider split today.
  if (getBrandVariants(brand).length === 0) {
    return pickBest(brandOptions)
  }

  // Seedance: match provider + speed variant + reference-ness.
  const matches = brandOptions.filter(
    (option) =>
      optionAdapter(option) === provider &&
      optionVariant(option) === variant &&
      optionIsReference(option) === hasReferenceInputs,
  )
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
 * keeps the original model). Single-variant brands (Kling/Veo) signal reference
 * at build time and have no sibling id → returns null.
 */
export function resolveEffectiveVideoModelOption(
  model: { modelId: string; adapterType: string },
  hasReferenceInputs: boolean,
  options: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  const state = deriveSwitcherStateFromModel(model)
  if (!state.brand || !state.variant) return null
  // Single-variant brands have no separate _REFERENCE id; leave them be.
  if (getBrandVariants(state.brand).length === 0) return null
  const provider =
    (state.provider as AI_ADAPTER_TYPES | null) ??
    pickDefaultProvider(state.brand, options)
  return resolveVideoModelId(
    {
      brand: state.brand,
      variant: state.variant,
      provider,
      hasReferenceInputs,
    },
    options,
  )
}

/** Inverse: a stored model selection → switcher display state. */
export function deriveSwitcherStateFromModel(
  model: { modelId: string; adapterType: string } | undefined,
): VideoSwitcherState {
  if (!model) return { brand: null, variant: null, provider: null }
  const brand = getModelFamily(model.modelId)
  const hasVariants = brand ? getBrandVariants(brand).length > 0 : false
  const builtIn = getModelById(model.modelId)
  return {
    brand,
    variant:
      hasVariants && builtIn
        ? builtIn.qualityTier === 'standard'
          ? VIDEO_VARIANT_IDS.fast
          : VIDEO_VARIANT_IDS.standard
        : null,
    provider: (model.adapterType as AI_ADAPTER_TYPES) ?? null,
  }
}

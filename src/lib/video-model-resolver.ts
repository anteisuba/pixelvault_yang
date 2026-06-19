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

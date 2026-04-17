/**
 * Transform presets — pre-configured style transformation settings.
 *
 * Each preset is essentially a pre-built Style Card with provider binding.
 * Users can "Fork" a preset into a custom Style Card in Phase 2+.
 *
 * @see 02-功能/功能-路線決策結論書.md §6 — 6 initial presets
 * @see 02-功能/功能-實作落地清單.md §1.3 — data structure
 */

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { Preservation } from '@/types/transform'

export interface TransformPreset {
  /** Unique identifier */
  id: string
  /** Display name (English) */
  name: string
  /** i18n key under TransformPresets namespace */
  i18nKey: string
  /** Thumbnail URL for UI display */
  thumbnailUrl: string
  /** Target model ID for this style */
  modelId: string
  /** Provider adapter type */
  adapterType: AI_ADAPTER_TYPES
  /** Provider-specific advanced params */
  advancedParams: Record<string, unknown>
  /** Default preservation values for this style */
  preservationDefaults: Preservation
}

export const TRANSFORM_PRESETS = [
  {
    id: 'preset-watercolor',
    name: 'Watercolor',
    i18nKey: 'TransformPresets.watercolor',
    thumbnailUrl: '/presets/watercolor.jpg',
    modelId: 'fal-ai/flux-pro/redux',
    adapterType: 'fal' as AI_ADAPTER_TYPES,
    advancedParams: { style_strength: 0.6 },
    preservationDefaults: {
      structure: 0.7,
      text: 0.9,
      composition: 0.6,
      people: 0.7,
    },
  },
  {
    id: 'preset-oil-painting',
    name: 'Oil Painting',
    i18nKey: 'TransformPresets.oilPainting',
    thumbnailUrl: '/presets/oil-painting.jpg',
    modelId: 'fal-ai/flux-pro/redux',
    adapterType: 'fal' as AI_ADAPTER_TYPES,
    advancedParams: { style_strength: 0.7 },
    preservationDefaults: {
      structure: 0.6,
      text: 0.7,
      composition: 0.5,
      people: 0.6,
    },
  },
  {
    id: 'preset-ghibli',
    name: 'Ghibli Animation',
    i18nKey: 'TransformPresets.ghibli',
    thumbnailUrl: '/presets/ghibli.jpg',
    modelId: 'fal-ai/flux-pro/redux',
    adapterType: 'fal' as AI_ADAPTER_TYPES,
    advancedParams: { style_strength: 0.8 },
    preservationDefaults: {
      structure: 0.5,
      text: 0.6,
      composition: 0.5,
      people: 0.6,
    },
  },
  {
    id: 'preset-cyberpunk',
    name: 'Cyberpunk',
    i18nKey: 'TransformPresets.cyberpunk',
    thumbnailUrl: '/presets/cyberpunk.jpg',
    modelId: 'fal-ai/flux-pro/redux',
    adapterType: 'fal' as AI_ADAPTER_TYPES,
    advancedParams: { style_strength: 0.7 },
    preservationDefaults: {
      structure: 0.5,
      text: 0.7,
      composition: 0.5,
      people: 0.6,
    },
  },
  {
    id: 'preset-pixel',
    name: 'Pixel Art',
    i18nKey: 'TransformPresets.pixel',
    thumbnailUrl: '/presets/pixel.jpg',
    modelId: 'fal-ai/flux-pro/redux',
    adapterType: 'fal' as AI_ADAPTER_TYPES,
    advancedParams: { style_strength: 0.9 },
    preservationDefaults: {
      structure: 0.4,
      text: 0.5,
      composition: 0.4,
      people: 0.5,
    },
  },
  {
    id: 'preset-photo-realistic',
    name: 'Photo-realistic',
    i18nKey: 'TransformPresets.photoRealistic',
    thumbnailUrl: '/presets/photo-realistic.jpg',
    modelId: 'fal-ai/flux-pro/redux',
    adapterType: 'fal' as AI_ADAPTER_TYPES,
    advancedParams: { style_strength: 0.3 },
    preservationDefaults: {
      structure: 0.9,
      text: 0.95,
      composition: 0.9,
      people: 0.95,
    },
  },
] as const satisfies readonly TransformPreset[]

export type TransformPresetId = (typeof TRANSFORM_PRESETS)[number]['id']

export const getTransformPresetById = (
  id: string,
): TransformPreset | undefined =>
  TRANSFORM_PRESETS.find((preset) => preset.id === id)

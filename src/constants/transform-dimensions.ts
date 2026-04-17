/**
 * Transform dimensions — maps each transformation type to its provider config.
 *
 * Phase 1 only implements `style`. Other dimensions have status 'planned'
 * and will throw NotImplementedError at runtime until implemented.
 *
 * @see 02-功能/功能-路線決策結論書.md §5 — 5 dimension technical paths
 * @see 02-功能/功能-實作落地清單.md §1.3 — data structure
 */

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { TransformationType } from '@/types/transform'

export interface DimensionConfig {
  /** Default model ID for this dimension */
  defaultModelId: string
  /** Default provider adapter type */
  defaultAdapterType: AI_ADAPTER_TYPES
  /** Implementation status */
  status: 'implemented' | 'planned' | 'parked'
  /** Target phase for implementation */
  phase: 1 | 2 | 3 | 4
}

export const DIMENSION_PROVIDERS: Record<TransformationType, DimensionConfig> =
  {
    style: {
      defaultModelId: 'fal-ai/flux-pro/redux',
      defaultAdapterType: 'fal' as AI_ADAPTER_TYPES,
      status: 'implemented',
      phase: 1,
    },
    pose: {
      defaultModelId: 'fal-ai/flux-pro/kontext',
      defaultAdapterType: 'fal' as AI_ADAPTER_TYPES,
      status: 'planned',
      phase: 2,
    },
    background: {
      defaultModelId: 'fal-ai/sam-inpaint',
      defaultAdapterType: 'fal' as AI_ADAPTER_TYPES,
      status: 'planned',
      phase: 3,
    },
    garment: {
      defaultModelId: 'replicate/idm-vton',
      defaultAdapterType: 'replicate' as AI_ADAPTER_TYPES,
      status: 'planned',
      phase: 3,
    },
    detail: {
      defaultModelId: 'fal-ai/flux-pro/redux',
      defaultAdapterType: 'fal' as AI_ADAPTER_TYPES,
      status: 'planned',
      phase: 3,
    },
  }

export const getImplementedDimensions = (): TransformationType[] =>
  (
    Object.entries(DIMENSION_PROVIDERS) as [
      TransformationType,
      DimensionConfig,
    ][]
  )
    .filter(([, config]) => config.status === 'implemented')
    .map(([type]) => type)

export const isDimensionImplemented = (type: TransformationType): boolean =>
  DIMENSION_PROVIDERS[type].status === 'implemented'

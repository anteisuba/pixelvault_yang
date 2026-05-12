import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/** Image-to-3D models. Output is a GLB mesh stored at `modelUrl`. */
export const MODEL_3D_OPTIONS: ModelOption[] = [
  // #1 — Hunyuan3D 2.1 — high-fidelity geometry + PBR textures
  {
    id: AI_MODELS.HUNYUAN3D_2_1,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/hunyuan3d/v2',
    outputType: 'MODEL_3D',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/hunyuan3d/v2',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
  },
  // #2 — TripoSR — sub-second geometry preview (no PBR)
  {
    id: AI_MODELS.TRIPOSR,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/triposr',
    outputType: 'MODEL_3D',
    available: true,
    freeTier: true,
    officialUrl: 'https://fal.ai/models/fal-ai/triposr',
    timeoutMs: 120_000,
    qualityTier: 'standard',
    requiresReferenceImage: true,
  },
]

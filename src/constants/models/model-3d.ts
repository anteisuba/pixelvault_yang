import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/** Image-to-3D models. Output is a GLB mesh stored at `modelUrl`. */
export const MODEL_3D_OPTIONS: ModelOption[] = [
  // #1 — Rodin Gen-2.5 — Hyper3D official API, up to 5 reference images, GLB output
  // Cost varies by tier: 0.5 cr (Extreme-Low → High), 1.0 cr (Extreme-High), +1.0 cr (HighPack)
  // Requires BYOK: Hyper3D Business subscription ($120/mo)
  {
    id: AI_MODELS.RODIN_GEN_2_5,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.HYPER3D_RODIN,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HYPER3D_RODIN),
    externalModelId: 'rodin',
    outputType: 'MODEL_3D',
    available: true,
    officialUrl: 'https://developer.hyper3d.ai/docs/rodin-gen-25',
    timeoutMs: 720_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
  },
  // #2 — Hunyuan3D v3.1 Pro — highest-fidelity multi-view reconstruction
  {
    id: AI_MODELS.HUNYUAN3D_V31_PRO,
    cost: 5,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d',
    outputType: 'MODEL_3D',
    available: true,
    officialUrl:
      'https://fal.ai/docs/model-api-reference/3d-api/hunyuan-3d-v3.1-pro',
    timeoutMs: 420_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
  },
  // #3 — Hunyuan3D v3 — multi-view image-to-3D with PBR materials
  {
    id: AI_MODELS.HUNYUAN3D_V3,
    cost: 4,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/hunyuan3d-v3/image-to-3d',
    outputType: 'MODEL_3D',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d',
    timeoutMs: 360_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
  },
  // #4 — Trellis 2 — high-detail geometry/texture controls
  {
    id: AI_MODELS.TRELLIS_2,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/trellis-2',
    outputType: 'MODEL_3D',
    available: true,
    officialUrl: 'https://fal.ai/docs/model-api-reference/3d-api/trellis-2',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
  },
  // #5 — TripoSR — sub-second geometry preview (no PBR)
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
  // #6 — Hunyuan3D 2.1 — high-fidelity geometry + PBR textures (disabled)
  {
    id: AI_MODELS.HUNYUAN3D_2_1,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/hunyuan3d/v2',
    outputType: 'MODEL_3D',
    available: false,
    officialUrl: 'https://fal.ai/models/fal-ai/hunyuan3d/v2',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    requiresReferenceImage: true,
  },
]

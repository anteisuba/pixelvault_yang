import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'

/**
 * Image generation models — kept in descending preference order so the
 * model picker surfaces the strongest defaults first.
 */
export const IMAGE_MODEL_OPTIONS: ModelOption[] = [
  // ═══ Image Models (ranked by 2026 quality) ═══════════════════════

  // #1 — OpenAI current flagship image model
  {
    id: AI_MODELS.OPENAI_GPT_IMAGE_2,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.OPENAI),
    externalModelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://developers.openai.com/api/docs/models/gpt-image-2',
    qualityTier: 'premium',
    styleTag: 'general',
    maxPromptChars: 32_000,
  },
  // #2 — Advanced reasoning, up to 14 reference images
  {
    id: AI_MODELS.GEMINI_PRO_IMAGE,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-3-pro-image-preview',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://ai.google.dev/models/gemini',
    qualityTier: 'premium',
    styleTag: 'general',
    maxPromptChars: 8000,
  },
  // #3 — Top FLUX text-to-image endpoint
  {
    id: AI_MODELS.FLUX_2_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-pro',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-pro',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
    maxPromptChars: 8000,
  },
  // #4 — Cinematic FAL text-to-image endpoint
  {
    id: AI_MODELS.SEEDREAM_45,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://seed.bytedance.com/en/seedream4_5',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  // #4b — ByteDance latest lightweight model via VolcEngine direct
  {
    id: AI_MODELS.SEEDREAM_50_LITE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-5-0-260128',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1541523',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  // #4c — ByteDance mid-tier model via VolcEngine direct
  {
    id: AI_MODELS.SEEDREAM_40,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-4-0-250828',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://www.volcengine.com/docs/82379/1541523',
    qualityTier: 'standard',
    styleTag: 'artistic',
  },
  // #4d — ByteDance entry-level model via VolcEngine direct
  {
    id: AI_MODELS.SEEDREAM_30,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-3-0-t2i-250415',
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://www.volcengine.com/docs/82379/1541523',
    qualityTier: 'budget',
    styleTag: 'artistic',
  },
  // #5 — Best text/typography handling, logos, posters
  {
    id: AI_MODELS.IDEOGRAM_3,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/ideogram/v3',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://developer.ideogram.ai/ideogram-api/api-overview',
    qualityTier: 'premium',
    styleTag: 'design',
    // Ideogram V3 effective prompt ≈200 tokens / 150–160 words.
    maxPromptChars: 1000,
  },
  // #6 — Designer-focused, superior composition & realism
  {
    id: AI_MODELS.RECRAFT_V3,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/recraft/v3/text-to-image',
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://www.recraft.ai/docs/api-reference/getting-started',
    qualityTier: 'premium',
    styleTag: 'design',
    // Recraft V3 fal schema enforces maxLength = 1000 chars (API hard limit).
    maxPromptChars: 1000,
  },
  // #7 — Fast + high quality, great for high-volume generation
  {
    id: AI_MODELS.GEMINI_FLASH_IMAGE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: AI_MODELS.GEMINI_FLASH_IMAGE,
    outputType: 'IMAGE',
    available: true,
    freeTier: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    qualityTier: 'standard',
    styleTag: 'general',
    maxPromptChars: 8000,
  },
  // #8 — Developer-tier FLUX, good quality/price balance
  {
    id: AI_MODELS.FLUX_2_DEV,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2',
    qualityTier: 'standard',
    styleTag: 'photorealistic',
    supportsLora: true,
    maxPromptChars: 8000,
  },
  // #9 — Fastest FLUX, ideal for previews and iteration
  {
    id: AI_MODELS.FLUX_2_SCHNELL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux/schnell',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux/schnell',
    qualityTier: 'budget',
    styleTag: 'general',
    // fal-ai/flux/schnell is FLUX.1 schnell — T5 caps at 256 tokens ≈ 1000 chars.
    maxPromptChars: 1000,
  },
  // #9b — FLUX with LoRA support, the canonical fal-ai/flux-lora endpoint.
  // This is the path Civitai Flux.1 D LoRAs should run on; flux-2-dev
  // routes LoRAs less reliably (different inference graph).
  {
    id: AI_MODELS.FLUX_LORA,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-lora',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-lora',
    qualityTier: 'standard',
    styleTag: 'general',
    supportsLora: true,
  },
  // #9c — Illustrious XL: anime/illustration-specialized, huge LoRA ecosystem on Civitai
  {
    id: AI_MODELS.ILLUSTRIOUS_XL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.REPLICATE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.REPLICATE),
    externalModelId: 'delta-lock/noobai-xl',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://replicate.com/delta-lock/noobai-xl',
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
  },
  // #9d — Anima — DISABLED. Not integratable as a hosted path (investigated
  // 2026-05-29; do NOT retry this as an SDXL model):
  //   • Civitai "Anima" is NOT the SDXL "Anima Pencil XL" — pure name
  //     collision. It's CircleStone Labs / Comfy Org's 2B model, a derivative
  //     of NVIDIA Cosmos-Predict2-2B (a Diffusion Transformer). Text encoder
  //     Qwen-3 0.6B + Qwen-Image VAE (hence stray "Qwen" hints), but the
  //     backbone is a Cosmos DiT, not Qwen-Image's MMDiT.
  //   • Live test (fal-ai/lora + SDXL base) → HTTP 422 "incompatible LoRA
  //     checkpoint": the LoRA targets DiT modules (blocks.N.{self,cross}.attn,
  //     mlp) that don't exist in an SDXL UNet. Same root cause sinks the
  //     NoobAI / SDXL / fal-ai/qwen-image routes too.
  //   • Two hard walls: (1) NO hosted endpoint runs Cosmos-Predict2 (fal /
  //     Replicate / HF Inference — none); only local ComfyUI. (2) Non-
  //     commercial license (CircleStone + NVIDIA Open Model License) blocks a
  //     paid product even if self-hosted.
  //   ⇒ Stays available:false; the Civitai LoRA library routes Anima
  //     baseModel LoRAs to "open in Civitai". externalModelId below is a dead
  //     placeholder — there is no working endpoint to point it at.
  {
    id: AI_MODELS.ANIMA_PENCIL_XL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.REPLICATE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.REPLICATE),
    externalModelId: 'lucataco/animapencil-xl-v4', // placeholder until real endpoint
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://replicate.com/explore?query=anima',
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
  },
  // #10 — Open-source flagship, MMDiT architecture, 8B params
  {
    id: AI_MODELS.SD_35_LARGE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/stable-diffusion-v35-large',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/stable-diffusion-v35-large',
    qualityTier: 'standard',
    styleTag: 'general',
  },
  // #11 — Anime specialist, best for anime/manga art
  {
    id: AI_MODELS.ANIMAGINE_XL_4,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'cagliostrolab/animagine-xl-4.0',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://huggingface.co/cagliostrolab/animagine-xl-4.0',
    qualityTier: 'standard',
    styleTag: 'anime',
  },
  // #12 — NovelAI V4.5 Full, latest anime-focused diffusion model
  {
    id: AI_MODELS.NOVELAI_V45_FULL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-5-full',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
  // #13 — NovelAI V4.5 Curated, cleaner dataset, easier to steer
  {
    id: AI_MODELS.NOVELAI_V45_CURATED,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-5-curated',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
  // #14 — NovelAI V4 Full, previous-gen original model
  {
    id: AI_MODELS.NOVELAI_V4_FULL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-full',
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'standard',
    styleTag: 'anime',
  },
  // #15 — NovelAI V3, SDXL-based anime model
  {
    id: AI_MODELS.NOVELAI_V3,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-3',
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'budget',
    styleTag: 'anime',
    // NAI Diffusion V3 hard-truncates at 225 CLIP tokens ≈ 1000 chars.
    maxPromptChars: 1000,
  },
  // #16 — Classic open-source baseline
  {
    id: AI_MODELS.SDXL,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
    outputType: 'IMAGE',
    available: false,
    officialUrl:
      'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    qualityTier: 'budget',
    styleTag: 'general',
  },
  // #17 — Aesthetic-focused, excels at portraits and artistic compositions
  {
    id: AI_MODELS.PLAYGROUND_V25,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.HUGGINGFACE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.HUGGINGFACE),
    externalModelId: 'playgroundai/playground-v2.5-1024px-aesthetic',
    outputType: 'IMAGE',
    available: false,
    officialUrl:
      'https://huggingface.co/playgroundai/playground-v2.5-1024px-aesthetic',
    qualityTier: 'standard',
    styleTag: 'general',
  },

  // ═══ New Image Models (A2) ══════════════════════════════════════

  // Gemini 2.5 Flash Image — fast, cost-effective, text rendering
  {
    id: AI_MODELS.GEMINI_25_FLASH_IMAGE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-2.5-flash-image',
    outputType: 'IMAGE',
    available: false,
    freeTier: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    qualityTier: 'standard',
    styleTag: 'general',
    maxPromptChars: 8000,
  },

  // FLUX 2 Max — highest quality FLUX model
  {
    id: AI_MODELS.FLUX_2_MAX,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-max',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-max',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
    maxPromptChars: 8000,
  },

  // Recraft V4 Pro — design-focused, logos, vector-style
  {
    id: AI_MODELS.RECRAFT_V4_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/recraft/v4/pro/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/recraft/v4/pro/text-to-image',
    qualityTier: 'premium',
    styleTag: 'design',
    maxPromptChars: 10000,
  },

  // FLUX Kontext Pro — single reference image editing/generation
  {
    id: AI_MODELS.FLUX_KONTEXT_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-pro/kontext',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-pro/kontext',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
    requiresReferenceImage: true,
  },

  // FLUX Kontext Max — multi-reference image editing/generation
  {
    id: AI_MODELS.FLUX_KONTEXT_MAX,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-pro/kontext/max/multi',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-pro/kontext/max',
    qualityTier: 'premium',
    styleTag: 'photorealistic',
    requiresReferenceImage: true,
  },
]

import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { FEATURE_FLAGS } from '@/constants/feature-flags'
import { AI_MODELS } from '@/constants/models/enum'
import type { ModelOption } from '@/constants/models/types'
import { getRunnerCheckpointById } from '@/constants/runner-checkpoints'

/** Cold starts (scale-to-zero) can run 150s+ — give runner models a long ceiling. */
const RUNNER_TIMEOUT_MS = 600_000

/**
 * Image generation models, ordered by product recommendation. The catalog is
 * intentionally lean: one flagship plus specialized models with distinct roles.
 */
export const IMAGE_MODEL_OPTIONS: ModelOption[] = [
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
  {
    id: AI_MODELS.GEMINI_PRO_IMAGE,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    // GA id — the `-preview` variant shut down 2026-06-25. Enum value keeps
    // the old string (stable DB/i18n key); only the execution id moves.
    externalModelId: 'gemini-3-pro-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    qualityTier: 'premium',
    styleTag: 'general',
    maxPromptChars: 8000,
  },
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
  {
    // Multi-reference edit (up to 9 images) — prompt-driven transform.
    id: AI_MODELS.FLUX_2_PRO_EDIT,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2-pro/edit',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2-pro/edit',
    qualityTier: 'premium',
    styleTag: 'general',
    maxPromptChars: 8000,
    requiresReferenceImage: true,
  },
  {
    // Seedream 5.0 Pro — #8 on the Artificial Analysis text-to-image arena.
    // NOTE: this endpoint has NO `fal-ai/` prefix (same as `ideogram/v4`);
    // third-party-owned fal models are addressed by owner/model directly.
    id: AI_MODELS.SEEDREAM_50_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'bytedance/seedream/v5/pro/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://fal.ai/models/bytedance/seedream/v5/pro/text-to-image',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  {
    // Seedream 5.0 Lite — value tier; prompts can trigger a web search for
    // time-sensitive subjects. $0.035/image.
    id: AI_MODELS.SEEDREAM_50_LITE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/bytedance/seedream/v5/lite/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image',
    qualityTier: 'standard',
    styleTag: 'artistic',
  },
  {
    // VolcEngine (火山方舟) direct-API variant of Seedream 5.0 — cn region.
    // Additive alongside the fal entries above. Adapter passes externalModelId
    // through as the Ark `model` field.
    id: AI_MODELS.SEEDREAM_50_VOLCENGINE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-5-0-260128',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  {
    // Native counterpart to the fal-routed SEEDREAM_50_PRO.
    // ⚠ 2026-08-18 更正：这里原本写「fal $0.0675 贵过火山 0.30 元 (~$0.042)」——
    // **反了**。那是拿 fal 的低档位比火山的低档位，可火山 adapter 恒发 2K 档
    // 2048×2048 = 419 万像素，落在官方「> 261 万像素 = 0.60 元」的**高档位**
    // (~$0.085)，而 fal 恒发 1024² 落在 $0.0675 的低档位。**按产品实际发的尺寸，
    // 火山这条比 fal 贵。** 数字与出处见 `unit-prices.ts`（那里也是选择器第三层
    // 比价的唯一来源，别在这儿另记一份）。
    // ⚠ Separate entry, not a replacement for SEEDREAM_50_VOLCENGINE: Pro is
    // 单图生成 only (文生图 / 单张图生图 / 多参考图生图) and drops the base
    // entry's 组图生成, so neither id supersedes the other.
    id: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-5-0-pro-260628',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  {
    // Native counterpart to the fal-routed SEEDREAM_50_LITE above — fal charges
    // $0.035/image for the same model against 火山's 0.22 元 (~$0.031), and
    // 火山 also bills input images at 0 instead of fal's bundled rate.
    // ⚠ 火山's model list exposes Lite under its own dated id even though the
    // 5.0 entry notes it is "同时支持" — use the explicit lite id, not the
    // base one, or billing lands in the Pro tier.
    id: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-5-0-lite-260128',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    qualityTier: 'standard',
    styleTag: 'artistic',
  },
  {
    // ── BytePlus ModelArk (国际站, ap-southeast-1) ──────────────────
    // Same Ark image API as the 火山 entries above; the station is selected
    // purely by `providerConfig.baseUrl`, which the worker now honours. Keys
    // are NOT interchangeable with 火山 — that is why BYTEPLUS is its own
    // adapter type rather than a flag (see providers.ts "Two stations").
    //
    // ⚠ Prefix is `dola-`. Not `doubao-` (cn), not `dreamina-` (BytePlus's
    // own Seedance ids). Verified against the BytePlus Model list 2026-08-28.
    id: AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'dola-seedream-5-0-pro-260628',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1330310',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  {
    // ⚠ No vendor prefix on this one — BytePlus serves Lite as the bare
    // `seedream-5-0-lite-260128`. Only Seedream also available in eu-west-1.
    id: AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.BYTEPLUS),
    externalModelId: 'seedream-5-0-lite-260128',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://docs.byteplus.com/en/docs/ModelArk/1330310',
    qualityTier: 'standard',
    styleTag: 'artistic',
  },
  {
    // Retired 2026-07-26 — superseded by Seedream 5.0; entry kept so archived
    // generations still resolve a label. See RETIRED_MODEL_IDS.
    id: AI_MODELS.SEEDREAM_45,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image',
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://seed.bytedance.com/en/seedream4_5',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  {
    // Retired 2026-07-26 — superseded by SEEDREAM_50_VOLCENGINE.
    id: AI_MODELS.SEEDREAM_45_VOLCENGINE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.VOLCENGINE),
    externalModelId: 'doubao-seedream-4-5-251128',
    outputType: 'IMAGE',
    available: false,
    officialUrl:
      'https://console.volcengine.com/ark/region:ark+cn-beijing/model',
    qualityTier: 'premium',
    styleTag: 'artistic',
  },
  {
    id: AI_MODELS.IDEOGRAM_3,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'ideogram/v4',
    outputType: 'IMAGE',
    // Retired 2026-07-26 — outside the top 15 on blind-vote arenas and its
    // text-rendering niche is now covered by GPT Image 2 / Seedream 5.0.
    available: false,
    officialUrl: 'https://fal.ai/models/ideogram/v4',
    qualityTier: 'premium',
    styleTag: 'design',
    maxPromptChars: 1000,
  },
  {
    id: AI_MODELS.RECRAFT_V4_PRO,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    // V4.1 (2026-05-14) — direct successor to V4, same API shape. Kept in the
    // catalog because Recraft is the only vector/SVG-capable model here.
    externalModelId: 'fal-ai/recraft/v4.1/pro/text-to-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/recraft/v4.1/pro/text-to-image',
    qualityTier: 'premium',
    styleTag: 'design',
    maxPromptChars: 10_000,
  },
  {
    id: AI_MODELS.NOVELAI_V45_FULL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-4-5-full',
    outputType: 'IMAGE',
    // Restored 2026-08-24 as BYOK-only. Opus still has unlimited default-size
    // gens on V4.5; V5 is the metered successor.
    available: true,
    officialUrl: 'https://docs.novelai.net/en/image/models',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
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
  {
    id: AI_MODELS.NOVELAI_V5_FULL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-5-full',
    outputType: 'IMAGE',
    // NovelAI Diffusion V5, 2026-08-21. Same generate-image endpoint as 4.5.
    // BYOK-only: V5 is excluded from Opus unlimited and burns Anlas after
    // the usage battery. Director / Vibe Transfer are not on the launch API.
    available: true,
    officialUrl: 'https://novelai.net/v5',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
  {
    id: AI_MODELS.NOVELAI_V5_CURATED,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.NOVELAI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.NOVELAI),
    externalModelId: 'nai-diffusion-5-curated',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://novelai.net/v5',
    qualityTier: 'premium',
    styleTag: 'anime',
  },
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
  {
    id: AI_MODELS.FLUX_2_FLASH,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-2/flash',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-2/flash',
    qualityTier: 'budget',
    styleTag: 'general',
    maxPromptChars: 8000,
  },
  {
    id: AI_MODELS.GEMINI_FLASH_IMAGE,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-3.1-flash-image',
    outputType: 'IMAGE',
    available: true,
    freeTier: true,
    officialUrl:
      'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image',
    qualityTier: 'standard',
    styleTag: 'general',
    maxPromptChars: 8000,
  },
  {
    // Nano Banana 2 Lite — GA 2026-06-30. #4 on the Artificial Analysis
    // text-to-image arena while being the cheapest Gemini image tier.
    id: AI_MODELS.GEMINI_FLASH_LITE_IMAGE,
    cost: 1,
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
    externalModelId: 'gemini-3.1-flash-lite-image',
    outputType: 'IMAGE',
    available: true,
    officialUrl:
      'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image',
    qualityTier: 'budget',
    styleTag: 'general',
    maxPromptChars: 8000,
  },
  {
    id: AI_MODELS.FLUX_KONTEXT_MAX,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.FAL,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
    externalModelId: 'fal-ai/flux-pro/kontext/max/multi',
    outputType: 'IMAGE',
    available: true,
    officialUrl: 'https://fal.ai/models/fal-ai/flux-pro/kontext/max/multi',
    timeoutMs: 300_000,
    qualityTier: 'premium',
    styleTag: 'general',
    supportsLora: true,
  },
  {
    id: AI_MODELS.ANIMA_PENCIL_XL,
    cost: 2,
    adapterType: AI_ADAPTER_TYPES.REPLICATE,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.REPLICATE),
    externalModelId: 'lucataco/animapencil-xl-v4',
    outputType: 'IMAGE',
    available: false,
    officialUrl: 'https://replicate.com/explore?query=anima',
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
  },
  // ─── Comfy Runner (RunPod Serverless ComfyUI) ──────────────────────
  // Faithful Civitai-recipe clones for checkpoints hosted providers can't
  // run (community LoRA layer formats, dead/nonexistent hosted endpoints).
  // Gated behind FEATURE_FLAGS.comfyRunner — owner-only single endpoint with
  // a hard monthly budget cap (RUNNER_MONTHLY_LIMIT). See
  // docs/plans/comfy-runner-HANDOFF-2026-07.md §4.2b/§8.
  {
    id: AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.RUNNER,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNNER),
    externalModelId: getRunnerCheckpointById('waiIllustriousSDXL_v150')!.id,
    outputType: 'IMAGE',
    available: FEATURE_FLAGS.comfyRunner,
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
    timeoutMs: RUNNER_TIMEOUT_MS,
  },
  {
    id: AI_MODELS.ANIMA_PENCIL_XL_RUNNER,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.RUNNER,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNNER),
    externalModelId: getRunnerCheckpointById('animaPencilXL_v500')!.id,
    outputType: 'IMAGE',
    available: FEATURE_FLAGS.comfyRunner,
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
    timeoutMs: RUNNER_TIMEOUT_MS,
  },
  {
    id: AI_MODELS.PONY_DIFFUSION_V6,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.RUNNER,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNNER),
    externalModelId: getRunnerCheckpointById('ponyDiffusionV6XL')!.id,
    outputType: 'IMAGE',
    available: FEATURE_FLAGS.comfyRunner,
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
    timeoutMs: RUNNER_TIMEOUT_MS,
  },
  {
    id: AI_MODELS.SDXL_10_RUNNER,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.RUNNER,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNNER),
    externalModelId: getRunnerCheckpointById('sdXL_v10VAEFix')!.id,
    outputType: 'IMAGE',
    available: FEATURE_FLAGS.comfyRunner,
    qualityTier: 'standard',
    styleTag: 'general',
    supportsLora: true,
    timeoutMs: RUNNER_TIMEOUT_MS,
  },
  // v4：Anima（Cosmos-Predict2 DiT）——独立的 Qwen-Image 工作流（Worker 按 manifest
  // 的 architecture:'anima' 分派）。externalModelId 指默认 anima-base 档；配方精确
  // Anima checkpoint 走 T1 覆盖。覆盖近半热门 LoRA（baseModel "Anima"）。
  {
    id: AI_MODELS.ANIMA_DIT_RUNNER,
    cost: 3,
    adapterType: AI_ADAPTER_TYPES.RUNNER,
    providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.RUNNER),
    externalModelId: getRunnerCheckpointById('animaBase_v10')!.id,
    outputType: 'IMAGE',
    available: FEATURE_FLAGS.comfyRunner,
    qualityTier: 'standard',
    styleTag: 'anime',
    supportsLora: true,
    timeoutMs: RUNNER_TIMEOUT_MS,
  },
]

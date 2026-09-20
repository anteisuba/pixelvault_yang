import { supportsNovelAiCharacters } from '@/constants/novelai'
import 'server-only'

import {
  getCapabilityConfig,
  VOLCENGINE_TRANSPARENT_BACKGROUND,
} from '@/constants/provider-capabilities'

import { API_USAGE } from '@/constants/config'
import { getModelById, type ModelOption } from '@/constants/models'
import {
  getImageReferenceCapability,
  getReferenceCapabilityMax,
} from '@/constants/reference-image-capabilities'
import {
  AI_ADAPTER_TYPES,
  getProviderLabel,
  type ProviderConfig,
} from '@/constants/providers'
import type { GenerateRequest } from '@/types'
import {
  findActiveKeyForAdapter,
  getApiKeyValueById,
} from '@/services/apiKey.service'
import { resolveRunnerCapableModelId } from '@/services/image/runner-capability-routing.service'
import { getProviderAdapter } from '@/services/providers/registry'
import {
  fetchAsBuffer,
  generateStorageKey,
  isOwnedStorageUrl,
  uploadFromHttpToR2,
  uploadToR2,
} from '@/services/storage/r2'
import {
  assertRunnerMonthlyLimitNotExceeded,
  createGenerationJob,
  RunnerMonthlyLimitExceededError,
} from '@/services/usage.service'
import { ensureUser } from '@/services/user.service'
import { getSystemApiKey } from '@/lib/platform-keys'
import { logger } from '@/lib/logger'
import { validatePrompt } from '@/services/kernel/prompt-guard'
import { getResolvedModelOption } from '@/services/model-config.service'
import {
  GENERATION_STAGE,
  GenerationStageTimer,
} from '@/lib/generation-observability'

export interface ResolvedGenerationRoute {
  modelId: string
  externalModelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKey: string
  resolvedApiKeyId?: string | null
  isFreeGeneration?: boolean
  /** Credit cost for this generation (from model config, fallback 1) */
  creditCost: number
  /** DB-first catalog entry, including hardcoded capability fallbacks. */
  modelConfig?: ModelOption
}

type GenerateImageServiceErrorCode =
  | 'CUSTOM_MODEL_REQUIRES_ROUTE'
  | 'INVALID_API_KEY'
  | 'INVALID_JOB'
  | 'LORA_DOWNLOAD_DISABLED'
  | 'INVALID_ROUTE_SELECTION'
  | 'JOB_NOT_FOUND'
  | 'MISSING_API_KEY'
  | 'NOVELAI_TIER_LIMIT'
  | 'PLATFORM_KEY_MISSING'
  | 'PROVIDER_ERROR'
  | 'REFERENCE_IMAGE_LIMIT_EXCEEDED'
  | 'RUNNER_MONTHLY_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_MODEL'
  | 'USER_NOT_FOUND'
  | 'VALIDATION_ERROR'

export class GenerateImageServiceError extends Error {
  readonly code: GenerateImageServiceErrorCode
  readonly status: number

  constructor(
    code: GenerateImageServiceErrorCode,
    message: string,
    status: number,
  ) {
    super(message)
    this.code = code
    this.status = status
    this.name = 'GenerateImageServiceError'
  }
}

export function isGenerateImageServiceError(
  error: unknown,
): error is GenerateImageServiceError {
  return error instanceof GenerateImageServiceError
}

export async function resolveGenerationRoute(
  userId: string,
  { modelId, apiKeyId }: Pick<GenerateRequest, 'modelId' | 'apiKeyId'>,
): Promise<ResolvedGenerationRoute> {
  const builtInModel = await getResolvedModelOption(modelId)

  if (builtInModel && !builtInModel.available) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'This model is no longer available for new generations',
      400,
    )
  }

  if (apiKeyId) {
    const selectedApiKey = await getApiKeyValueById(apiKeyId, userId)

    if (!selectedApiKey) {
      logger.warn('[resolveGenerationRoute] API key not found or inactive', {
        apiKeyId,
        userId,
      })
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        'Selected API key is unavailable',
        400,
      )
    }

    // Validate adapter compatibility: the key's adapter must match the
    // model's adapter. Provider keys (Replicate, fal, etc.) are universal
    // within their adapter type — they work for any model on that platform.
    const expectedAdapter = builtInModel?.adapterType
    logger.info('[resolveGenerationRoute] Route resolution', {
      apiKeyId,
      keyAdapterType: selectedApiKey.adapterType,
      keyModelId: selectedApiKey.modelId,
      requestedModelId: modelId,
      expectedAdapter: expectedAdapter ?? 'N/A (custom model)',
    })
    if (expectedAdapter && selectedApiKey.adapterType !== expectedAdapter) {
      throw new GenerateImageServiceError(
        'INVALID_ROUTE_SELECTION',
        `API key adapter (${selectedApiKey.adapterType}) does not match model adapter (${expectedAdapter})`,
        400,
      )
    }

    return {
      modelId,
      externalModelId: builtInModel?.externalModelId ?? modelId,
      adapterType: selectedApiKey.adapterType,
      providerConfig: selectedApiKey.providerConfig,
      apiKey: selectedApiKey.keyValue,
      resolvedApiKeyId: selectedApiKey.id,
      creditCost:
        builtInModel?.cost ?? API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      modelConfig: builtInModel,
    }
  }

  if (!builtInModel) {
    throw new GenerateImageServiceError(
      'CUSTOM_MODEL_REQUIRES_ROUTE',
      'Custom models require selecting an active API key',
      400,
    )
  }

  // Comfy Runner (RunPod) has no BYOK path — it's always the platform's own
  // RUNPOD_KEY, gated by a monthly budget cap. See
  // constants/config.ts RUNNER_MONTHLY_LIMIT and services/usage.service.ts.
  if (builtInModel.adapterType === AI_ADAPTER_TYPES.RUNNER) {
    try {
      await assertRunnerMonthlyLimitNotExceeded()
    } catch (error) {
      if (error instanceof RunnerMonthlyLimitExceededError) {
        throw new GenerateImageServiceError(
          'RUNNER_MONTHLY_LIMIT_EXCEEDED',
          error.message,
          429,
        )
      }
      throw error
    }

    const platformKey = getSystemApiKey(AI_ADAPTER_TYPES.RUNNER)
    if (!platformKey) {
      throw new GenerateImageServiceError(
        'PLATFORM_KEY_MISSING',
        'Comfy Runner is not configured yet (missing RUNPOD_KEY).',
        503,
      )
    }

    return {
      modelId,
      externalModelId: builtInModel.externalModelId,
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      providerConfig: builtInModel.providerConfig,
      apiKey: platformKey,
      resolvedApiKeyId: null,
      isFreeGeneration: false,
      creditCost: builtInModel.cost,
      modelConfig: builtInModel,
    }
  }

  // Auto-find an active key for this model's adapter
  const autoKey = await findActiveKeyForAdapter(
    userId,
    builtInModel.adapterType,
  )
  if (autoKey) {
    // VolcEngine requires endpoint IDs (ep-xxx), not model names.
    // If the user's key stores an endpoint ID, use it; otherwise fall through
    // to the built-in model name (works for pay-per-use models).
    const effectiveModelId =
      autoKey.adapterType === AI_ADAPTER_TYPES.VOLCENGINE &&
      autoKey.modelId.startsWith('ep-')
        ? autoKey.modelId
        : modelId

    logger.info('[resolveGenerationRoute] Auto route resolution', {
      apiKeyId: autoKey.id,
      keyAdapterType: autoKey.adapterType,
      keyModelId: autoKey.modelId,
      requestedModelId: modelId,
      effectiveModelId,
    })

    return {
      modelId: effectiveModelId,
      externalModelId:
        effectiveModelId === modelId
          ? builtInModel.externalModelId
          : effectiveModelId,
      adapterType: autoKey.adapterType,
      providerConfig: autoKey.providerConfig,
      apiKey: autoKey.keyValue,
      resolvedApiKeyId: autoKey.id,
      creditCost: builtInModel.cost,
      modelConfig: builtInModel,
    }
  }

  throw new GenerateImageServiceError(
    'MISSING_API_KEY',
    'Please bind your own API key for this model in the API Keys settings',
    400,
  )
}

// ─── Reference image upload ──────────────────────────────────────

async function uploadSingleReferenceImageIfNeeded(params: {
  userId: string
  referenceImage: string
  timer: GenerationStageTimer
}): Promise<string> {
  const { userId, referenceImage, timer } = params

  if (isOwnedStorageUrl(referenceImage)) return referenceImage

  const refKey = generateStorageKey('IMAGE', userId)
  if (referenceImage.startsWith('data:')) {
    return timer.measure(GENERATION_STAGE.REFERENCE_UPLOAD, async () => {
      const refData = await fetchAsBuffer(referenceImage)
      return uploadToR2({
        data: refData.buffer,
        key: refKey,
        mimeType: refData.mimeType,
      })
    })
  }
  const { publicUrl } = await timer.measure(
    GENERATION_STAGE.REFERENCE_UPLOAD,
    () =>
      uploadFromHttpToR2({
        sourceUrl: referenceImage,
        key: refKey,
      }),
  )
  timer.addNote('reference_upload_streams_download_and_r2_upload')
  return publicUrl
}

export async function uploadReferenceImagesIfNeeded(params: {
  userId: string
  input: GenerateRequest
  timer: GenerationStageTimer
}): Promise<string[]> {
  const { userId, input, timer } = params
  const referenceImages =
    input.referenceImages && input.referenceImages.length > 0
      ? input.referenceImages
      : input.referenceImage
        ? [input.referenceImage]
        : []

  if (referenceImages.length === 0) return []

  return Promise.all(
    referenceImages.map((referenceImage) =>
      uploadSingleReferenceImageIfNeeded({
        userId,
        referenceImage,
        timer,
      }),
    ),
  )
}

/**
 * 遮罩同样要变成 worker 拿得到的稳定 URL —— worker 解不了 `data:`，而 DB 里也
 * 不该躺一串几十 KB 的 base64。走的是参考图那条**同一个**上传通路。
 *
 * @returns 换过遮罩地址的 advancedParams；没有遮罩时原样返回。
 */
export async function uploadInpaintMaskIfNeeded(params: {
  userId: string
  input: GenerateRequest
  timer: GenerationStageTimer
}): Promise<GenerateRequest['advancedParams']> {
  const { userId, input, timer } = params
  const mask = input.advancedParams?.inpaintMask
  if (!mask) return input.advancedParams

  const inpaintMask = await uploadSingleReferenceImageIfNeeded({
    userId,
    referenceImage: mask,
    timer,
  })
  return { ...input.advancedParams, inpaintMask }
}

// ─── Orchestrator ───────────────────────────────────────────────

/**
 * Optional injection seams for the orchestrator. Callers (tests, alternate
 * worker entry points, future cohort/A-B branches) can override individual
 * collaborators without `vi.mock`-ing the whole module. Production keeps the
 * existing behaviour because every field falls back to the real
 * implementation imported at the top of this file.
 */
export interface GenerateImageDeps {
  ensureUser?: typeof ensureUser
  validatePrompt?: typeof validatePrompt
  resolveGenerationRoute?: typeof resolveGenerationRoute
  getModelById?: typeof getModelById
  createGenerationJob?: typeof createGenerationJob
  getProviderAdapter?: typeof getProviderAdapter
}

/**
 * Auth + prompt validation + route resolution + reference-image capability
 * checks. Shared entry point ahead of the async `submitImageGeneration` path
 * (submit-image.service.ts) — kept separate from `resolveGenerationRoute` so
 * callers get identical gating to what happens inside
 * `resolveGenerationRoute`.
 */
export async function resolveImageRouteAndValidate(
  clerkId: string,
  input: GenerateRequest,
  deps: GenerateImageDeps = {},
): Promise<{
  dbUser: Awaited<ReturnType<typeof ensureUser>>
  route: ResolvedGenerationRoute
  provider: string
}> {
  const ensureUserFn = deps.ensureUser ?? ensureUser
  const validatePromptFn = deps.validatePrompt ?? validatePrompt
  const resolveRouteFn = deps.resolveGenerationRoute ?? resolveGenerationRoute
  const getModelByIdFn = deps.getModelById ?? getModelById
  const getProviderAdapterFn = deps.getProviderAdapter ?? getProviderAdapter

  const ensuredUser = await ensureUserFn(clerkId)

  const promptCheck = validatePromptFn(input.prompt)
  if (!promptCheck.valid) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      promptCheck.reason ?? 'Invalid prompt',
      400,
    )
  }

  for (const character of input.advancedParams?.novelAiLayout?.characters ??
    []) {
    const check = validatePromptFn(character.prompt)
    if (!check.valid) {
      throw new GenerateImageServiceError(
        'PROVIDER_ERROR',
        check.reason ?? 'Invalid character prompt',
        400,
      )
    }
  }

  // Capability routing (HANDOFF §4.2): a hosted model that can't load the
  // attached LoRA (known via the runner allowlist) transparently upgrades to
  // its runner-backed counterpart instead of failing with the hosted
  // provider's raw "layer not supported" error. No-op unless both the
  // upgrade target exists and is flag-enabled.
  const effectiveModelId = resolveRunnerCapableModelId(
    input.modelId,
    input.advancedParams?.loras,
  )

  const resolvedRoute = await resolveRouteFn(ensuredUser.id, {
    ...input,
    modelId: effectiveModelId,
  })

  if (
    input.advancedParams?.novelAiLayout &&
    !supportsNovelAiCharacters(effectiveModelId)
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'Character layout requires a NovelAI V5 model',
      400,
    )
  }

  const builtInModel = getModelByIdFn(effectiveModelId)
  const refCount =
    input.referenceImages?.length ?? (input.referenceImage ? 1 : 0)
  const hasReferenceImage = refCount > 0

  // 值域校验：能力表声明了候选的 select 档，客户端送来一个表外的值就在这里
  // 死掉，⛔ 不要放到 provider 去吃 400。三家共用同一份表，所以列在一起。
  if (
    resolvedRoute.adapterType === AI_ADAPTER_TYPES.OPENAI ||
    resolvedRoute.adapterType === AI_ADAPTER_TYPES.VOLCENGINE ||
    resolvedRoute.adapterType === AI_ADAPTER_TYPES.BYTEPLUS
  ) {
    const config = getCapabilityConfig(
      resolvedRoute.adapterType,
      effectiveModelId,
    )
    for (const [field, options] of [
      ['quality', config.qualityOptions],
      ['inputFidelity', config.inputFidelityOptions],
      ['background', config.backgroundOptions],
    ] as const) {
      const value = input.advancedParams?.[field]
      if (value !== undefined && !options?.includes(value)) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          `Unsupported ${field} for the selected model`,
          400,
        )
      }
    }

    // 火山 Ark 的透明底前置：「仅支持图生图场景，且只支持输入 1 张带透明通道
    // 的图片」。0 张和 ≥2 张都不成立 —— worker 侧遇到这两种情况会**不发**
    // `background`，这里再把它变成一条能读懂的错误，而不是让用户拿到一张
    // 默默不透明的图。图片格式（必须带 alpha）只有 provider 能判，交给它报。
    // https://www.volcengine.com/docs/82379/1541523
    if (
      resolvedRoute.adapterType !== AI_ADAPTER_TYPES.OPENAI &&
      input.advancedParams?.background === VOLCENGINE_TRANSPARENT_BACKGROUND &&
      refCount !== 1
    ) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'Transparent background requires exactly one reference image with an alpha channel.',
        400,
      )
    }

    // 图层拆分的前置是**另一条**：「仅支持输入单张待拆分图，传入多张报错」，
    // 且开了它之后 `image` 是必选。⚠ 文档没有写这两颗能力互斥，所以这里各判
    // 各的前置，⛔ 不自造一条「不能同时开」的规则。
    // https://www.volcengine.com/docs/82379/1541523
    const wantsLayers = input.advancedParams?.layerDecomposition === true
    if (wantsLayers && !config.capabilities.includes('layerDecomposition')) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'Unsupported layerDecomposition for the selected model',
        400,
      )
    }
    if (wantsLayers && refCount !== 1) {
      throw new GenerateImageServiceError(
        'VALIDATION_ERROR',
        'Layer decomposition requires exactly one reference image to take apart.',
        400,
      )
    }
  }
  // NovelAI 专属三颗控件的服务端闸。⚠ 这一段**不按 adapter 分支**：质量标签与
  // `Text:` 是逐模型声明的（只有 V5 两档有），所以判据只能是「能力表里这个模型
  // 声明了没有」。旧客户端把这几个键发给别的模型时必须在这里 400，⛔ 不静默丢弃
  // —— 静默丢弃会让用户拿到一张完全不带他要的文字的图却以为设置生效了。
  {
    const naiConfig = getCapabilityConfig(
      resolvedRoute.adapterType,
      effectiveModelId,
    )
    const declared = new Set(naiConfig.capabilities)
    for (const [field, options] of [
      ['qualityToggle', naiConfig.qualityToggleOptions],
      ['ucPreset', naiConfig.ucPresetOptions],
    ] as const) {
      const value = input.advancedParams?.[field]
      if (value === undefined) continue
      if (!declared.has(field) || !options?.includes(value)) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          `Unsupported ${field} for the selected model`,
          400,
        )
      }
    }
    // 遮罩重绘：要一张底图 + 一张遮罩，缺一个都不是重绘。⚠ 能力表里没声明
    // `inpaint` 就是「这个模型没有 inpaint 模型可换」（NovelAI 的 infill 是换
    // 模型换 action，不是加参数），⛔ 不能默默当普通图生图跑掉。
    if (input.advancedParams?.inpaintMask) {
      if (!declared.has('inpaint')) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          'Unsupported inpaintMask for the selected model',
          400,
        )
      }
      if (refCount !== 1) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          'Inpainting requires exactly one reference image to repaint.',
          400,
        )
      }
    }

    const textRendering = input.advancedParams?.textRendering
    if (textRendering) {
      const maxChars = naiConfig.textRenderingMaxChars
      if (!declared.has('textRendering') || !maxChars) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          'Unsupported textRendering for the selected model',
          400,
        )
      }
      if (textRendering.length > maxChars) {
        throw new GenerateImageServiceError(
          'VALIDATION_ERROR',
          `Text rendering is limited to ${maxChars} characters`,
          400,
        )
      }
    }
  }
  if (builtInModel?.requiresReferenceImage && !hasReferenceImage) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'This model requires at least one reference image',
      400,
    )
  }
  // Defence-in-depth: front-end already caps reference count via the
  // capability layer, but a stale / malicious client could still POST an
  // over-cap array. Reject before reaching the provider so users get a
  // structured error rather than a 4xx from the upstream service.
  const refCap = getReferenceCapabilityMax(
    getImageReferenceCapability(resolvedRoute.adapterType, effectiveModelId),
  )
  if (hasReferenceImage && refCap === 0) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'The selected model does not support reference images',
      400,
    )
  }
  if (refCount > refCap) {
    throw new GenerateImageServiceError(
      'REFERENCE_IMAGE_LIMIT_EXCEEDED',
      `This model accepts at most ${refCap} reference ${refCap === 1 ? 'image' : 'images'} (got ${refCount}).`,
      400,
    )
  }

  const resolvedProvider = getProviderLabel(resolvedRoute.providerConfig)
  const providerAdapter = getProviderAdapterFn(resolvedRoute.adapterType)
  if (!providerAdapter) {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      `Unsupported model: ${resolvedRoute.modelId}`,
      400,
    )
  }

  return {
    dbUser: ensuredUser,
    route: resolvedRoute,
    provider: resolvedProvider,
  }
}

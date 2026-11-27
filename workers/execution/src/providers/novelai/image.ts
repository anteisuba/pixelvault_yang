import {
  NovelAiCharacterLayoutSchema,
  NovelAiSceneTextsSchema,
  NovelAiSpecSchema,
} from '../../../../../src/types/novelai'
import {
  composeNovelAiCharacterCaption,
  composeNovelAiCharacterCaptions,
  composeNovelAiPrompt,
  composeNovelAiUndesiredContent,
  novelAiPresetFields,
  planNovelAiText,
  resolveNovelAiQualityPreset,
  resolveNovelAiUcPreset,
} from '../../../../../src/lib/novelai-compose'
import {
  resolveNovelAiPreciseReferenceBaseCaption,
  validateNovelAiPreciseReferencesForModel,
} from '../../../../../src/lib/novelai-spec'
import {
  NOVELAI_DEFAULT_UC_PRESET,
  NOVELAI_IMG2IMG_STRENGTH_RANGE,
  NOVELAI_MEDIUM_FIXED_STEPS,
  NOVELAI_SAMPLER_OPTIONS,
  getNovelAiMaxCharacters,
  getNovelAiPreciseReferenceContract,
  isNovelAiMediumModel,
  resolveNovelAiDimensions,
  resolveNovelAiInpaintModelId,
  supportsNovelAiCharacters,
} from '../../../../../src/constants/novelai'
import type {
  ExecutionEnv,
  WorkerImageGenerationResult,
  WorkerImageRunContext,
} from '../../index'
import { randomUint32 } from '../../lib/bytes'
import {
  readNumberField,
  readPositiveNumberField,
  readStringField,
} from '../../lib/fields'
import {
  getImageReferenceInputs,
  getWorkerImageOutputKey,
  readAdvancedRecord,
  readReferenceImageAsBase64,
  uploadImageBytesToKey,
} from '../../lib/image-io'
import { createProviderResponseError } from '../../lib/provider-error'
import type { SingleStepImageDriver } from '../types'
import { extractNovelAiZipImage } from './zip'

/**
 * NovelAI 出图驱动（o-worker 第 3 步搬出来的第一家）。
 * 一次请求拿回 ZIP → 拆出 PNG → 落 R2。步骤名 `generate-novelai-image` ⛔ 不能改：
 * 部署时在飞的实例按步骤名 replay。
 */

const NOVELAI_IMAGE_BASE_URL = 'https://image.novelai.net'
const JSON_CONTENT_TYPE = 'application/json'

function isNovelAiStructuredPromptModel(externalModelId: string): boolean {
  return (
    externalModelId === 'nai-diffusion-4-full' ||
    externalModelId === 'nai-diffusion-4-curated-preview' ||
    externalModelId === 'nai-diffusion-4-5-full' ||
    externalModelId === 'nai-diffusion-4-5-curated' ||
    externalModelId === 'nai-diffusion-5-full' ||
    externalModelId === 'nai-diffusion-5-full-medium' ||
    externalModelId === 'nai-diffusion-5-curated'
  )
}

/**
 * 采样器白名单。客户端送来表外的值（旧客户端、改过的请求）退回官方缺省档，
 * 与 D10 ⑤ 之前那句硬编逐字等价。
 * https://docs.novelai.net/en/image/sampling/
 */
function resolveNovelAiSampler(value: string | null | undefined): string {
  return value && (NOVELAI_SAMPLER_OPTIONS as readonly string[]).includes(value)
    ? value
    : NOVELAI_SAMPLER_OPTIONS[0]
}

function isNovelAiV5Model(externalModelId: string): boolean {
  return (
    externalModelId === 'nai-diffusion-5-full' ||
    externalModelId === 'nai-diffusion-5-full-medium' ||
    externalModelId === 'nai-diffusion-5-curated'
  )
}

export async function generateNovelAiImage(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<WorkerImageGenerationResult> {
  const referenceImages = getImageReferenceInputs(context)
  if (referenceImages.length > 1) {
    throw new Error(
      'NovelAI base canvas accepts at most one reference image; pass Precise References via advancedParams.novelAi.preciseReferences.',
    )
  }

  const advancedParams = readAdvancedRecord(context)
  const dimensions = resolveNovelAiDimensions({
    aspectRatio: context.providerInput.aspectRatio,
    novelAiWidth:
      readPositiveNumberField(advancedParams, 'novelAiWidth') ?? undefined,
    novelAiHeight:
      readPositiveNumberField(advancedParams, 'novelAiHeight') ?? undefined,
  })
  const externalModelId = context.providerInput.externalModelId
  const referenceImage = referenceImages[0]
  /**
   * 遮罩重绘。⚠ NovelAI 的 infill 是**换模型 + 换 action**，不是在原模型上加
   * 一个参数：`model` 变成 `…-inpainting`，`action` 变成 `infill`，`mask` 是一张
   * 与底图同规格的黑白图（白 = 重画）。V5 Curated 没有自己的 inpaint 模型，掉到
   * V4.5 Curated 上（`resolveNovelAiInpaintModelId`）。
   * https://docs.novelai.net/en/image/inpaint/
   */
  const maskImage = readStringField(advancedParams, 'inpaintMask')
  const inpaintModelId = maskImage
    ? resolveNovelAiInpaintModelId(externalModelId)
    : undefined
  const isInpaint = Boolean(maskImage && referenceImage && inpaintModelId)
  if (maskImage && !isInpaint) {
    throw new Error(
      'NovelAI inpainting needs one source image and a model with an inpainting counterpart.',
    )
  }
  const hasBaseCanvas = Boolean(referenceImage)
  const specResult = NovelAiSpecSchema.optional().safeParse(
    advancedParams.novelAi,
  )
  if (!specResult.success) {
    throw new Error('Invalid NovelAI specification.')
  }
  const preciseReferences = specResult.data?.preciseReferences ?? []
  const preciseValidation = validateNovelAiPreciseReferencesForModel(
    preciseReferences,
    externalModelId,
    { hasInpaintMask: isInpaint },
  )
  if (!preciseValidation.valid) {
    throw new Error(preciseValidation.reason)
  }
  const preciseContract =
    preciseReferences.length > 0
      ? getNovelAiPreciseReferenceContract(externalModelId)
      : undefined
  /**
   * 预设缺省与官方网页端一致（质量标签开 · UC Heavy），且与界面 chip 的缺省档
   * 是同一个常量 —— 请求里没写 = 界面上画着的那一档。⛔ 不再有界面看不见的
   * 静默追加（之前没写负面时会塞一串 `lowres, bad anatomy, …`）。
   * Medium Effort（蒸馏档）锁死 Heavy UC 预设且忽略自定义正/角色负面。
   */
  const isMedium = isNovelAiMediumModel(externalModelId)
  const qualityPreset = resolveNovelAiQualityPreset(
    readStringField(advancedParams, 'qualityToggle'),
  )
  const ucPreset = isMedium
    ? NOVELAI_DEFAULT_UC_PRESET
    : resolveNovelAiUcPreset(readStringField(advancedParams, 'ucPreset'))
  const negative = composeNovelAiUndesiredContent(
    isMedium ? '' : (readStringField(advancedParams, 'negativePrompt') ?? ''),
    ucPreset,
    externalModelId,
  )
  const configuredSeed = readNumberField(advancedParams, 'seed')
  const seed =
    configuredSeed != null && configuredSeed >= 0
      ? Math.round(configuredSeed)
      : randomUint32()
  const useStructuredPrompt = isNovelAiStructuredPromptModel(externalModelId)
  const useV5 = isNovelAiV5Model(externalModelId)
  const layoutResult = NovelAiCharacterLayoutSchema.optional().safeParse(
    advancedParams.novelAiLayout,
  )
  if (
    !layoutResult.success ||
    (layoutResult.data && !supportsNovelAiCharacters(externalModelId)) ||
    // ⚠ 人数上限**逐模型**不同（V5 22 / V4.5 6），schema 卡的是名册里最大的
    // 那个数，所以真上限只能在这里按型号判。
    (layoutResult.data &&
      layoutResult.data.characters.length >
        getNovelAiMaxCharacters(externalModelId))
  ) {
    throw new Error('Invalid NovelAI character layout.')
  }
  const layout = layoutResult.data
  const sceneTexts = NovelAiSceneTextsSchema.optional().safeParse(
    advancedParams.novelAiSceneTexts,
  )
  if (!sceneTexts.success) {
    throw new Error('Invalid NovelAI scene texts.')
  }
  /**
   * 台词、互动与画面文字的翻译（`src/lib/novelai-compose.ts`，服务端校验读同一份）：
   * 互动写成两边的 `source#` / `target#` / `mutual#`；台词在整体里按站位称呼 +
   * 最末 `Text:`，4 人以上说话时改写进各自的角色栏；有字时质量标签去掉 `no text`。
   */
  const textPlan = planNovelAiText({
    characters: layout?.characters ?? [],
    positioning: layout?.positioning ?? 'auto',
    sceneTexts: sceneTexts.data,
  })
  const composedPrompt = composeNovelAiPrompt(
    context.providerInput.prompt,
    qualityPreset,
    textPlan,
    externalModelId,
  )
  const captions = composeNovelAiCharacterCaptions(layout?.characters ?? [])
  const characterPrompts = (layout?.characters ?? []).map(
    (character, index) => ({
      prompt: composeNovelAiCharacterCaption(
        captions[index] ?? character.prompt,
        textPlan.characterText[index],
      ),
      uc: isMedium ? '' : character.negativePrompt,
      center: character.position,
      enabled: true,
    }),
  )
  const useCoords = layout?.positioning === 'manual'
  // 采样器：D10 ⑤ 起是真控件。⚠ 白名单之外的值一律退回官方缺省档，
  // ⛔ 不把客户端送来的任意串原样发给 provider。Medium Effort 锁死 Euler A / 14 步 / CFG Rescale 0。
  const sampler = isMedium
    ? NOVELAI_SAMPLER_OPTIONS[0]
    : resolveNovelAiSampler(readStringField(advancedParams, 'sampler'))
  /**
   * 字段对齐网页端（NAI Launcher `nai_image_request_builder.dart`，2026-10-23
   * 核对）：所有模型 `params_version` 4；预设发名字 + 编号（标签串已由我们拼好）；
   * V4+ 关 `autoSmea`、不发 `sm` / `sm_dyn`；Euler A 配 karras 时带 brownian 两项；
   * 一律要 PNG。V5 缺省 CFG 4、28 步（Medium Effort 固定 14 步）。
   */
  const parameters: Record<string, unknown> = {
    params_version: 4,
    width: dimensions.width,
    height: dimensions.height,
    scale: readNumberField(advancedParams, 'guidanceScale') ?? (useV5 ? 4 : 5),
    sampler,
    steps: isMedium
      ? NOVELAI_MEDIUM_FIXED_STEPS
      : (readPositiveNumberField(advancedParams, 'steps') ?? 28),
    n_samples: 1,
    ...novelAiPresetFields(ucPreset, qualityPreset, externalModelId),
    ...(useStructuredPrompt
      ? { autoSmea: false }
      : { sm: false, sm_dyn: false }),
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: hasBaseCanvas && useStructuredPrompt,
    cfg_rescale: isMedium
      ? 0
      : Math.min(
          1,
          Math.max(0, readNumberField(advancedParams, 'cfgRescale') ?? 0),
        ),
    noise_schedule: 'karras',
    seed,
    negative_prompt: negative,
    ...(sampler === 'k_euler_ancestral'
      ? { deliberate_euler_ancestral_bug: false, prefer_brownian: true }
      : {}),
    image_format: 'png',
    legacy_v3_extend: false,
    legacy_uc: false,
    use_coords: useCoords,
    characterPrompts,
    prompt: composedPrompt,
    reference_image_multiple: [],
    reference_information_extracted_multiple: [],
    reference_strength_multiple: [],
  }
  if (!useV5) {
    parameters.skip_cfg_above_sigma = null
  }

  if (referenceImage) {
    parameters.image = await readReferenceImageAsBase64(referenceImage)
    // 重绘强度 = NovelAI `strength` 原值（越大改得越多），⛔ 不做 1 − x。
    // https://docs.novelai.net/en/image/strengthnoise
    parameters.strength = Math.min(
      NOVELAI_IMG2IMG_STRENGTH_RANGE.max,
      Math.max(
        NOVELAI_IMG2IMG_STRENGTH_RANGE.min,
        readNumberField(advancedParams, 'img2imgStrength') ??
          NOVELAI_IMG2IMG_STRENGTH_RANGE.default,
      ),
    )
    parameters.noise = Math.min(
      1,
      Math.max(0, readNumberField(advancedParams, 'img2imgNoise') ?? 0),
    )
    parameters.color_correct = false
    // 网页端带底图时固定 seed - 1；不发的话服务端自己挑，同种子复现不出来。
    parameters.extra_noise_seed = seed > 0 ? seed - 1 : 0
  }

  if (preciseReferences.length > 0 && preciseContract) {
    // 线格式已核自 `novelai.net/image`（2026-11-26）：
    // - V4.5 & V5 共用 `director_reference_*` 数组，V5 将 `outfit` 写为 `"costume"`、
    //   `preferSameOutfit` 编入 `base_caption`（`character_mainoutfit` / `character&style_anyoutfit`）；
    // - `director_reference_secondary_strength_values`：V4.5 发 `1 - fidelity`，
    //   V5 固定发 `0`（官方客户端 `c()` 强置 `fidelity: 1`，`g()` 算出 `1 - 1 = 0`，不省略该键）。
    parameters.director_reference_images = await Promise.all(
      preciseReferences.map((ref) => readReferenceImageAsBase64(ref.url)),
    )
    parameters.normalize_reference_strength_multiple = true
    parameters.director_reference_descriptions = preciseReferences.map(
      (ref) => ({
        caption: {
          base_caption: resolveNovelAiPreciseReferenceBaseCaption(
            ref,
            preciseContract.supportsPreferSameOutfit,
          ),
          char_captions: [],
        },
        legacy_uc: false,
      }),
    )
    parameters.director_reference_information_extracted = preciseReferences.map(
      () => 1,
    )
    parameters.director_reference_strength_values = preciseReferences.map(
      (ref) =>
        Math.min(
          preciseContract.strength.max,
          Math.max(preciseContract.strength.min, ref.strength),
        ),
    )
    const fidelityRange = preciseContract.fidelity
    parameters.director_reference_secondary_strength_values = fidelityRange
      ? preciseReferences.map(
          (ref) =>
            1 -
            Math.min(
              fidelityRange.max,
              Math.max(
                fidelityRange.min,
                ref.fidelity ?? fidelityRange.default,
              ),
            ),
        )
      : preciseReferences.map(() => 0)
  }

  if (isInpaint && maskImage) {
    parameters.mask = await readReferenceImageAsBase64(maskImage)
    // 遮罩外的像素原样贴回去 —— 不设它就等于整张重画一遍，遮罩白等于没画。
    parameters.add_original_image = true
    // 遮罩内的 img2img 强度：我们没有这颗滑块（图生图的 `img2imgStrength` 不管 infill），
    // 按网页端缺省 1（= 不另带 img2img 块）。
    parameters.inpaintImg2ImgStrength = 1
  }

  if (useStructuredPrompt) {
    parameters.v4_prompt = {
      caption: {
        base_caption: composedPrompt,
        char_captions: characterPrompts.map((character) => ({
          char_caption: character.prompt,
          centers: [character.center],
        })),
      },
      use_coords: useCoords,
      use_order: true,
    }
    parameters.v4_negative_prompt = {
      caption: {
        base_caption: negative,
        char_captions: characterPrompts.map((character) => ({
          char_caption: character.uc,
          centers: [character.center],
        })),
      },
      legacy_uc: false,
    }
  }

  const response = await fetch(`${NOVELAI_IMAGE_BASE_URL}/ai/generate-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify({
      input: composedPrompt,
      model: isInpaint ? inpaintModelId : externalModelId,
      action: isInpaint ? 'infill' : hasBaseCanvas ? 'img2img' : 'generate',
      parameters,
      use_new_shared_trial: true,
    }),
  })

  if (!response.ok) {
    // 走带状态码的 provider 错误：402（Anlas 不足）归到余额不足、当场判死不重试，
    // 原话（「Required: 20, Available: 7」）留在 message 里给前端拼说明。
    throw await createProviderResponseError(response, {
      provider: 'novelai',
      phase: 'generate',
      fallbackMessage: `NovelAI image generation failed (${response.status})`,
    })
  }

  const imageBytes = await extractNovelAiZipImage(
    new Uint8Array(await response.arrayBuffer()),
  )
  const uploaded = await uploadImageBytesToKey(
    env,
    imageBytes,
    'image/png',
    getWorkerImageOutputKey(context),
  )

  // 没填种子时这颗是这里随机挑的：带回去记进作品配方，才能原样复刻（p-auto-recipe）。
  return { ...uploaded, ...dimensions, providerMetadata: { seed } }
}

export const novelAiImageDriver: SingleStepImageDriver = {
  stepName: 'generate-novelai-image',
  generate: generateNovelAiImage,
}

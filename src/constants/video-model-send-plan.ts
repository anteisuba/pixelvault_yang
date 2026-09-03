import { AI_MODELS, normalizeModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'

export type VideoReferenceMode =
  | 'text-or-first-frame'
  | 'multimodal-reference'
  | 'image-content-array'

export type VideoExecutionStatus = 'ready' | 'execution-not-migrated'

export interface VideoReferenceSlots {
  /**
   * undefined means that the provider has not published a hard numeric cap.
   * It must not be rendered as an invented product/provider limit.
   */
  images: number | undefined
  videos: number
  audio: number
  total?: number
  /** Audio references cannot be the only input for this model. */
  audioRequiresVisual?: boolean
}

export interface VideoParameterSupport {
  duration: boolean
  aspectRatio: boolean
  resolution: boolean
  negativePrompt: boolean
  generateAudio: boolean
  seed: boolean
}

export interface VideoModelSendContract {
  family:
    | 'seedance'
    | 'kling'
    | 'happyhorse'
    | 'wan'
    | 'gemini'
    | 'veo'
    | 'minimax'
    | 'fallback'
  referenceMode: VideoReferenceMode
  slots: VideoReferenceSlots
  parameters: VideoParameterSupport
  execution: VideoExecutionStatus
  /** Whether local @name tokens become provider positional @ImageN tokens. */
  positionalImageTokens: boolean
  /**
   * 带图发送时 `ratio` 被上游**钉死**成这个值；`null` = 照常发用户选的宽高比。
   *
   * ⚠ 只在「有图」的场景成立 —— 纯文生视频不受限。适配器因此要同时看这个字段和
   * content 里到底有没有图，光看模型 id 会把纯文生的比例也一起改掉。
   */
  imageAspectRatioLock: string | null
  /**
   * 「关键帧」档下有几个**具名**槽位：1 = 只有首帧，2 = 首帧 + 尾帧。
   *
   * ⚠ 这是**能力声明**，不是数量上限 —— `slots.images` 说的是「最多能塞几张」，
   * 这里说的是「这几张各自叫什么、模型认不认这个语义」。两者必须一起改：只放宽
   * images 而不声明槽位，第二张图会被当成一张无语义的参考图发出去（那正是首尾帧
   * 从未生效的原因，见 cleanup §1 第 ④⑤ 层）。
   *
   * ⚠ 判据是**我们的 worker 发得出来吗**，不是「上游支不支持」。目前只有火山
   * （volcengine）的 builder 会发 `role:'last_frame'`；fal 的 builder 里根本没有
   * 帧角色概念，minimax 只发 `first_frame`。声明得比实现宽，用户填了尾帧就会被
   * 静默丢掉 —— 正是这一轮一路在治的那类缺陷。
   */
  keyframeSlots: 1 | 2
}

const FIRST_FRAME_SLOTS: VideoReferenceSlots = {
  images: 1,
  videos: 0,
  audio: 0,
}

/** 首尾帧：首帧 + 尾帧两张，模型补中间。与「多图参考」互斥（火山明说三种场景不能混）。 */
const FIRST_LAST_FRAME_SLOTS: VideoReferenceSlots = {
  images: 2,
  videos: 0,
  audio: 0,
}

/**
 * 真正能发送首尾帧的模型。Ark 使用 `first_frame` / `last_frame` role；fal
 * Seedance 2.5 的公开 I2V schema 使用 `image_url` / `end_image_url`。2.0 fal
 * 没有尾帧字段，MiniMax 当前也只发送首帧，所以都不在表内。
 */
const FIRST_LAST_FRAME_MODEL_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_BYTEPLUS,
  AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
  AI_MODELS.SEEDANCE_25,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_BYTEPLUS,
])

/** Seedance 2.0 系列：图 0-9 + 视频 0-3 + 音频 0-3，音频必须搭配图或视频。 */
const SEEDANCE_20_REFERENCE_SLOTS: VideoReferenceSlots = {
  images: 9,
  videos: 3,
  audio: 3,
  total: 12,
  audioRequiresVisual: true,
}

/**
 * Seedance 2.5：图 30 / 视频 10 / 音频 10（官方「使用限制」段），合计 50 —— 与
 * 官方通稿「最高 50 个全模态素材参考」自洽。
 *
 * `audioRequiresVisual: false` 的依据是官方模型能力表「多模态参考 → 音频参考」
 * 那一行：2.5 打 ✓，而 2.0 / 2.0 fast / 2.0 mini 三列都写「✗（需搭配图片/视频）」。
 * 也就是说**只有 2.5 支持纯音频参考**。
 */
const SEEDANCE_25_REFERENCE_SLOTS: VideoReferenceSlots = {
  images: VIDEO_REFERENCE_LIMITS.IMAGES,
  videos: VIDEO_REFERENCE_LIMITS.VIDEOS,
  audio: VIDEO_REFERENCE_LIMITS.AUDIO,
  total: 50,
  audioRequiresVisual: false,
}

// fal's public 2.5 OpenAPI keeps the same 30/10/10/50 limits but requires
// audio to accompany at least one image or video. Ark's native line permits
// audio-only reference, so this cannot be folded into the shared contract.
const SEEDANCE_25_FAL_REFERENCE_SLOTS: VideoReferenceSlots = {
  ...SEEDANCE_25_REFERENCE_SLOTS,
  audioRequiresVisual: true,
}

const FALLBACK_CONTRACT: VideoModelSendContract = {
  family: 'fallback',
  referenceMode: 'text-or-first-frame',
  slots: FIRST_FRAME_SLOTS,
  parameters: {
    duration: true,
    aspectRatio: true,
    resolution: true,
    negativePrompt: false,
    generateAudio: false,
    seed: false,
  },
  execution: 'execution-not-migrated',
  positionalImageTokens: false,
  imageAspectRatioLock: null,
  // 兜底契约保守取 1：认不出的模型不该被当成支持首尾帧。
  keyframeSlots: 1,
}

const SEEDANCE_REFERENCE_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS,
  AI_MODELS.SEEDANCE_25_REFERENCE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
])

/**
 * 2.5 与 2.0 的多模态上限不同，必须按代分叉。
 *
 * ⚠ 这里曾有一条注释写「2.5 沿用 2.0 的 9/3/3、音频不可独存，per 火山's own
 * API doc」——**那条是错的**：它描述的其实是 2.0 的契约，被误套给了 2.5。
 * 2026-08-08 GA 当天以官方「视频生成教程」的使用限制段校准后推翻，两代的真实
 * 数字见下面两个 SLOTS 常量。合并去重会让 2.5 被 2.0 的上限卡死。
 */
/**
 * 火山对 2.5 的硬约束：**首帧 / 首尾帧 / 视频编辑 / 视频延长**这些「有图」的场景下
 * `ratio` 只接受 `adaptive`，传具体宽高比直接 400。多模态参考那一档不在此列。
 * 出处：官方「视频生成教程」使用限制段（docs.volcengine.com/docs/82379/2298881）。
 */
export const VOLCENGINE_ADAPTIVE_RATIO = 'adaptive'

const SEEDANCE_25_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_25,
  AI_MODELS.SEEDANCE_25_REFERENCE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_BYTEPLUS,
  AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
])

const SEEDANCE_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_BYTEPLUS,
  AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS,
  AI_MODELS.SEEDANCE_25,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_BYTEPLUS,
  ...SEEDANCE_REFERENCE_IDS,
])

const MINIMAX_REFERENCE_IDS = new Set<string>([
  AI_MODELS.MINIMAX_H3_REFERENCE,
  AI_MODELS.MINIMAX_H3_REFERENCE_CN,
])

const MINIMAX_IDS = new Set<string>([
  AI_MODELS.MINIMAX_H3,
  AI_MODELS.MINIMAX_H3_CN,
  ...MINIMAX_REFERENCE_IDS,
])

/**
 * Adapters the Execution Worker can actually run video on. Must stay in step
 * with `WORKER_CAPABLE_VIDEO_ADAPTERS` in generate-video.service.ts — this one
 * decides what the UI offers as sendable, that one decides what the service
 * accepts.
 * ⚠ 注释曾写「Gemini 与 VolcEngine 都不在名单里」——**VolcEngine 早就在了**
 * （见下面第四行）。今天真正不在的只有 Gemini：可选中、可配 key，但在迁完之前
 * 不呈现为可发送。
 */
const WORKER_READY_VIDEO_ADAPTERS: ReadonlySet<string> = new Set([
  AI_ADAPTER_TYPES.FAL,
  AI_ADAPTER_TYPES.MINIMAX,
  AI_ADAPTER_TYPES.MINIMAX_CN,
  AI_ADAPTER_TYPES.VOLCENGINE,
  AI_ADAPTER_TYPES.BYTEPLUS,
])

function executionStatus(
  adapterType: AI_ADAPTER_TYPES | undefined,
): VideoExecutionStatus {
  return adapterType && WORKER_READY_VIDEO_ADAPTERS.has(adapterType)
    ? 'ready'
    : 'execution-not-migrated'
}

export function getVideoModelSendContract(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): VideoModelSendContract {
  if (!modelId) return FALLBACK_CONTRACT
  const normalized = normalizeModelId(modelId)

  if (SEEDANCE_IDS.has(normalized)) {
    const referenceMode = SEEDANCE_REFERENCE_IDS.has(normalized)
    const isGen25 = SEEDANCE_25_IDS.has(normalized)
    // 首尾帧只在**关键帧档**（非参考端点）成立 —— 火山明说三种场景互斥，
    // 参考端点走的是多模态那一档，不能再谈首尾。
    const supportsFirstLast =
      !referenceMode && FIRST_LAST_FRAME_MODEL_IDS.has(normalized)
    return {
      family: 'seedance',
      referenceMode: referenceMode
        ? 'multimodal-reference'
        : 'text-or-first-frame',
      slots: referenceMode
        ? isGen25
          ? normalized === AI_MODELS.SEEDANCE_25_REFERENCE
            ? SEEDANCE_25_FAL_REFERENCE_SLOTS
            : SEEDANCE_25_REFERENCE_SLOTS
          : SEEDANCE_20_REFERENCE_SLOTS
        : supportsFirstLast
          ? FIRST_LAST_FRAME_SLOTS
          : FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: false,
        generateAudio: true,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: referenceMode,
      // 2.5 的关键帧档（首帧 / 首尾帧）带图时 `ratio` 只收 `adaptive`，传具体宽高比
      // 会 400。参考端点不在这条约束里，照常发用户选的比例。
      imageAspectRatioLock:
        isGen25 && !referenceMode ? VOLCENGINE_ADAPTIVE_RATIO : null,
      keyframeSlots: supportsFirstLast ? 2 : 1,
    }
  }

  if (MINIMAX_IDS.has(normalized)) {
    const referenceMode = MINIMAX_REFERENCE_IDS.has(normalized)
    return {
      family: 'minimax',
      referenceMode: referenceMode
        ? 'multimodal-reference'
        : 'text-or-first-frame',
      // Identical 9/3/3-capped-at-12 shape to Seedance reference, including the
      // "audio can't be the only reference" rule.
      slots: referenceMode
        ? {
            images: 9,
            videos: 3,
            audio: 3,
            total: 12,
            audioRequiresVisual: true,
          }
        : FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        // 2K is the only output H3 offers, so the picker has nothing to pick.
        resolution: false,
        negativePrompt: false,
        // Audio is inherent to H3 output, not a toggle.
        generateAudio: false,
        seed: false,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: referenceMode,
      imageAspectRatioLock: null,
      keyframeSlots: 1,
    }
  }

  if (
    normalized === AI_MODELS.KLING_V3_PRO ||
    normalized === AI_MODELS.KLING_O3_PRO
  ) {
    // O3 Omni currently shares the V3 request shape in our fal builders
    // (prompt / duration / generate_audio / start_image_url). Element & multi
    // video-reference UI for O3 is a later surface — catalog + switcher first.
    return {
      family: 'kling',
      referenceMode: 'text-or-first-frame',
      slots: FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: false,
        negativePrompt: true,
        generateAudio: true,
        seed: false,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
      imageAspectRatioLock: null,
      keyframeSlots: 1,
    }
  }

  if (normalized === AI_MODELS.HAPPYHORSE_10) {
    return {
      family: 'happyhorse',
      referenceMode: 'text-or-first-frame',
      slots: FIRST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: false,
        // HappyHorse generates synchronized native audio, but the public v1.1
        // input schema does not expose a generate_audio switch.
        generateAudio: false,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
      imageAspectRatioLock: null,
      keyframeSlots: 1,
    }
  }

  if (normalized === AI_MODELS.WAN_30) {
    return {
      family: 'wan',
      referenceMode: 'text-or-first-frame',
      // 首尾帧：fal 的 i2v schema 收 `start_image_url` + `end_image_url`，
      // worker 的 buildWan30 两个都发得出来 —— 与 Seedance 2.5 同一条路径，
      // 不是「声明得比实现宽」。
      slots: FIRST_LAST_FRAME_SLOTS,
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        // fal 的 Wan 3.0 输入 schema 里没有 negative_prompt 字段（一手 OpenAPI
        // 核过，三个端点都没有）。给了也发不出去。
        negativePrompt: false,
        generateAudio: true,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
      imageAspectRatioLock: null,
      keyframeSlots: 2,
    }
  }

  if (normalized === AI_MODELS.WAN_30_REFERENCE) {
    return {
      family: 'wan',
      referenceMode: 'multimodal-reference',
      slots: {
        images: 10,
        videos: 5,
        audio: 5,
        // ⚠ 官方没有公布跨模态合计上限（Seedance 有 12 / 50，Wan 没有）——
        // 不编一个。各模态各自有上限，合计不设。
      },
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: false,
        generateAudio: true,
        seed: true,
      },
      execution: executionStatus(adapterType),
      // ⚠ 故意 false。Wan 的位置引用语法是 `Image 1` / `Video 1` / `Audio 1`
      // （空格 + 首字母大写，fal schema 与阿里文档口径一致），而这一侧的
      // 图例走共享常量 `NODE_STUDIO_VIDEO_REFERENCE_LEGEND.imagePrefix`
      // = `@Image` —— Seedance 的语法。声明 true 会发出 Wan 不认的 token，
      // 表现是参考图静默不起作用。Wan 语法由 worker 的 buildWan30Reference
      // 自己前缀，不借用这条通道。
      positionalImageTokens: false,
      imageAspectRatioLock: null,
      keyframeSlots: 1,
    }
  }

  if (normalized === AI_MODELS.GEMINI_OMNI_FLASH) {
    return {
      family: 'gemini',
      referenceMode: 'image-content-array',
      slots: {
        // The official preview guide demonstrates multiple image references
        // but does not publish a hard maximum. Do not reuse the generic Gemini
        // image-edit cap here.
        images: undefined,
        videos: 0,
        audio: 0,
      },
      parameters: {
        duration: false,
        aspectRatio: true,
        resolution: false,
        negativePrompt: false,
        generateAudio: false,
        seed: false,
      },
      execution: 'execution-not-migrated',
      positionalImageTokens: false,
      imageAspectRatioLock: null,
      keyframeSlots: 1,
    }
  }

  if (normalized === AI_MODELS.VEO_31) {
    return {
      family: 'veo',
      referenceMode: 'image-content-array',
      slots: { images: 3, videos: 0, audio: 0 },
      parameters: {
        duration: true,
        aspectRatio: true,
        resolution: true,
        negativePrompt: true,
        generateAudio: true,
        seed: true,
      },
      execution: executionStatus(adapterType),
      positionalImageTokens: false,
      imageAspectRatioLock: null,
      keyframeSlots: 1,
    }
  }

  // A FAL adapter alone does not mean the execution worker knows how to
  // serialize an arbitrary/custom video model. Only the explicit families
  // above are safe to mark runnable.
  return FALLBACK_CONTRACT
}

export function getVideoModelImageLimit(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): number | undefined {
  if (!modelId) return undefined
  return getVideoModelSendContract(modelId, adapterType).slots.images
}

/**
 * 参数**选项**的事实源归一（账本 X4）。
 *
 * 今天这件事有两个真相：一个模型「支不支持某个参数」听
 * `getVideoModelSendContract(...).parameters`（本文件），而「有哪些档可选」听
 * `video-model-capabilities.ts` 的 `supported*`。R9「参数渲染交集不是全集，
 * 按当前模型能力契约派生」把事实源指向 send-plan —— 于是任何想按契约渲染参数的
 * 调用方都得同时 import 两个模块，还要自己记住「先问支不支持，再问有哪些档」
 * 这个顺序。谁漏了第一问，就会渲染出一颗点了不起作用的按钮（Kling V3/O3 Pro 的
 * 分辨率就是这样：能力表给了 `['1080p']`，而契约写死 `resolution: false`）。
 *
 * ⚠ 这里**不复制表**，只把两问合成一问：不支持 → 空数组（调用方据此整栏不渲染，
 * 契约 R3「组级不可用 → 整栏不渲染」）；支持 → 能力表给的档位。
 */
export function getVideoModelParameterOptions(
  modelId: string | undefined,
  adapterType?: AI_ADAPTER_TYPES,
): {
  durations: readonly number[]
  resolutions: readonly string[]
  aspectRatios: readonly string[]
} {
  const empty = { durations: [], resolutions: [], aspectRatios: [] } as const
  if (!modelId) return empty

  const { parameters } = getVideoModelSendContract(modelId, adapterType)
  const capabilities = getVideoModelCapabilities(modelId)

  return {
    durations: parameters.duration
      ? (capabilities.supportedDurations ?? [])
      : [],
    resolutions: parameters.resolution
      ? (capabilities.supportedResolutions ?? [])
      : [],
    aspectRatios: parameters.aspectRatio
      ? (capabilities.supportedAspectRatios ?? [])
      : [],
  }
}

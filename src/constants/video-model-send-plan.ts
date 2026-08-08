import { AI_MODELS, normalizeModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'

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
}

const FIRST_FRAME_SLOTS: VideoReferenceSlots = {
  images: 1,
  videos: 0,
  audio: 0,
}

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
  images: 30,
  videos: 10,
  audio: 10,
  total: 50,
  audioRequiresVisual: false,
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
}

const SEEDANCE_REFERENCE_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
])

/**
 * 2.5 与 2.0 的多模态上限不同，必须按代分叉。
 *
 * ⚠ 这里曾有一条注释写「2.5 沿用 2.0 的 9/3/3、音频不可独存，per 火山's own
 * API doc」——**那条是错的**：它描述的其实是 2.0 的契约，被误套给了 2.5。
 * 2026-08-08 GA 当天以官方「视频生成教程」的使用限制段校准后推翻，两代的真实
 * 数字见下面两个 SLOTS 常量。合并去重会让 2.5 被 2.0 的上限卡死。
 */
const SEEDANCE_25_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
])

const SEEDANCE_IDS = new Set<string>([
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
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
    return {
      family: 'seedance',
      referenceMode: referenceMode
        ? 'multimodal-reference'
        : 'text-or-first-frame',
      slots: referenceMode
        ? isGen25
          ? SEEDANCE_25_REFERENCE_SLOTS
          : SEEDANCE_20_REFERENCE_SLOTS
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

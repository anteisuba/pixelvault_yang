/**
 * 工作台快照的**按域构造**（P4-A，拍板 8）。
 *
 * ── 为什么抽出来 ────────────────────────────────────────────────────
 * 一个助手跨域（拍板 8），而**快照是这条链上唯一真正随域改变形状的东西**：
 * 服务端的每一道闸（`noSuchControl` / 档位值域 / 参考位上限）读的都是它。
 * 留在 `use-assistant-operator.ts` 里的下场是一个满是 `isImage ? … : …` 的
 * 三元式塔 —— 而那正是「图片的字段被硬塞给视频」最容易发生的形状。
 * 抽成两个纯函数之后：一个域一个构造器，两边共用的只有下面那三小段。
 *
 * ── 一条贯穿全文件的硬规矩（P1 交接的第 ② 条）────────────────────────
 * **控件不在，整个键就不给。** 填一个空值等于告诉助手「有这个框」，于是它会去
 * 写一个写不进去的字段（2026-08-22 真机实证）。拍板 19「助手只动用户看得见的
 * 旋钮」就是靠这条落地的。⛔ 别为了「形状整齐」补一个 `?? null`。
 *
 * ── 视频域的两条判据（P4-A 新增，都来自真机台账）────────────────────
 * ① **模型必须带渠道**（K-3）：同一个 Seedance 在 fal 上比 BytePlus 贵 2.2×，
 *    而助手只给 `modelId` 的话，落地那一跳会在「按偏好排序的第一条」上收敛 ——
 *    用户看到的是它换了个更贵的线路。所以视频档 `availableModels[].id` 给的是
 *    **optionId**（型号 × 渠道），标签上写清渠道与积分。
 * ② **档位全部实算**：时长 / 分辨率 / 比例逐型号有无
 *    （`getVideoModelParameterOptions`），音频槽与「能不能只挂声音」逐**线路**有无
 *    （`getVideoModelSendContract`，台账 A ②）。写死一份全集的下场是助手设了一个
 *    这条线路不支持的值，然后请求 400。
 */

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { getProviderLabel, type AI_ADAPTER_TYPES } from '@/constants/providers'
import { getCapabilityConfig } from '@/constants/provider-capabilities'
import { getModelById } from '@/constants/models'
import {
  IMAGE_BATCH_COUNTS,
  STUDIO_IMAGE_ASPECT_RATIOS,
  STUDIO_VIDEO_ASPECT_RATIOS,
} from '@/constants/studio'
import {
  getVideoModelParameterOptions,
  getVideoModelSendContract,
} from '@/constants/video-model-send-plan'
import {
  getNodeModeForModel,
  type VideoNodeMode,
} from '@/constants/video-node-modes'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { VideoAudioReference } from '@/contexts/studio-context'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'

/** 快照要的那几样表单值 —— ⚠ 只列真的用到的，别把整个 `StudioFormState` 拖进来。 */
export interface StudioOperatorSnapshotForm {
  prompt: string
  negativePrompt: string | undefined
  aspectRatio: string
  /** 图片档的清晰度（`advancedParams.resolution`）。 */
  imageResolution: string | null
  imageBatchCount: number
  videoDurationSeconds: number
  videoResolution: string | null
  videoAudioRefs: readonly VideoAudioReference[]
  /** 三态：`null` = 用户没设过。⛔ 别在调用处 `?? false`。 */
  videoSoundEnabled: boolean | null
}

export interface StudioOperatorSnapshotReferences {
  items: readonly { url: string }[]
  /** ⚠ `StudioDockPanelArea` 那条 effect 跑到之前是 `Infinity` —— 调用处已兜底。 */
  limit: number
}

/**
 * 只放**用户真能跑的**（绑了 key 或该 provider 有 active key）。
 * 推荐一个跑不了的等于把人推去配置页 —— 判据与
 * `use-studio-assistant-panel-inputs` 逐字一致。
 */
function runnable(options: readonly StudioModelOption[]): StudioModelOption[] {
  return options.filter((option) => option.keyId || option.providerKeyId)
}

function clampLabel(value: string): string {
  const max = ASSISTANT_OPERATOR_LIMITS.maxLabelChars
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value
}

function buildReferencesNode(
  references: StudioOperatorSnapshotReferences,
): AssistantOperatorSnapshot['references'] {
  return {
    items: references.items
      // ⚠ 只放 http(s)：schema 要求是合法 URL，而 blob:/data: 会让整个请求 400。
      //   参考图的既有契约本来就只收 http(s)（见 `use-image-upload`）。
      .filter((entry) => entry.url.startsWith('http'))
      .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
      .map((entry) => ({ url: entry.url })),
    limit: references.limit,
  }
}

// ─── 图片域 ─────────────────────────────────────────────────────────

export interface ImageOperatorSnapshotInput {
  form: StudioOperatorSnapshotForm
  modelOptions: readonly StudioModelOption[]
  selectedModel: StudioModelOption | undefined
  references: StudioOperatorSnapshotReferences
}

/**
 * 图片档 —— **形状与 P1/P2/P3 完全一致**（这次只是搬了个家）。
 *
 * ⚠ `availableModels` 按 `modelId` 去重：图片档的助手只挑型号，渠道由既有选路
 * 逻辑（`modelOptions` 的偏好排序）决定。⛔ 别顺手改成 optionId —— 那会让
 * `set_model` 的载荷语义在两个域之间漂，而图片档的登记簿/日志里印的是型号名。
 */
export function buildImageOperatorSnapshot({
  form,
  modelOptions,
  selectedModel,
  references,
}: ImageOperatorSnapshotInput): AssistantOperatorSnapshot {
  const availableModels = [
    ...new Map(
      runnable(modelOptions).map((option) => [
        option.modelId,
        {
          id: option.modelId,
          label: clampLabel(option.displayLabel ?? option.modelId),
        },
      ]),
    ).values(),
  ].slice(0, ASSISTANT_OPERATOR_LIMITS.maxAvailableModels)

  const resolutionOptions = selectedModel
    ? [
        ...(getCapabilityConfig(
          selectedModel.adapterType,
          selectedModel.modelId,
        )?.resolutionOptions ?? []),
      ]
    : []

  return {
    prompt: form.prompt,
    negativePrompt: form.negativePrompt ?? '',
    model: selectedModel
      ? {
          id: selectedModel.modelId,
          label: clampLabel(
            selectedModel.displayLabel ?? selectedModel.modelId,
          ),
        }
      : null,
    availableModels,
    specs: {
      aspectRatio: form.aspectRatio,
      resolution: form.imageResolution,
      aspectRatioOptions: [...STUDIO_IMAGE_ASPECT_RATIOS],
      resolutionOptions,
    },
    count: {
      value: form.imageBatchCount,
      options: [...IMAGE_BATCH_COUNTS],
    },
    references: buildReferencesNode(references),
  }
}

// ─── 视频域 ─────────────────────────────────────────────────────────

export interface VideoOperatorSnapshotInput {
  form: StudioOperatorSnapshotForm
  modelOptions: readonly StudioModelOption[]
  selectedModel: StudioModelOption | undefined
  references: StudioOperatorSnapshotReferences
  /**
   * 当前「用途」档（关键帧 / 多图参考 / 全能参考）。
   *
   * ⭐ 名单**必须按它筛**：视频选择器只列当前用途的端点
   * （`StudioPromptArea` 的 `filterVideoModelByMode`），列全集就等于让助手选一个
   * 用户在界面上根本点不到的模型 —— 拍板 19 的反面。
   */
  videoMode: VideoNodeMode
}

/**
 * 视频档一行模型长什么样：`型号 · 渠道 · N 积分`。
 *
 * ⭐ **渠道必须印出来**（K-3）：同一个型号在不同渠道上价钱差一倍多，而助手看不见
 * 价目表；把渠道与积分写进标签是让它有据可依的最省事办法（这两样界面上也都有）。
 */
function describeVideoOption(option: StudioModelOption): string {
  const name = option.displayLabel ?? option.modelId
  const channel = getProviderLabel(option.providerConfig)
  return clampLabel(`${name} · ${channel} · ${option.requestCount} credits`)
}

export function buildVideoOperatorSnapshot({
  form,
  modelOptions,
  selectedModel,
  references,
  videoMode,
}: VideoOperatorSnapshotInput): AssistantOperatorSnapshot {
  /**
   * ⚠ **不按 modelId 去重**：一个型号在几条渠道上就是几行，那正是这一档要给的
   * 信息。⛔ 去重就等于把渠道选择又交回给「排序里的第一条」。
   */
  const availableModels = runnable(modelOptions)
    .filter(
      (option) =>
        getNodeModeForModel(
          option.modelId,
          option.adapterType as AI_ADAPTER_TYPES,
        ) === videoMode,
    )
    .map((option) => ({
      id: option.optionId,
      label: describeVideoOption(option),
    }))
    .slice(0, ASSISTANT_OPERATOR_LIMITS.maxAvailableModels)

  const params = getVideoModelParameterOptions(
    selectedModel?.modelId,
    selectedModel?.adapterType as AI_ADAPTER_TYPES | undefined,
  )
  // 目录里可能声明了我们不提供的比例 —— 与 `StudioVideoSpecPopover` 同一道过滤。
  const aspectRatioOptions = params.aspectRatios.filter((ratio) =>
    (STUDIO_VIDEO_ASPECT_RATIOS as readonly string[]).includes(ratio),
  )
  const hasAnySpecOption =
    params.durations.length > 0 ||
    aspectRatioOptions.length > 0 ||
    params.resolutions.length > 0

  const contract = selectedModel
    ? getVideoModelSendContract(
        selectedModel.modelId,
        selectedModel.adapterType as AI_ADAPTER_TYPES,
      )
    : null

  /**
   * 出声开关的三态（台账 A「顺带」）。
   * ⚠ `effective` 与界面上那颗 Switch 显示的值**逐字同源**：用户设过就用他的，
   *   没设过用模型目录默认（多数是开）。两处算法分叉的表现是「开关是开的，
   *   助手却以为它关着」。
   */
  const supportsSound = Boolean(contract?.parameters.generateAudio)
  const soundEffective =
    form.videoSoundEnabled ??
    (selectedModel
      ? (getModelById(selectedModel.modelId)?.videoDefaults?.generateAudio ??
        true)
      : true)

  const audioSlots = contract?.slots.audio ?? 0

  return {
    prompt: form.prompt,
    // 视频档**有**负面框（参数栏那条折叠行图片/视频共用，值落 `negativePrompt`）。
    negativePrompt: form.negativePrompt ?? '',
    model: selectedModel
      ? {
          id: selectedModel.optionId,
          label: describeVideoOption(selectedModel),
        }
      : null,
    availableModels,
    // ⛔ 视频档**没有** `specs` / `count` 这两节：前者形状不同（走 `videoSpecs`），
    //    后者是图片概念（视频恒单条）。缺席即拒，那正是它们该有的行为。
    ...(hasAnySpecOption || selectedModel
      ? {
          videoSpecs: {
            durationSeconds: params.durations.includes(
              form.videoDurationSeconds,
            )
              ? form.videoDurationSeconds
              : null,
            aspectRatio: aspectRatioOptions.includes(form.aspectRatio)
              ? form.aspectRatio
              : null,
            resolution:
              form.videoResolution &&
              params.resolutions.includes(form.videoResolution)
                ? form.videoResolution
                : null,
            durationOptions: [...params.durations].slice(
              0,
              ASSISTANT_OPERATOR_LIMITS.maxSpecOptions,
            ),
            aspectRatioOptions: aspectRatioOptions.slice(
              0,
              ASSISTANT_OPERATOR_LIMITS.maxSpecOptions,
            ),
            resolutionOptions: [...params.resolutions].slice(
              0,
              ASSISTANT_OPERATOR_LIMITS.maxSpecOptions,
            ),
          },
        }
      : {}),
    references: buildReferencesNode(references),
    // ⚠ 槽位为 0（这条线路不吃音频参考）时整节缺席 —— 与界面上那句
    //   「这个模型不支持」对应，助手因此连试都不会试。
    ...(audioSlots > 0
      ? {
          audioReferences: {
            items: form.videoAudioRefs
              .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
              .map((ref) => ({
                url: ref.url,
                ...(ref.fileName ? { label: clampLabel(ref.fileName) } : {}),
                ...(ref.ownerName
                  ? { ownerName: clampLabel(ref.ownerName) }
                  : {}),
              })),
            limit: audioSlots,
            requiresVisual: Boolean(contract?.slots.audioRequiresVisual),
          },
        }
      : {}),
    ...(supportsSound
      ? { sound: { value: form.videoSoundEnabled, effective: soundEffective } }
      : {}),
  }
}

// ─── LoRA 装配台（P4-C）─────────────────────────────────────────────

export interface LoraOperatorSnapshotInput {
  prompt: string
  /** `undefined` = 没有负面框。装配台有（可折叠那一格），所以正常总是给。 */
  negativePrompt: string | undefined
  /** 底模。`null` = 还没选。 */
  base: { id: string; label: string } | null
  /** 能切到哪些底模（界面上那颗 `LoraBaseModelModal` 里列的那些）。 */
  availableBases: readonly { id: string; label: string }[]
  /** 当前底模的家族（`sdxl` / `anima-dit` / `flux`…）。 */
  baseFamily: string | null
  /** 装配台上挂着的那些（含启停与兼容判定）。 */
  loras: readonly {
    id: string
    name: string
    weight: number
    enabled: boolean
    family: string | null
    compatible: boolean
  }[]
  references: StudioOperatorSnapshotReferences
  /** 权重值域 —— 与 `[[lora]]` 推荐块共用那一对数，⛔ 别在调用处抄一份。 */
  minWeight: number
  maxWeight: number
}

/**
 * LoRA 装配台档。
 *
 * ── 缺的那三节都是**真的没有那个控件**（拍板 19）────────────────────
 *  · **没有 `specs`**：装配台有比例却没有清晰度，而 `set_specs` 的两个字段都是
 *    必填（台账 AE/BG/BS）。给一个只填得出一半的 specs 节，等于摆一条永远无解的
 *    工具（2026-08-30「三连红而表单没动」那个形状）。比例这颗旋钮因此在本片
 *    够不着 —— 补它是独立一件，见 `ASSISTANT_OPERATOR_TOOLS_BY_DOMAIN` 里的注释。
 *  · **没有 `count`**：装配台是单次出图，界面上压根没有张数控件。
 *  · **没有 `videoSpecs` / `audioReferences` / `sound`**：那是视频档的东西。
 *
 * ⚠ `references` 照给：装配台**有**参考图卡（逐底模按能力开关，`maxImages` 为 0
 * 时就是这个底模不吃参考图）—— 上限由宿主算好传进来，与工作台那条同一个口径。
 */
export function buildLoraOperatorSnapshot({
  prompt,
  negativePrompt,
  base,
  availableBases,
  baseFamily,
  loras,
  references,
  minWeight,
  maxWeight,
}: LoraOperatorSnapshotInput): AssistantOperatorSnapshot {
  return {
    prompt,
    negativePrompt: negativePrompt ?? '',
    model: base
      ? { id: base.id, label: clampLabel(base.label) }
      : /**
         * ⚠ `null` 而不是缺席：装配台**有**底模选择器，只是还没选 —— 那两件事
         * 在协议里是不同的档（缺席 = 这个工作台不选模型）。
         */
        null,
    availableModels: availableBases
      .slice(0, ASSISTANT_OPERATOR_LIMITS.maxAvailableModels)
      .map((option) => ({ id: option.id, label: clampLabel(option.label) })),
    references: buildReferencesNode(references),
    loras: {
      items: loras
        .slice(0, ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences)
        .map((item) => ({
          id: item.id,
          name: clampLabel(item.name),
          weight: item.weight,
          enabled: item.enabled,
          family: item.family,
          compatible: item.compatible,
        })),
      baseFamily,
      minWeight,
      maxWeight,
    },
  }
}

/**
 * Unified reference-image capability layer for image + video surfaces.
 *
 * Wraps the existing provider-capabilities (image) and video-model-capabilities
 * (video) getters into a single discriminated union so studio code can ask
 * "what reference images does this model accept?" without branching on surface.
 *
 * ⚠ 这里**不管首尾帧**。曾经预留过一个 `slotted` 变体（"Step 3"）说要用来表达首尾帧，
 * 但它零个模型声明、唯一用例在测试里，躺了很久没人接。首尾帧最终落在发送契约上
 * （`constants/video-model-send-plan.ts` 的 `keyframeSlots`）+ 适配器里的
 * `role: 'first_frame' | 'last_frame'`，2026-08-08 补首尾帧时把这里的死变体删了 ——
 * 同一件事留两套并行概念，比没有更糟。
 */

import { AI_MODELS } from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  FAL_KLING_V3_MAX_REFERENCE_IMAGES,
  getMaxReferenceImages,
  getReferenceImageMode,
  type ReferenceImageMode,
} from '@/constants/provider-capabilities'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'

/**
 * Semantic role a reference image plays for a model.
 *
 * - 'general': model uses the image as a generic style/content reference.
 * - 'subject' / 'style': reserved for multi-role models (Kontext-style
 *   subject + scene compositing). Not emitted in Step 1.
 *
 * ⚠ 曾经还有 'first_frame' / 'last_frame' / 'mask' 三个值，一个都没被发出过 ——
 * 首尾帧的家在 `video-model-send-plan.ts`，见文件头。
 */
export type ReferenceSlotRole = 'general' | 'subject' | 'style'

/**
 * What a model accepts as reference input.
 *
 * - 'none': model doesn't take reference images (UI hides the chip).
 * - 'flexible': 0..max images, all sharing one default role.
 */
export type ReferenceImageCapability =
  | { kind: 'none' }
  | {
      kind: 'flexible'
      min: number
      max: number
      defaultRole: ReferenceSlotRole
      mode: ReferenceImageMode
    }

export type ReferenceImageSurface = 'image' | 'video'

/** Image surface: thin wrapper over provider-capabilities getters. */
export function getImageReferenceCapability(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): ReferenceImageCapability {
  const max = getMaxReferenceImages(adapterType, modelId)
  if (max <= 0) return { kind: 'none' }
  return {
    kind: 'flexible',
    min: 0,
    max,
    defaultRole: 'general',
    mode: getReferenceImageMode(adapterType, modelId),
  }
}

/**
 * Per-model overrides for the video surface.
 *
 * Most video models accept a single i2v "starting frame", so the default of
 * `{max: 1}` is right for them. Models listed here have richer endpoints that
 * really do accept more - the previous code wrapped a single image in `[x]`,
 * hiding the underlying capability.
 */
const VIDEO_MODEL_REFERENCE_OVERRIDES: Partial<
  Record<string, ReferenceImageCapability>
> = {
  // fal-ai/kling-video/v3/pro/image-to-video takes one start image plus an
  // optional element image set with `reference_image_urls` capped at 1-3.
  [AI_MODELS.KLING_V3_PRO]: {
    kind: 'flexible',
    min: 0,
    max: FAL_KLING_V3_MAX_REFERENCE_IMAGES,
    defaultRole: 'subject',
    mode: 'native',
  },
  // O3 Pro i2v: same start_image_url shape as V3 in our builder; cap mirrors V3
  // until we wire o3-specific element/video reference slots.
  [AI_MODELS.KLING_O3_PRO]: {
    kind: 'flexible',
    min: 0,
    max: FAL_KLING_V3_MAX_REFERENCE_IMAGES,
    defaultRole: 'subject',
    mode: 'native',
  },
  // fal-ai/veo3.1/reference-to-video already posts `image_urls: string[]`.
  // Google's Veo 3.1 reference-to-video docs cap subject/scene references at
  // 3 images, so 3 is the right ceiling to expose to users.
  [AI_MODELS.VEO_31]: {
    kind: 'flexible',
    min: 0,
    max: 3,
    defaultRole: 'subject',
    mode: 'native',
  },
  // Wan 3.0 i2v takes `start_image_url` + optional `end_image_url` —— 两张，
  // 且第二张有语义（尾帧），不是「再来一张参考图」。不给 override 的话默认
  // `{max: 1}` 会把尾帧在 UI 层就掐掉，用户填了也送不出去。
  // ⚠ `defaultRole` 只有 general / subject / style 三个值 —— 这里**没有**
  // 「首帧 / 尾帧」这种语义（`NODE_STUDIO_REFERENCE_ROLE_LEGEND_LABELS` 里那套
  // frameStart/frameEnd 是画布图例的另一套字符串，不是这个类型）。两张图的
  // 首尾语义由**位置**承载（[0] 首帧、[1] 尾帧，见 buildWan30），不由 role。
  [AI_MODELS.WAN_30]: {
    kind: 'flexible',
    min: 0,
    max: 2,
    defaultRole: 'general',
    mode: 'native',
  },
  // 参考端点：`reference_image_urls` 收 10 张（fal OpenAPI maxItems）。
  [AI_MODELS.WAN_30_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 10,
    defaultRole: 'subject',
    mode: 'native',
  },
  // Seedance 2.0 reference-to-video accepts up to 9 reference images per the
  // fal docs. The default `{max: 1}` previously truncated the upstream image
  // harvest at one frame, surfacing as "3/1 refs" in the inspector.
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  // VolcEngine (火山方舟) reference variants mirror the fal counterparts above.
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  // Seedance 2.5：图片上限 30（官方「使用限制」段：「seedance 2.5 多模态参考生
  // 视频：1~30 张」，2.0 系列才是 1~9）。
  //
  // ⚠ 这里曾写「keeps the 2.0 reference shape」并跟着设 max: 9 —— 那是把 2.0 的
  // 契约误套给了 2.5，与 video-model-send-plan.ts 里同源的那条错误注释是同一份
  // 拷贝，2026-08-08 GA 时一并纠正。两处的图片上限必须同步：这张表卡的是上传
  // 数量，那边卡的是发送契约，只改一处会让 UI 与请求对不上。
  //
  // ⚠ 未决：2.5 支持**纯音频参考**（audioRequiresVisual: false），严格说图片
  // 可以是 0 张，故 min 理应为 0、models/video.ts 的 requiresReferenceImage 理应
  // 为 false。两者都还没动 —— 纯音频参考需要 UI 先支持「不传图只传音频」，不是
  // 改个数字的事。见 docs/plans/seedance-25-ga-integration-2026-08.md §3.3。
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: {
    kind: 'flexible',
    min: 1,
    max: 30,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_25_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 30,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: {
    kind: 'flexible',
    min: 1,
    max: 30,
    defaultRole: 'subject',
    mode: 'native',
  },
  // MiniMax H3 reference face — same 9-image ceiling as Seedance. The 12-file
  // total shared with motion videos and voice clips is enforced adapter-side,
  // since this table only counts images.
  [AI_MODELS.MINIMAX_H3_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
}

/**
 * Video surface: most models take one i2v reference frame. Per-model overrides
 * (see VIDEO_MODEL_REFERENCE_OVERRIDES) expose richer endpoints - Veo 3.1
 * accepts up to 3 subject references, etc.
 */
export function getVideoReferenceCapability(
  modelId: string,
): ReferenceImageCapability {
  const override = VIDEO_MODEL_REFERENCE_OVERRIDES[modelId]
  if (override) return override
  const caps = getVideoModelCapabilities(modelId)
  return {
    kind: 'flexible',
    min: caps.requiresReferenceImage ? 1 : 0,
    max: 1,
    defaultRole: 'general',
    mode: 'native',
  }
}

/** Unified accessor for studio code regardless of surface. */
export function getReferenceCapability(
  surface: ReferenceImageSurface,
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): ReferenceImageCapability {
  if (surface === 'video') {
    // Video surface needs a model to say anything useful; fail closed.
    if (!modelId) return { kind: 'none' }
    return getVideoReferenceCapability(modelId)
  }
  return getImageReferenceCapability(adapterType, modelId)
}

/** Numeric max regardless of capability shape. */
export function getReferenceCapabilityMax(
  cap: ReferenceImageCapability,
): number {
  switch (cap.kind) {
    case 'none':
      return 0
    case 'flexible':
      return cap.max
  }
}

/** Whether at least one reference image is required to generate. */
export function isReferenceImageRequired(
  cap: ReferenceImageCapability,
): boolean {
  switch (cap.kind) {
    case 'none':
      return false
    case 'flexible':
      return cap.min > 0
  }
}

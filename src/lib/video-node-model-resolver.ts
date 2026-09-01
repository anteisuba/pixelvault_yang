/**
 * 视频节点「实际会跑哪个模型」的**唯一**答案。
 *
 * 取代 `lib/video-model-resolver.ts` + `constants/video-brands.ts` 那套
 * brand → variant → provider 的旧分类（owner 2026-08-08 拍板收敛，见
 * `docs/references/pages/canvas-video-card.md` §6.1）。两者的
 * 根本差别只有一条：
 *
 * | | 旧 | 新 |
 * | --- | --- | --- |
 * | 端点怎么定 | **按输入自动判**（有参考就换 `_REFERENCE` 那条） | **按节点上的模式**（用户显式选的） |
 *
 * 「按输入自动判」在有了显式模式之后就是错的：用户选了「关键帧」，接一段视频进来
 * 不该把他偷偷换到全能参考的端点上。反过来也一样。
 *
 * 旧分类另有一个致命缺陷（已修，见 `be236178`）：它的 variant 轴从 `qualityTier`
 * 推，只编码速度档不编码代次，于是 Seedance 2.0 与 2.5 撞进同一格。这里用的是
 * `MODEL_VARIANTS`（显式登记的型号键），结构上不会再撞 —— 唯一性由
 * `constants/models/model-variants.test.ts` 的不变量钉着。
 */

import { getModelVariant } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getModelsForNodeMode,
  resolveVideoModelId,
  type VideoNodeMode,
} from '@/constants/video-node-modes'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

/** saved（自带 key）优先，其次 provider 级覆盖，再次第一条；空则 null。 */
function pickBest(
  candidates: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  return (
    candidates.find((option) => option.sourceType === 'saved') ??
    candidates.find((option) => option.providerKeyId) ??
    candidates[0] ??
    null
  )
}

/**
 * 型号 × 渠道 × 模式 → 用户清单里的那一条。
 *
 * 目录侧的解析（`resolveVideoModelId`）保证 (型号 × 渠道 × 模式) 唯一定位一个
 * `AI_MODELS`；这里再把它落到**用户的选项清单**上，好带上 optionId 与 apiKeyId。
 * 目录里有、但用户清单里没有（例如该渠道尚未接入）时返回 null。
 */
function findInOptions(
  variant: string,
  adapterType: AI_ADAPTER_TYPES,
  mode: VideoNodeMode,
  options: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  const target = resolveVideoModelId(variant, adapterType, mode)
  if (!target) return null
  return options.find((option) => option.modelId === target) ?? null
}

/**
 * 提交/预览时实际会跑的那一条。
 *
 * 用户选的是「型号 + 渠道」，端点由**模式**挑：同一个 `seedance-2.5` 在关键帧档下
 * 是 `seedance-2.5-volcengine`，在全能参考档下是 `seedance-2.5-reference-volcengine`。
 * 这正是「用户只看见 Seedance 2.5、reference 这个词不出现在 UI 里」得以成立的那一步。
 *
 * ⚠ **解析不到时返回 null，调用方保留原选择**，绝不回退到别的端点 —— 回退意味着
 * 用户以为在用全能参考、实际发的是首帧请求（旧实现就是这么把 2.5 换成 2.0 的）。
 */
export function resolveVideoModelForMode(
  model: NodeWorkflowModelSelection | undefined,
  mode: VideoNodeMode,
  options: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  if (!model) return null
  const variant = getModelVariant(model.modelId)
  if (!variant) return null
  return findInOptions(variant, model.adapterType, mode, options)
}

/**
 * 新建（autospawn）视频节点时挑一个能跑的模型。
 *
 * 先按项目默认型号找；找不到就回落到 `DEFAULT_VIDEO_VARIANT`；再找不到就在该模式
 * 下随便挑一条用户能跑的 —— **一个新生成的节点必须带一个能跑的模型**，哪怕默认档
 * 在这个模式下无解。
 */
export function pickDefaultVideoModel(
  variant: string,
  mode: VideoNodeMode,
  options: NodeWorkflowModelOption[],
): NodeWorkflowModelOption | null {
  // 该型号在这个模式下的所有渠道，按「用户能不能跑」排序后取最优。
  const byVariant = options.filter(
    (option) => getModelVariant(option.modelId) === variant,
  )
  const inMode = byVariant.filter((option) =>
    Boolean(
      findInOptions(
        variant,
        option.adapterType as AI_ADAPTER_TYPES,
        mode,
        options,
      ),
    ),
  )
  const resolved = pickBest(inMode)
  if (resolved) {
    return findInOptions(
      variant,
      resolved.adapterType as AI_ADAPTER_TYPES,
      mode,
      options,
    )
  }

  // 默认型号在这个模式下无解 —— 退到该模式下任意一条用户清单里有的。
  const modeIds = new Set<string>(getModelsForNodeMode(mode).map((m) => m.id))
  return pickBest(options.filter((option) => modeIds.has(option.modelId)))
}

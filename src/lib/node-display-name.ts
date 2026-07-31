/**
 * 节点显示名的单一事实源（包 4.5）。
 *
 * ── 为什么需要这个文件 ──────────────────────────────────────────────
 * 在这之前，「这个节点叫什么」在仓里有 **4 套读法、3 套写法**，互相不一致：
 *
 *   读 · `CastDock.getNodeDisplayName`      七字段优先链，最全
 *   读 · `NodeShell` 的来源 chip             按呈现类型分支，漏 mediaLabel/sourceLabel
 *   读 · `LooseImageCard.rawLabel`           只有 mediaLabel ‖ sourceLabel
 *   读 · `StudioNodeAssistantDock.getNodeTitle`  只认 legacy characterImage，其余全给类型标签
 *   写 · `IdentityCollectorCard.commitName`  characterName / backgroundName
 *   写 · `NodeMediaPreview.commitHeaderTitle` shotName / mediaLabel+sourceLabel / …
 *   写 · `LooseImageCard` 与 `ImageSourceStarter`  mediaLabel + sourceLabel
 *
 * 这直接长出两个真 bug：
 *   ① 助手 payload 里的 `title` 是**本地化类型标签**（「图片」），不是名字 ——
 *      因为那条读法只认合并前的 `characterImage`，而角色早已是 `image`+role。
 *   ② **出图会把名字弄丢**：同一个 `role=shot` 静帧，空态由 `NodeMediaPreview`
 *      渲染（读写 `shotName`），一旦有图就换成 `LooseImageCard`（读写
 *      `mediaLabel`）。起完名再生成一张图，卡上就变回「未命名」。
 *
 * ── 所以这里只放两件事，而且必须放在同一个文件里 ────────────────────
 * `resolveNodeDisplayName` 和 `buildDisplayNamePatch` 是一对：**读的优先链**与
 * **写的落点**要能在一屏之内对得上。拆开放两处，正是它们当初分叉的方式。
 *
 * ⚠ 写侧口径（owner 2026-07-31 拍板）：**按 role/type 定，与「有没有媒体」无关**。
 * 同一个节点永远写同一个字段，读写因此天然对齐。旧数据不迁移 —— 读侧的优先链
 * 本来就把所有历史字段都含在内。
 */

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

/**
 * 这个节点在画布上显示的名字；从没命名过时返回 `undefined`。
 *
 * ⚠ **不带兜底**。类型标签（「图片」「镜头文本」）是**呈现层**的事，各处的
 * fallback 文案不尽相同（卡面用 `未命名`、chip 用类型名），塞进这里会让调用方
 * 分不清「用户起过名」和「我们编了个名」—— 可编辑标签尤其不能混：
 * `LooseImageCard` 的输入框拿到兜底文案后，一次原样回车就会把它**存成真名字**。
 *
 * 优先链沿用 `CastDock` 那条（本来就是最全的一条），顺序即语义：专有身份名 →
 * 通用媒体标签。
 */
export function resolveNodeDisplayName(
  data: NodeWorkflowNodeData,
): string | undefined {
  return (
    trimmed(data.characterName) ??
    trimmed(data.character?.name) ??
    trimmed(data.backgroundName) ??
    trimmed(data.shotName) ??
    trimmed(data.voiceName) ??
    notModelId(data, trimmed(data.mediaLabel)) ??
    notModelId(data, trimmed(data.sourceLabel))
  )
}

/**
 * 丢掉「其实是模型 id」的那种标签。
 *
 * 生成流程曾经把 `generation.model` 直接写进 `mediaLabel`（那是显示名字段），
 * 于是一张从没被命名过的生成图，在助手 payload 与卡匣里都叫
 * `gemini-3.1-flash-image-preview` —— 把系统值当人起的名字。写侧已经不再这么
 * 写了，但**存量项目里那些标签还在**，所以读侧也要挡一道。
 *
 * ⚠ 判据是**与这个节点自己的 `model.modelId` 精确相等**，不是「看起来像模型
 * 名」的模式匹配。用户完全可以把一张图就叫这个名字 —— 只有当它和该节点实际
 * 用的模型 id 一字不差时，才几乎必然是那次写入留下的。
 */
function notModelId(
  data: NodeWorkflowNodeData,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined
  return value === data.model?.modelId ? undefined : value
}

/**
 * 重命名该写哪个字段。
 *
 * 判据是 **role 优先、type 兜底**，因为统一 `image` 节点的身份在 `data.role`
 * 上而不在 type 上（合并后 `characterImage` 这类 legacy type 只剩历史数据）。
 *
 * `mediaLabel` 与 `sourceLabel` 一起写：两者是老搭档，只写一个会让它们悄悄
 * 分叉（`NodeMediaPreview` 原注释已经记过这条）。
 */
export function buildDisplayNamePatch(
  /**
   * 只收真正决定落点的两样东西，不要整个 `data` —— 调用方里有的（起手卡）
   * 根本拿不到完整 data，有的（散图卡）只有更宽的 token 类型。
   */
  identity: { role?: NodeImageRole; type?: NodeWorkflowNodeType },
  nextValue: string,
): Partial<NodeWorkflowNodeData> {
  const { role, type } = identity
  const value = nextValue.trim()

  if (
    role === NODE_IMAGE_ROLE_IDS.character ||
    role === NODE_IMAGE_ROLE_IDS.closeup ||
    type === NODE_TYPE_IDS.characterImage
  ) {
    return { characterName: value }
  }
  if (
    role === NODE_IMAGE_ROLE_IDS.background ||
    type === NODE_TYPE_IDS.backgroundImage
  ) {
    return { backgroundName: value }
  }
  if (role === NODE_IMAGE_ROLE_IDS.shot || type === NODE_TYPE_IDS.shot) {
    return { shotName: value }
  }
  if (type === NODE_TYPE_IDS.voice) {
    return { voiceName: value }
  }
  // 无 role 的散图、关键帧、镜头文本、视频合并、参考视频、seedance —— 没有专有
  // 身份字段，用通用媒体标签。
  return { mediaLabel: value, sourceLabel: value }
}

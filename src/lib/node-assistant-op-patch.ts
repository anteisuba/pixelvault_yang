/**
 * 助手「写简单字段」的 op → 落进节点 `data` 的补丁（切片 5 第一批）。
 *
 * ── 为什么不写在执行器里 ────────────────────────────────────────────
 * 执行器（`StudioNodeWorkbench.handleRunAssistantCanvasOps`）是个 4900 行组件里的
 * 回调，没有测试宿主。而这两条 op 里唯一容易错的地方恰恰是**纯逻辑**：
 * `custom` 与 `imageCategoryLabel` 的成对关系（换成别的分类要顺手清掉旧名字，
 * 否则卡上会挂着一个已经不适用的自定义名）。把它抽成纯函数，那条规则就能被断言。
 *
 * ⚠ 这里只收「不读现值」的 op。`set_review_state` **不在**这里：它的补丁必须从
 * 节点当前的 `mediaReview` 上长出来（`rejectMedia(base, …)`），而 base 在同一批
 * 里会被前面的 op 改过 —— 那份记账只有执行器有，抽过来只会把账本也拖过来。
 */

import { NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID } from '@/constants/node-studio'
import type { NodeStudioReferenceRole } from '@/constants/node-studio'
import {
  NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_WORKFLOW_FIELD_IDS,
  NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  VIDEO_RESOLUTIONS,
  type VideoResolution,
} from '@/constants/video-options'
import type {
  NodeAssistantSetImageCategoryOp,
  NodeAssistantSetParamsOp,
  NodeAssistantSetPromptOp,
} from '@/types/node-assistant-ops'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
  NodeWorkflowNodeData,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

/**
 * 助手写进来的一段自由文本该落**哪个字段** —— `add_node.prompt` 与 `set_prompt`
 * 共用这一处（台账 K-1，2026-08-29 真机）。
 *
 * ── 为什么不能一律写 `prompt` ────────────────────────────────────────
 * 「与人手在同一个框里打字完全等价」这句话本身是对的，错的是**假设每种节点都有
 * 那个框**。`shotText` 没有：它的四栏是 scene / action / camera / composition，
 * 详情面板渲染的是这四栏、`buildNodeWorkflowPrompt` 拼的也是这四栏，`prompt`
 * 在它身上零读者。真机后果是助手写的四段镜头文本（401 / 288 / 302 / 270 字符）
 * 全部作废，而节点只显示「还没有镜头文本」—— **静默，且看起来像助手没写**。
 * `voice` 同病（五栏全是音色配置，没有正文字段）。
 *
 * 落点表在 `constants/node-types.ts`，不变量测试钉着「字段集没有 prompt 的类型
 * 必须登记」。返回 `null` = 这个节点真的没地方放这段文字，调用方要**明说拒绝**，
 * 不许随便找个字段塞进去（那只是把黑洞换个位置）。
 */
export function buildAssistantPromptPatch(
  identity: { role?: NodeImageRole; type?: NodeWorkflowNodeType },
  prompt: string,
): Partial<NodeWorkflowNodeData> | null {
  const fields = identity.role
    ? NODE_WORKFLOW_FIELDS_BY_IMAGE_ROLE[identity.role]
    : identity.type
      ? NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[identity.type]
      : undefined

  // 没有登记字段集的类型走 `buildNodeWorkflowPrompt` 的同一条兜底：`[prompt]`。
  if (!fields || fields.includes(NODE_WORKFLOW_FIELD_IDS.prompt)) {
    return { prompt }
  }

  const landing = identity.type
    ? NODE_WORKFLOW_FREE_TEXT_FIELD_BY_NODE_TYPE[identity.type]
    : undefined
  if (!landing) return null
  return { [landing]: prompt }
}

/**
 * `set_prompt` 的补丁。落点由 `buildAssistantPromptPatch` 按节点类型决定 ——
 * 见它的头注（此前这里无条件写 `prompt`，对镜头文本节点等于把内容丢进黑洞）。
 */
export function buildAssistantSetPromptPatch(
  identity: { role?: NodeImageRole; type?: NodeWorkflowNodeType },
  op: NodeAssistantSetPromptOp,
): Partial<NodeWorkflowNodeData> | null {
  return buildAssistantPromptPatch(identity, op.prompt)
}

/**
 * `set_image_category` 的补丁 —— 形状照抄人手那两处写者
 * （`LooseImageDetailBody` 的分类下拉 / `CanvasImageSelectionToolbar` 的 ⋯ 菜单）：
 * **分类换成非 custom 时把 `imageCategoryLabel` 一起清掉**。
 *
 * 区别只有一处，且是有意的：人手那两处在切到 `custom` 时保留节点上原有的自定义
 * 名（用户接着会在旁边的输入框里改），而助手这条**必须自带 label**（没给会在规划
 * 器里被 `missingCategoryLabel` 拒），所以这里直接用 op 带来的那个 —— 助手不该
 * 依赖一个它没读过的旧值。
 *
 * `category` 的合法性由规划器保证（`isNodeStudioReferenceRole`），这里只管形状。
 */
export function buildAssistantSetImageCategoryPatch(
  category: NodeStudioReferenceRole,
  op: NodeAssistantSetImageCategoryOp,
): Partial<NodeWorkflowNodeData> {
  return {
    imageCategory: category,
    imageCategoryLabel:
      category === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID ? op.label : undefined,
  }
}

/**
 * `set_model` 的补丁（切片 5 第二批）。
 *
 * 落的是**选择器给的那一条选项**原样折成 `NodeWorkflowModelSelection` —— 与
 * `DetailModelPicker.onChange` 收到的对象逐字段相同。助手载荷里只有一个模型 id，
 * 剩下四个字段（optionId / adapterType / providerConfig / apiKeyId）一律来自查表，
 * ⛔ 一个也不许是模型写的。
 */
export function buildAssistantSetModelPatch(
  option: NodeWorkflowModelOption,
): Partial<NodeWorkflowNodeData> {
  const model: NodeWorkflowModelSelection = {
    optionId: option.optionId,
    modelId: option.modelId,
    adapterType: option.adapterType,
    providerConfig: option.providerConfig,
    ...(option.apiKeyId ? { apiKeyId: option.apiKeyId } : {}),
  }
  return { model }
}

/**
 * ⚠ 不是复查，是**让 TS 拿到窄类型**：`op.resolution` 在 schema 里是自由字符串
 * （收进 `z.enum` 会让一条写错档位的 op 把整批提案带崩），而 `data.resolution`
 * 是 `z.enum(VIDEO_RESOLUTIONS)`。真正的值域校验在规划器，按**当前模型**给的那张
 * 表判 —— 那张表本身就是 `VideoResolution[]` 的子集，所以这里恒成立。
 */
function toVideoResolution(value: string): VideoResolution | undefined {
  return (VIDEO_RESOLUTIONS as readonly string[]).includes(value)
    ? (value as VideoResolution)
    : undefined
}

/**
 * `set_params` 的补丁（切片 5 第二批）—— 只写载荷里真的带了的那几档。
 *
 * ⚠ `duration` 在节点 data 上是**字符串**（历史上是个文本输入框，`VideoComposer`
 * 的滑条写的也是 `String(seconds)`），所以这里 `String()` 一下。数字与字符串两种
 * 写法在读侧是两回事：`handleGenerateMediaNode` 走的是 `Number.parseFloat`，写成
 * 数字会在 zod 那关就掉。
 */
export function buildAssistantSetParamsPatch(
  op: NodeAssistantSetParamsOp,
): Partial<NodeWorkflowNodeData> {
  const resolution = op.resolution
    ? toVideoResolution(op.resolution)
    : undefined
  return {
    ...(op.aspectRatio ? { aspectRatio: op.aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(op.duration !== undefined ? { duration: String(op.duration) } : {}),
    ...(typeof op.generateAudio === 'boolean'
      ? { generateAudio: op.generateAudio }
      : {}),
    ...(typeof op.seed === 'number' ? { seed: op.seed } : {}),
  }
}

/**
 * `attach_asset` 的补丁（切片 5 第二批）—— 追加一条参考图。
 *
 * 形状照抄人手那三处写者（档案面板图集 / 选中工具条「添加素材」 / 名册卡落卡）：
 * **在原数组尾部追加**，不排序、不去重（重复与容量在规划器就拒了）。条目本身由
 * 调用方用 `createReferenceAsset` 造 —— 那是「一条参考图长什么样」的唯一构造器，
 * 这里只负责「往哪儿放」。
 */
export function buildAssistantAttachAssetPatch(
  existing: readonly NodeWorkflowReferenceAsset[] | undefined,
  asset: NodeWorkflowReferenceAsset,
): Partial<NodeWorkflowNodeData> {
  return { referenceAssets: [...(existing ?? []), asset] }
}

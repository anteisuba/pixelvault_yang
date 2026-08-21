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
import type {
  NodeAssistantSetImageCategoryOp,
  NodeAssistantSetPromptOp,
} from '@/types/node-assistant-ops'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

/**
 * `set_prompt` 的补丁。落的是节点自己的 `prompt` 字段 —— 与人手在同一个框里打字
 * 完全等价，不另设一套「助手写的提示词」通道（与 `add_node.prompt` 同一条）。
 */
export function buildAssistantSetPromptPatch(
  op: NodeAssistantSetPromptOp,
): Partial<NodeWorkflowNodeData> {
  return { prompt: op.prompt }
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

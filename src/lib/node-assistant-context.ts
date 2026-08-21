/**
 * 画布 → 助手的**节点现值投影**（切片 5 第一批）。
 *
 * ── 为什么是独立模块 ────────────────────────────────────────────────
 * 这段逻辑原本长在 `StudioNodeAssistantDock` 的一个 `useMemo` 里。它决定了模型
 * **能看见什么**，而看不见就只能编（工作台那边给不出可选模型列表，模型就编了个
 * 不存在的「Animagine XL」）。这种东西必须能单独测：空态、截断、以及「哪些节点
 * 有分类字段」的判据，一个都不该只能靠打开画布才验得到。
 *
 * ── 与 studio 的 `assistant-workbench-state` 的关系 ──────────────────
 * 同一套气质（空态要说出来、不冒充未知、有上限），但**形状不同**：工作台是一张
 * 表单（单数），画布是一串节点（复数）。所以这里不套那边的分节文本，只按节点逐条
 * 投影，渲染成给模型看的行的活儿留给 service 那一层。
 */

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID,
  resolveReferenceAssetLimit,
} from '@/constants/node-studio'
import {
  NODE_AUDIO_MODEL_NODE_TYPES,
  NODE_IMAGE_MODEL_NODE_TYPES,
  NODE_TYPE_IDS,
  NODE_VIDEO_MODEL_NODE_TYPES,
} from '@/constants/node-types'
import { isIdentityCardNode } from '@/lib/node-workflow-graph'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import type { NodeAssistantNodeContext } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'

export function truncateNodeAssistantText(
  value: string,
  maxLength: number,
): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`
    : trimmed
}

/**
 * 这个节点身上有「图片分类」这回事吗 —— 判据必须与**人手的入口**一致。
 *
 * 人手能标分类的地方只有两处，两处都只挂在图片节点上：详情面板的
 * `LooseImageDetailBody` 那颗下拉，和 `CanvasImageSelectionToolbar` 的 ⋯ 菜单。
 * 身份卡（角色卡 / 背景卡）不算 —— 它是档案夹不是图，`type` 同样是 `image`，
 * 只能靠 `isIdentityCardNode` 分出来。
 *
 * ⛔ 别改成「按 media kind 判」：卡片的 kind 也是 image，那样会把卡片算进来。
 */
export function canCarryImageCategory(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNode['data']
}): boolean {
  return node.type === NODE_TYPE_IDS.image && !isIdentityCardNode(node)
}

/**
 * 这个节点身上有「选模型」这回事吗（`set_model` 的判据）。
 *
 * 三个模型节点类型表的并集，**再减去身份卡** —— 卡片的 type 也在图片那张表里，
 * 但它不产图（`generate` 也拒它，见规划器里那条同源的判据），详情面板压根不给它
 * 渲染模型选择器。往档案夹上挂一个模型是一条三绿而无意义的写入。
 */
export function canCarryModel(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNode['data']
}): boolean {
  const modelNodeTypes: readonly NodeWorkflowNode['type'][] = [
    ...NODE_IMAGE_MODEL_NODE_TYPES,
    ...NODE_VIDEO_MODEL_NODE_TYPES,
    ...NODE_AUDIO_MODEL_NODE_TYPES,
  ]
  return modelNodeTypes.includes(node.type) && !isIdentityCardNode(node)
}

/**
 * 这个节点身上有「生成档位」这回事吗（`set_params` 的判据）。
 *
 * ⚠ 判据是 `NODE_VIDEO_MODEL_NODE_TYPES`（今天只有视频生成节点），**不是**
 * 「媒体种类是 video」：参考视频与合并节点的 kind 也是 video，但它们没有档位
 * 控件、生成路径也不读这些字段。图片节点为什么不在这里，见
 * `NODE_ASSISTANT_PARAM_IDS` 头注的查证结论（档位住在合成条的 React state 里）。
 */
export function canCarryGenerationParams(node: {
  type: NodeWorkflowNode['type']
}): boolean {
  return (NODE_VIDEO_MODEL_NODE_TYPES as readonly string[]).includes(node.type)
}

/**
 * 这个节点收不收参考图（`attach_asset` 的判据）。
 *
 * 人手把素材**挂进 `referenceAssets`** 的入口只有三处，三处都只长在收集器卡
 * （角色卡 / 背景卡）上：档案面板的图集（`nestedAdd`）、选中工具条的「添加素材」、
 * 名册卡落卡。其余节点的参考图走的是**连线**（阶段 3：参考图落散图节点 + 自动
 * 连线），那条路助手已经有 `connect`——所以这里故意窄，不给同一件事开第二条路。
 */
export function canAttachReferenceAsset(node: {
  type: NodeWorkflowNode['type']
  data: NodeWorkflowNode['data']
}): boolean {
  return isIdentityCardNode(node)
}

/**
 * 助手 payload 里的 `title` —— **必须是画布上显示的那个名字**。
 *
 * ⚠ 这里曾经是包 4.5 要修的洞：旧实现只认合并前的 `characterImage`（角色早已是
 * `image` + `role=character`，那个分支一次都不会命中），其余类型一律返回
 * `fallbackTitle`，也就是本地化的**类型标签**。于是助手看到的是「图片 / 镜头文本
 * / 视频生成」，用户改的「雨夜开场镜」和角色名「小林」它一个都拿不到，`@` 按名字
 * 引用因此不可能成立。
 *
 * 修法是接上**共享的显示名事实源**，而不是在这里再加一层兜底 —— 再写一套就是
 * 同一个错误的第五份副本。
 */
function resolveTitle(node: NodeWorkflowNode, fallbackTitle: string): string {
  return resolveNodeDisplayName(node.data) ?? fallbackTitle
}

/**
 * 视频节点的档位现值 → payload。**原样带**，不做单位美化：`duration` 在数据层
 * 就是字符串（`'6'` / `'auto'`），模型写回时写的也是同一套值。
 *
 * 没设的档位直接缺席（与 `promptExcerpt` 同一条：一个空值渲染出来读起来像
 * 「设成了空」，而它其实是「还没设」）。
 */
function buildParamsContext(
  data: NodeWorkflowNode['data'],
): NonNullable<NodeAssistantNodeContext['params']> {
  const aspectRatio = data.aspectRatio?.trim()
  const resolution = data.resolution?.trim()
  const duration = data.duration?.trim()
  return {
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(duration ? { duration } : {}),
    ...(typeof data.generateAudio === 'boolean'
      ? { generateAudio: data.generateAudio }
      : {}),
    ...(typeof data.seed === 'number' ? { seed: data.seed } : {}),
  }
}

export interface BuildNodeAssistantNodeContextsOptions {
  /** 没有显示名时兜底用的本地化类型标签（`StudioNode.nodeTypes`）。 */
  getNodeTypeLabel(type: NodeWorkflowNode['type']): string
}

/**
 * 一批画布节点 → 助手看得见的现值。
 *
 * 上限走 `NODE_STUDIO_ASSISTANT_LIMITS`：节点数 `maxNodes`（32）先截断，再逐条
 * 按 `maxNodeLabelLength` / `maxNodeSummaryLength` 截字。截断是**取前 N 个**，
 * 不做任何「挑重要的」排序 —— 排序需要一个「什么叫重要」的定义，那是另一件事，
 * 在它被定义之前，可预测的前 N 个比一个猜出来的排名诚实。
 */
export function buildNodeAssistantNodeContexts(
  nodes: readonly NodeWorkflowNode[],
  { getNodeTypeLabel }: BuildNodeAssistantNodeContextsOptions,
): NodeAssistantNodeContext[] {
  return nodes.slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodes).map((node) => {
    const prompt = node.data.prompt?.trim()
    const category = canCarryImageCategory(node)
      ? (node.data.imageCategory ?? NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID)
      : undefined
    const categoryLabel = node.data.imageCategoryLabel?.trim()
    // 与分类同构的三态：能选模型就一定有这个字段，没选就说 `unset`。
    const model = canCarryModel(node)
      ? (node.data.model?.modelId ?? NODE_STUDIO_IMAGE_CATEGORY_UNSET_ID)
      : undefined
    const params = canCarryGenerationParams(node)
      ? buildParamsContext(node.data)
      : undefined
    const references = canAttachReferenceAsset(node)
      ? {
          limit: resolveReferenceAssetLimit(node.data.model),
          items: (node.data.referenceAssets ?? [])
            .slice(0, NODE_STUDIO_ASSISTANT_LIMITS.maxNodeReferences)
            // ⛔ 只取 role 与源节点 id —— `url` 一个字都不进 payload。
            .map((asset) => ({
              role: asset.role,
              ...(asset.sourceId ? { sourceId: asset.sourceId } : {}),
            })),
        }
      : undefined

    return {
      id: node.id,
      type: node.type,
      status: node.data.status,
      title: truncateNodeAssistantText(
        resolveTitle(node, getNodeTypeLabel(node.type)),
        NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength,
      ),
      // 空提示词不占位：`promptExcerpt` 缺席 = 这个节点还没有提示词，
      // 而一个空串会被渲染成 `prompt: ""`，读起来像「提示词是空的」——
      // 两者对模型是同一句话，但空串还要多花 token 说它。
      ...(prompt
        ? {
            promptExcerpt: truncateNodeAssistantText(
              prompt,
              NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength,
            ),
          }
        : {}),
      ...(category ? { imageCategory: category } : {}),
      ...(category && categoryLabel
        ? { imageCategoryLabel: categoryLabel }
        : {}),
      ...(model ? { model } : {}),
      // ⚠ 空对象是**有意义的值**（「有档位、一个都没设」），而它在 JS 里恰好是
      // truthy，所以这么写就能发出去。⛔ 别「优化」成
      // `Object.keys(params).length > 0` —— 那会把三态压回两态，模型又分不出
      // 「这节点没有档位」和「还没设」。
      ...(params ? { params } : {}),
      ...(references ? { references } : {}),
    } satisfies NodeAssistantNodeContext
  })
}

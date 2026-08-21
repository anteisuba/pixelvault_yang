import { z } from 'zod'

import {
  NODE_ASSISTANT_ADD_INTENTS,
  NODE_ASSISTANT_DURATION_AUTO,
  NODE_ASSISTANT_OP_IDS,
  NODE_ASSISTANT_OP_LIMITS,
} from '@/constants/node-assistant-ops'
import { NODE_REVIEW_STATES } from '@/constants/node-types'

/**
 * 一个节点引用：要么是画布上已有节点的 id（助手在 `[[node:id]]` 里读到的那个），
 * 要么是**本批** `add_node` 声明的别名 `ref`。解析顺序在规划器里（别名优先），
 * 这里只管形状。
 *
 * ⚠ 有意**不**做成 `{ nodeId } | { ref }` 的联合：模型每多一层嵌套就多一分写错
 * 的概率，而这里的歧义成本很低 —— 别名由本批自己声明，冲突可以在规划期查出来。
 */
const NodeAssistantOpTargetSchema = z
  .string()
  .trim()
  .min(1)
  .max(NODE_ASSISTANT_OP_LIMITS.maxTargetLength)

const NodeAssistantOpNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NODE_ASSISTANT_OP_LIMITS.maxNameLength)

/**
 * 剥掉正文里的 `[[node:id]]` 标记。
 *
 * ⚠ **真机抓到的**（2026-08-08 第一次跑通 B1）：系统提示词教模型「引用节点时写
 * `[[node:id]]` 好让 UI 渲染成可点的胶囊」，模型把这条也套用到了 `prompt` 字段
 * 上，于是生成提示词里出现了一串 uuid —— 那个字段是发给**图像模型**的，不经过
 * UI 渲染，标记会被当成画面描述的一部分。
 *
 * 修成守卫而不是只加一句提示词规则，理由与 `node-assistant-op-plan` 头部那句
 * 一样：**写进提示词的规则模型总会滑出去；写成守卫的规则不会**。放在 schema 上
 * 是因为提案卡和执行层读的是同一份解析结果 —— 卡上显示的必须就是最终会落进
 * 节点的那段字，否则用户审的和实际写的是两个东西。
 */
function stripNodeMarkers(value: string): string {
  return value
    .replace(/\[\[node:[^\]]+\]\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export const NodeAssistantAddNodeOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.addNode),
  /** ＋添加 菜单的意图 id —— 族与 role 的唯一定义处，见 canvas-add-catalog。 */
  intent: z.enum(NODE_ASSISTANT_ADD_INTENTS),
  /** 批内别名，供同一批的 connect / rename 引用这个还没有 id 的新节点。 */
  ref: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxRefLength)
    .optional(),
  /** 建好就起名。省略则是未命名节点，和人手从菜单建出来的一样。 */
  name: NodeAssistantOpNameSchema.optional(),
  /**
   * 建好就把提示词填进去（A3 / B1）。省略则是空节点，和人手从菜单建出来的一样。
   *
   * ⚠ **在此之前助手能建节点、能起名、能连线，唯独填不进一个字** —— schema 里
   * 根本没有这个字段。「助手设计节点时自动填入生成的关键词」这条诉求的全部内容
   * 就是它。
   *
   * 只对**有提示词可言**的族有意义（图片 / 视频 / 镜头文本）；落到身份卡这类节点
   * 上时执行层照写不误 —— 与人手在同一个字段里打字完全等价，不另设一套规则。
   */
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxPromptLength)
    .transform(stripNodeMarkers)
    .optional(),
})

/**
 * 改**已有**节点的提示词（切片 5 第一批）。
 *
 * 与 `add_node.prompt` 共用同一条守卫链（长度上限 + `stripNodeMarkers`）：助手读到
 * 的提示词有多长、能写回的就有多长，`[[node:…]]` 标记一样不许混进这个字段 ——
 * 它是发给图像模型的，不经过 UI 渲染。两处若各写各的，迟早只修好一处。
 *
 * ⚠ **这条会覆盖用户手写的提示词**，且归自动落一档（与 `rename` 同类，见
 * `NODE_ASSISTANT_AUTO_APPLY_OPS` 的分档论据）。整批一个撤销步，回执卡上有撤销。
 */
export const NodeAssistantSetPromptOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.setPrompt),
  target: NodeAssistantOpTargetSchema,
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxPromptLength)
    .transform(stripNodeMarkers),
})

/**
 * 标图片分类（切片 5 第一批）—— `frameStart` / `frameEnd` 就是关键帧首尾。
 *
 * ⚠ `category` 是**自由字符串**而不是 `z.enum(NODE_STUDIO_REFERENCE_ROLES)`，
 * 与 `set_review_state.state` 收下 `approved` 是同一条论据：schema 层拒 = 整块
 * JSON 解析失败 = 同批其它 op 陪葬 + 用户只看到「读不出来」。收窄放在规划器
 * （`unknownCategory` / `missingCategoryLabel`），坏的那条被点名，其余照常。
 *
 * `label` 只在 `category === 'custom'` 时有意义，且此时**必填**（规划器判）——
 * 数据层的 custom 与 `imageCategoryLabel` 成对存在。
 */
export const NodeAssistantSetImageCategoryOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.setImageCategory),
  target: NodeAssistantOpTargetSchema,
  category: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxTargetLength),
  label: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxCategoryLabelLength)
    .optional(),
})

/**
 * 换节点上选的模型（切片 5 第二批）。
 *
 * `model` 是**模型 id**，不是渠道（optionId）—— 同一个型号可以有工作区内置和
 * 用户自己绑 key 两条路由，助手要选的是「用哪个模型」，挑哪条路由是应用的事
 * （规划器按选择器的同一顺序取第一条能跑的）。
 *
 * ⚠ 载荷只有一个 id，是因为 `NodeWorkflowModelSelection` 有五个字段
 * （optionId / modelId / adapterType / providerConfig / apiKeyId）—— 让模型手写
 * 那一坨等于让它编 baseUrl。查表必须发生在客户端，这条 schema 只负责把 id 带过来。
 */
export const NodeAssistantSetModelOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.setModel),
  target: NodeAssistantOpTargetSchema,
  model: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxModelIdLength),
})

/**
 * 改生成档位（切片 5 第二批）。
 *
 * ⚠ 每个档位都是**宽松类型**，值域校验一律在规划器 —— 与 `set_image_category`
 * 同一条论据：schema 层拒 = 整块 JSON 解析失败 = 同批其它 op 陪葬。写错一个
 * 分辨率不该让同一批里的建节点也一起没了。
 *
 * ⚠ 五个字段全是可选，但**一个都不带**会被规划器按 `emptyParams` 拒 ——
 * 一条什么都不改的 op 落下去等于静默失败。
 * （`z.discriminatedUnion` 的成员必须是纯 ZodObject，`.refine` 会把它变成
 * ZodEffects 而进不了联合，所以这条只能判在规划器。）
 */
export const NodeAssistantSetParamsOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.setParams),
  target: NodeAssistantOpTargetSchema,
  aspectRatio: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
    .optional(),
  resolution: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
    .optional(),
  /** 秒数，或 `auto`（把时长交回给模型）—— 与 `VideoComposer` 的自动档同一个值。 */
  duration: z
    .union([z.number(), z.literal(NODE_ASSISTANT_DURATION_AUTO)])
    .optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().optional(),
})

/**
 * 把画布上另一个节点的主媒体挂进目标节点的参考图集（切片 5 第二批）。
 *
 * ⛔ **载荷里没有 URL**：`source` 是节点引用（画布上的 id，或本批 `add_node` 的
 * 别名），媒体地址由应用自己从那个节点上取（`getNodePrimaryMediaUrl`）。理由与
 * LoRA 那批同源 —— 让模型写 URL 就是让它编一个不存在的地址，而节点 id 天然被
 * 规划器的 `resolve()` 校验。
 *
 * `role` 与 `set_image_category` 共用那 11 个分类（含 `custom` + `label` 成对），
 * 同样宽松收下、规划器收窄。`onStage`（出场组）也在这里：它决定这张图会不会跟着
 * 卡一起被下游收割，是「挂进来之后有没有用」的那一半。
 */
export const NodeAssistantAttachAssetOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.attachAsset),
  target: NodeAssistantOpTargetSchema,
  source: NodeAssistantOpTargetSchema,
  role: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
    .optional(),
  label: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxCategoryLabelLength)
    .optional(),
  onStage: z.boolean().optional(),
})

export const NodeAssistantConnectOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.connect),
  source: NodeAssistantOpTargetSchema,
  target: NodeAssistantOpTargetSchema,
})

export const NodeAssistantRenameOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.rename),
  target: NodeAssistantOpTargetSchema,
  name: NodeAssistantOpNameSchema,
})

/**
 * ⚠ `state` 这里收**全部三态**，包括 `approved` —— 然后由规划器按
 * `canAssistantSetReviewState` 拒掉它。
 *
 * 看起来绕，但这是有意的：schema 层直接把 `approved` 从枚举里删掉，模型写了就
 * 变成「整条 op 形状不对」，用户看到的是一句笼统的解析失败；留到规划层拒，用户
 * 看到的是「助手不能替你放行」。**同一个禁令，后者可教。**
 */
export const NodeAssistantSetReviewStateOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.setReviewState),
  target: NodeAssistantOpTargetSchema,
  state: z.enum(NODE_REVIEW_STATES),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxReasonLength)
    .optional(),
})

export const NodeAssistantGenerateOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_IDS.generate),
  target: NodeAssistantOpTargetSchema,
})

export const NodeAssistantOpSchema = z.discriminatedUnion('op', [
  NodeAssistantAddNodeOpSchema,
  NodeAssistantConnectOpSchema,
  NodeAssistantRenameOpSchema,
  NodeAssistantSetPromptOpSchema,
  NodeAssistantSetImageCategoryOpSchema,
  NodeAssistantSetModelOpSchema,
  NodeAssistantSetParamsOpSchema,
  NodeAssistantAttachAssetOpSchema,
  NodeAssistantSetReviewStateOpSchema,
  NodeAssistantGenerateOpSchema,
])

export const NodeAssistantOpBatchSchema = z.object({
  ops: z
    .array(NodeAssistantOpSchema)
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxOps),
})

export type NodeAssistantAddNodeOp = z.infer<
  typeof NodeAssistantAddNodeOpSchema
>
export type NodeAssistantConnectOp = z.infer<
  typeof NodeAssistantConnectOpSchema
>
export type NodeAssistantRenameOp = z.infer<typeof NodeAssistantRenameOpSchema>
export type NodeAssistantSetPromptOp = z.infer<
  typeof NodeAssistantSetPromptOpSchema
>
export type NodeAssistantSetImageCategoryOp = z.infer<
  typeof NodeAssistantSetImageCategoryOpSchema
>
export type NodeAssistantSetModelOp = z.infer<
  typeof NodeAssistantSetModelOpSchema
>
export type NodeAssistantSetParamsOp = z.infer<
  typeof NodeAssistantSetParamsOpSchema
>
export type NodeAssistantAttachAssetOp = z.infer<
  typeof NodeAssistantAttachAssetOpSchema
>
export type NodeAssistantSetReviewStateOp = z.infer<
  typeof NodeAssistantSetReviewStateOpSchema
>
export type NodeAssistantGenerateOp = z.infer<
  typeof NodeAssistantGenerateOpSchema
>
export type NodeAssistantOp = z.infer<typeof NodeAssistantOpSchema>
export type NodeAssistantOpBatch = z.infer<typeof NodeAssistantOpBatchSchema>

import { z } from 'zod'

import {
  NODE_ASSISTANT_ADD_INTENTS,
  NODE_ASSISTANT_DURATION_AUTO,
  NODE_ASSISTANT_OP_IDS,
  NODE_ASSISTANT_OP_LIMITS,
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_READ_CANVAS_SCOPES,
  NODE_ASSISTANT_SETTABLE_FIELDS,
  NODE_ASSISTANT_WRITE_MODES,
} from '@/constants/node-assistant-ops'
import {
  NODE_SLOT_OUTPUTS,
  NODE_SLOT_TEXT_ROLES,
  NODE_SLOTS,
} from '@/constants/node-slots'
import {
  NODE_MEDIA_KINDS,
  NODE_REVIEW_STATES,
  NODE_V4_IMAGE_SUBTYPES,
} from '@/constants/node-types'
import { NODE_V4_OUTPUT_VERSION } from '@/constants/node-studio'
import {
  EDIT_CLIP_SPEED_MAX,
  EDIT_CLIP_SPEED_MIN,
  EDIT_TRACKS_TUPLE,
  EDIT_TRACK_MAX_CLIPS,
  EDIT_TRANSITIONS_TUPLE,
} from '@/constants/edit-desk'
import { EditClipSchema, EditProjectSchema } from '@/types/node-workflow'

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

/* ═════════════════════════════════════════════════════════════════════════
 * v4 op 载荷（第三期 · 画布 C1，spec §5）。词表 / 档位 / inverse 形状在
 * `@/constants/node-assistant-ops` 的 `NODE_ASSISTANT_OP_V4_SPECS`。
 *
 * ⛔ 本片只定形状，**不接执行器、不接规划器**（C2）。所以这里同样只管「这段 JSON
 * 长得对不对」，收窄（模型 id 在不在可选列表里、槽合不合法、目标节点存不存在）
 * 一律留给 `resolve()` 阶段——与 v3 那批同一条分工。
 * ═════════════════════════════════════════════════════════════════════════ */

const NodeAssistantSlotSchema = z.enum(NODE_SLOTS)

export const NodeAssistantReadCanvasOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.readCanvas),
  scope: z.enum(NODE_ASSISTANT_READ_CANVAS_SCOPES),
  shotNo: z.number().int().min(1).max(999).optional(),
})

export const NodeAssistantFindNodeOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.findNode),
  query: z.string().trim().min(1).max(NODE_ASSISTANT_OP_LIMITS.maxNameLength),
  kind: z.enum(NODE_MEDIA_KINDS).optional(),
  subtype: z.string().trim().min(1).max(40).optional(),
  shotNo: z.number().int().min(1).max(999).optional(),
})

/**
 * **只重跑下游**的只读规划（第三期）。
 *
 * ⚠ 载荷只有一个起点：下游是**图算出来的**（`lib/node-downstream.ts` 的
 * `collectDownstream`），⛔ 不让模型自己列一份名单 —— 让它列的下场是漏一个分支
 * （用户拿到一份前后不一致的成片）或多列一个无关分支（多花一份钱）。
 * ⚠ `includeSelf` 默认 false：用户刚换上去的那一个不该被盖掉（判据与
 * `collectDownstream` 头注第②条同源）。
 */
export const NodeAssistantPlanRerunDownstreamOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.planRerunDownstream),
  target: NodeAssistantOpTargetSchema,
  includeSelf: z.boolean().optional(),
})

export const NodeAssistantAddNodeV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.addNode),
  kind: z.enum(NODE_MEDIA_KINDS),
  subtype: z.string().trim().min(1).max(40),
  /** 批内别名，供同一批的 connect / set_prompt 引用这个还没有 id 的新节点。 */
  ref: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxRefLength)
    .optional(),
  shotNo: z.number().int().min(1).max(999).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  name: NodeAssistantOpNameSchema.optional(),
})

/** ⛔ 载荷里只有节点引用没有 URL（§5 纪律 1）。`slot` 必填。 */
export const NodeAssistantConnectV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.connect),
  source: NodeAssistantOpTargetSchema,
  sourceHandle: z.enum(NODE_SLOT_OUTPUTS).optional(),
  target: NodeAssistantOpTargetSchema,
  slot: NodeAssistantSlotSchema,
  /**
   * 文本槽的角色（C1 契约修正 2）。缺席 = `script`——`video.shot.text` 的容量按
   * 角色分（script 0..1 / style 0..N / character 0..N），收窄在规划器判。
   * ⛔ 其它槽给 `role` 无意义，规划器忽略它而不是整批拒绝。
   */
  role: z.enum(NODE_SLOT_TEXT_ROLES).optional(),
})

export const NodeAssistantDisconnectOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.disconnect),
  edgeId: NodeAssistantOpTargetSchema,
})

export const NodeAssistantDeleteOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.delete),
  target: NodeAssistantOpTargetSchema,
})

export const NodeAssistantMoveToShotOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.moveToShot),
  target: NodeAssistantOpTargetSchema,
  /** `null` = 移出镜头带，落到未归镜区。 */
  shotNo: z.number().int().min(1).max(999).nullable(),
})

export const NodeAssistantReorderShotOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.reorderShot),
  from: z.number().int().min(1).max(999),
  to: z.number().int().min(1).max(999),
})

export const NodeAssistantSetSlotVersionOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setSlotVersion),
  target: NodeAssistantOpTargetSchema,
  slot: NodeAssistantSlotSchema,
  versionId: NodeAssistantOpTargetSchema,
})

export const NodeAssistantMarkVersionBlockedOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.markVersionBlocked),
  target: NodeAssistantOpTargetSchema,
  slot: NodeAssistantSlotSchema,
  versionId: NodeAssistantOpTargetSchema,
  blocked: z.boolean(),
  /** 例「首帧动作不自然」——同一句话既进拒绝理由也进规则薄卡。 */
  reason: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxReasonLength)
    .optional(),
})

/**
 * 产出版本轮播（S3b，spec §1.8）。⚠ 认**下标**不认 id —— 它就是卡下那一排小点
 * 的第几颗；`set_slot_version` 认 id 是因为那边要能从边表幂等重算。
 */
export const NodeAssistantSetOutputVersionOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setOutputVersion),
  target: NodeAssistantOpTargetSchema,
  index: z
    .number()
    .int()
    .min(0)
    .max(NODE_V4_OUTPUT_VERSION.maxVersions - 1),
})

/**
 * 把当前产出版本拆成一张独立同类卡。⛔ 载荷里**没有 url** —— 同 `connect` /
 * `attach_asset` 那条纪律：让模型写地址等于让它编地址，那一版的 url 由执行层从
 * 版本表里取。
 */
export const NodeAssistantSplitOutputVersionOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.splitOutputVersion),
  target: NodeAssistantOpTargetSchema,
  /** 缺省 = 当前版。 */
  index: z
    .number()
    .int()
    .min(0)
    .max(NODE_V4_OUTPUT_VERSION.maxVersions - 1)
    .optional(),
})

/** 改图片子型（「设为角色卡」）。⛔ 只有 image kind 有子型词表可换。 */
export const NodeAssistantSetSubtypeOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setSubtype),
  target: NodeAssistantOpTargetSchema,
  subtype: z.enum(NODE_V4_IMAGE_SUBTYPES),
})

export const NodeAssistantSetTextOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setText),
  target: NodeAssistantOpTargetSchema,
  body: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxPromptLength)
    .transform(stripNodeMarkers),
  mode: z.enum(NODE_ASSISTANT_WRITE_MODES),
})

export const NodeAssistantSetPromptV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setPrompt),
  target: NodeAssistantOpTargetSchema,
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxPromptLength)
    .transform(stripNodeMarkers),
  mode: z.enum(NODE_ASSISTANT_WRITE_MODES),
})

/** `field` 是**封闭词表**，⛔ 不给自由 key。值的类型校验在规划器。 */
export const NodeAssistantSetFieldOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setField),
  target: NodeAssistantOpTargetSchema,
  field: z.enum(NODE_ASSISTANT_SETTABLE_FIELDS),
  value: z.union([
    z.string().trim().max(NODE_ASSISTANT_OP_LIMITS.maxNameLength),
    z.number(),
    z.boolean(),
    z.null(),
  ]),
})

/** ⛔ 同 `connect`：只有节点引用没有 URL。 */
export const NodeAssistantAttachAssetV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.attachAsset),
  target: NodeAssistantOpTargetSchema,
  slot: NodeAssistantSlotSchema,
  sourceNodeId: NodeAssistantOpTargetSchema,
  /**
   * 顺手把角色卡硬链上去（C1 契约修正 3）。只对 `image.character` 有意义；
   * 卡存不存在、是不是这个用户的，是执行层的事——数据层只管形状。
   */
  contextCardId: NodeAssistantOpTargetSchema.optional(),
})

export const NodeAssistantSetModelV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setModel),
  target: NodeAssistantOpTargetSchema,
  modelId: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxModelIdLength),
})

export const NodeAssistantSetParamsV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setParams),
  target: NodeAssistantOpTargetSchema,
  params: z.object({
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
    duration: z
      .string()
      .trim()
      .min(1)
      .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
      .optional(),
    generateAudio: z.boolean().optional(),
    seed: z.number().int().optional(),
    /**
     * 图片画质档（S3b）。⛔ 不 `z.enum`：档位跟着模型能力表走，写死在 op 形状上
     * 等于每加一个模型就要改一次协议。收窄在执行层（不支持的档拒绝）。
     */
    quality: z
      .string()
      .trim()
      .min(1)
      .max(NODE_ASSISTANT_OP_LIMITS.maxParamValueLength)
      .optional(),
    /** 一次发几张。上限与 `NodeV4GenerationParamsSchema.count` 同一个数。 */
    count: z.number().int().min(1).max(8).optional(),
  }),
})

/**
 * 音色档（`NodeV4AudioData.voiceProfile`）。
 *
 * ⚠ 载荷是**整份 profile 的补丁**而不是六条 `set_field`：情绪 / 语速 / 音量常常
 * 一起改（「再慢一点、温柔些」），拆成六条 op 会把一次调档碎成六个撤销步。
 * 值域（0.5–2 的语速、±20 的音量）由 `NodeV4AudioDataSchema` 在执行层复查 ——
 * 这里放宽，与 `set_params` 同一条论据：schema 层拒 = 整块 JSON 陪葬。
 */
export const NodeAssistantSetVoiceProfileOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile),
  target: NodeAssistantOpTargetSchema,
  profile: z.object({
    provider: z.string().trim().min(1).max(80).optional(),
    voiceId: z.string().trim().min(1).max(160).optional(),
    /** 显示用的音色名快照（S5c）—— 见 `NodeV4AudioDataSchema.voiceProfile`。 */
    voiceName: z.string().trim().min(1).max(200).optional(),
    style: z.string().trim().min(1).max(160).optional(),
    emotion: z.string().trim().min(1).max(160).optional(),
    speed: z.number().optional(),
    volume: z.number().optional(),
  }),
})

export const NodeAssistantSetReviewStateV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.setReviewState),
  target: NodeAssistantOpTargetSchema,
  url: z.string().trim().min(1).max(4000),
  state: z.enum(NODE_REVIEW_STATES),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxReasonLength)
    .optional(),
  /**
   * 「改词再来」时用户给的增补（C3c-③b 补）。
   *
   * ⚠ 与 `reason` 是两样东西，所以是两个字段：`reason` 是**为什么打回**（给人看
   * 的判断），`promptPatch` 是**下一次生成要多写的那句话**（喂给模型的输入）。
   * 打回条一直分两个框收、落库也一直是两个字段（`NodeMediaReview`）——op 表之前
   * 只带 `reason`，于是模式条改词的那一下发不成 op，只能绕回 v3 的
   * `updateNodeData`，而那正是本片要拆掉的第二条写入路径。
   */
  promptPatch: z
    .string()
    .trim()
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxPromptPatchLength)
    .optional(),
})

/* ─── 剪辑台五条（S8 · spec §6 / §8.5）──────────────────────────────────── */

/**
 * 整表替换。`project` 省略 = **清空时间线**（这个项目没进过剪辑台的样子）。
 *
 * ⚠ 「省略 = 清空」不是巧合，是为了让 inverse 精确：第一次落表之前 `state.edit`
 * 本来就不存在，撤销那一步必须能把它退回**不存在**而不是一份空表 —— 否则一次
 * 「进剪辑台又撤销」会给每个项目留下一份空 `edit`。
 */
export const NodeAssistantEditSetTimelineOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.editSetTimeline),
  project: EditProjectSchema.optional(),
})

export const NodeAssistantEditAddClipOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.editAddClip),
  track: z.enum(EDIT_TRACKS_TUPLE),
  clip: EditClipSchema,
  /** 插在第几位。省略 = 追加到尾（拖进空白处、「加入剪辑台」都是追加）。 */
  index: z.number().int().min(0).max(EDIT_TRACK_MAX_CLIPS).optional(),
})

export const NodeAssistantEditRemoveClipOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.editRemoveClip),
  track: z.enum(EDIT_TRACKS_TUPLE),
  clipId: z.string().trim().min(1).max(160),
})

/**
 * 改一段的属性（裁剪 / 倍速 / 原声 / 转场 / 增益 / 换到新版本）。
 *
 * ⚠ 是 **patch** 而不是整段替换：一次手势只动一件事（拖手柄只改 `out`），整段
 * 替换会让 inverse 存下一份与这次手势无关的快照，撤销时把用户在别处改的也一起退回。
 * `id` / `sourceNodeId` **不在 patch 里**：换来源不是「改属性」，那是删一段加一段。
 */
export const NodeAssistantEditUpdateClipOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.editUpdateClip),
  track: z.enum(EDIT_TRACKS_TUPLE),
  clipId: z.string().trim().min(1).max(160),
  patch: z.object({
    in: z.number().min(0).max(36_000).optional(),
    out: z.number().min(0).max(36_000).optional(),
    speed: z
      .number()
      .min(EDIT_CLIP_SPEED_MIN)
      .max(EDIT_CLIP_SPEED_MAX)
      .optional(),
    muted: z.boolean().optional(),
    transitionOut: z.enum(EDIT_TRANSITIONS_TUPLE).optional(),
    gain: z.number().min(0).max(2).optional(),
    /** 「上游已更新 → 一点换新」写的就是它。 */
    sourceVersionId: z.string().trim().min(1).max(160).optional(),
  }),
})

export const NodeAssistantEditMoveClipOpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.editMoveClip),
  track: z.enum(EDIT_TRACKS_TUPLE),
  clipId: z.string().trim().min(1).max(160),
  toIndex: z.number().int().min(0).max(EDIT_TRACK_MAX_CLIPS),
})

/** ⚠ 唯一扣 credit 的 op。硬确认，执行留客户端——这道结构性钱闸不能动。 */
export const NodeAssistantGenerateV4OpSchema = z.object({
  op: z.literal(NODE_ASSISTANT_OP_V4_IDS.generate),
  target: NodeAssistantOpTargetSchema,
})

export const NodeAssistantOpV4Schema = z.discriminatedUnion('op', [
  NodeAssistantReadCanvasOpSchema,
  NodeAssistantFindNodeOpSchema,
  NodeAssistantPlanRerunDownstreamOpSchema,
  NodeAssistantAddNodeV4OpSchema,
  NodeAssistantConnectV4OpSchema,
  NodeAssistantDisconnectOpSchema,
  NodeAssistantDeleteOpSchema,
  NodeAssistantMoveToShotOpSchema,
  NodeAssistantReorderShotOpSchema,
  NodeAssistantSetSlotVersionOpSchema,
  NodeAssistantMarkVersionBlockedOpSchema,
  NodeAssistantSetOutputVersionOpSchema,
  NodeAssistantSplitOutputVersionOpSchema,
  NodeAssistantSetSubtypeOpSchema,
  NodeAssistantSetTextOpSchema,
  NodeAssistantSetPromptV4OpSchema,
  NodeAssistantSetFieldOpSchema,
  NodeAssistantAttachAssetV4OpSchema,
  NodeAssistantSetModelV4OpSchema,
  NodeAssistantSetParamsV4OpSchema,
  NodeAssistantSetVoiceProfileOpSchema,
  NodeAssistantSetReviewStateV4OpSchema,
  NodeAssistantEditSetTimelineOpSchema,
  NodeAssistantEditAddClipOpSchema,
  NodeAssistantEditRemoveClipOpSchema,
  NodeAssistantEditUpdateClipOpSchema,
  NodeAssistantEditMoveClipOpSchema,
  NodeAssistantGenerateV4OpSchema,
])

export const NodeAssistantOpV4BatchSchema = z.object({
  ops: z
    .array(NodeAssistantOpV4Schema)
    .min(1)
    .max(NODE_ASSISTANT_OP_LIMITS.maxOps),
})

export type NodeAssistantOpV4 = z.infer<typeof NodeAssistantOpV4Schema>
export type NodeAssistantOpV4Batch = z.infer<
  typeof NodeAssistantOpV4BatchSchema
>

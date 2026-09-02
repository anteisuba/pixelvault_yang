/**
 * 工作台助手「操作员化」的 **schema 层**（P1）。词表在
 * `constants/assistant-operator.ts`，两个文件的分工与
 * `constants/node-assistant-ops.ts` ↔ `types/node-assistant-ops.ts` 完全同构。
 *
 * ── 三张 schema，三个方向，别混 ──────────────────────────────────
 *  ① `AssistantOperatorRequestSchema` —— **客户端 → 服务端**。带着当前表单快照。
 *  ② `AssistantOperatorTurnSchema`   —— **模型 → 服务端**。故意宽松：值域校验一律
 *     留在规划器，schema 只管形状。schema 层拒 = 模型这一轮整个作废，用户看到一句
 *     笼统的「读不出来」；规划器拒 = 那一条显示「这个工作台没有负面框」，助手还能
 *     改口。同一个禁令，后者可教（论据照抄画布 `set_image_category` 那条）。
 *  ③ `AssistantOperatorEventSchema`  —— **服务端 → 客户端**。严格：`inverse` 是
 *     服务端从快照算出来的，模型碰不到，所以这里可以、也必须写成必填。
 *
 * ── `inverse` 为什么值得在 schema 层硬性要求 ────────────────────────
 * 撤销（拍板 18）在客户端执行，靠的就是这份逆操作载荷。少一条 = 那一步撤不掉，
 * 而表现是「点了撤销没反应」—— 一种最难查的失败。写成必填之后，新加一条改动型
 * 工具却没想清楚「怎么撤」，在测试期就会被拦下来。
 */

import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX,
  ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_SEARCH_KINDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_WRITE_MODES,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import {
  LORA_CANDIDATE_NOT_IMPORTABLE_REASON_VALUES,
  LORA_CANDIDATE_SOURCE_VALUES,
} from '@/constants/lora-candidate'
import {
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_SOURCES,
} from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLES,
  NODE_REVIEW_STATES,
  NODE_STATUSES,
  NODE_TYPES,
} from '@/constants/node-types'
import { PromptAssistantResponseLanguageSchema } from '@/types'
import type { OutputTypeValue } from '@/types'
import {
  AssistantAssetFolderCandidateSchema,
  AssistantAssetFolderVisionResultSchema,
} from '@/types/asset-folder-vision'
import { LoraCandidateImportPayloadSchema } from '@/types/lora-candidate'
import { ScriptDocSchema } from '@/types/script-doc'

// ─── 小件 ────────────────────────────────────────────────────────

const IdSchema = z.string().trim().min(1).max(LIMITS.maxIdChars)
const LabelSchema = z.string().trim().min(1).max(LIMITS.maxLabelChars)
const ParamValueSchema = z.string().trim().min(1).max(LIMITS.maxParamValueChars)
/** ⚠ 允许空串：它是「这个框现在是空的」，与「没有这个框」（字段缺席）不是一回事。 */
const TextValueSchema = z.string().max(LIMITS.maxPromptChars)

// ─── 画布小件（C0）─────────────────────────────────────────────────

/**
 * 批内新建节点的别名：`new:<n>`（前缀是 `ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX`）。
 * 正则从常量拼出来，⛔ 别手写 `/^new:/` —— 前缀改了这里就会静默漂掉。
 */
const CANVAS_ALIAS_PATTERN = new RegExp(
  `^${ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX}\\d+$`,
)
export const AssistantOperatorCanvasAliasSchema = z
  .string()
  .trim()
  .max(LIMITS.maxCanvasAliasChars)
  .regex(CANVAS_ALIAS_PATTERN, {
    message: `alias must look like ${ASSISTANT_OPERATOR_CANVAS_ALIAS_PREFIX}<n>`,
  })
/**
 * 一个节点引用：真实 id **或**本轮别名。哪一种由规划器按工作副本 + 别名表判
 * （`unknownNode` / `aliasUnresolved`），schema 只管形状。
 */
const CanvasNodeRefSchema = IdSchema
/** 节点 / 参考图地址 —— 与 `NodeWorkflowReferenceAssetSchema.url` 同尺度（不是 `.url()`：画布上有 data: / blob: 地址）。 */
const CanvasUrlSchema = z.string().trim().min(1).max(LIMITS.maxCanvasUrlChars)
/** 一个档位值：档位是离散的短值（`'6'` / `'auto'` / `true` / 42）。 */
const CanvasParamValueSchema = z.union([
  ParamValueSchema,
  z.number(),
  z.boolean(),
])
/** `set_node_fields` 一次能写的值：自由文本（可空）或档位。 */
const CanvasFieldValueSchema = z.union([
  TextValueSchema,
  z.number(),
  z.boolean(),
])
/** 一批的条数：`min(1)`（空批什么都不做，与其静默不如拒）+ 上限。 */
function canvasBatch<T extends z.ZodType>(item: T) {
  return z.array(item).min(1).max(LIMITS.maxCanvasBatchItems)
}

export const AssistantOperatorCanvasNodeTypeSchema = z.enum(NODE_TYPES)
export const AssistantOperatorCanvasNodeStatusSchema = z.enum(NODE_STATUSES)
export const AssistantOperatorCanvasImageRoleSchema = z.enum(NODE_IMAGE_ROLES)
export const AssistantOperatorCanvasReferenceRoleSchema = z.enum(
  NODE_STUDIO_REFERENCE_ROLES,
)
export const AssistantOperatorCanvasReferenceSourceSchema = z.enum(
  NODE_STUDIO_REFERENCE_SOURCES,
)
export const AssistantOperatorCanvasReviewStateSchema =
  z.enum(NODE_REVIEW_STATES)

export const AssistantOperatorDomainSchema = z.enum(ASSISTANT_OPERATOR_DOMAINS)
export const AssistantOperatorToolSchema = z.enum(ASSISTANT_OPERATOR_TOOLS)
/**
 * ⚠ 这几个都直接吃**词表对象本身**（Zod 4 的 `z.enum` 收对象字面量）——
 * 不写 `Object.values(...) as [string, ...string[]]`：那个断言会把字面量类型抹成
 * `string`，于是 `z.infer` 出来的是 `string` 而不是那三个值，判别联合当场失效。
 */
export const AssistantOperatorWriteModeSchema = z.enum(
  ASSISTANT_OPERATOR_WRITE_MODES,
)
export const AssistantOperatorConfirmFieldSchema = z.enum(
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
)
/**
 * 画布域的确认字段（任务书 §2.4）：节点 `title` + `NODE_WORKFLOW_FIELDS`。
 * 确认键是 `${nodeId}:${field}`，`confirm_request` / decision 各带 `nodeId`。
 */
export const AssistantOperatorCanvasConfirmFieldSchema = z.enum(
  ASSISTANT_OPERATOR_CANVAS_CONFIRM_FIELDS,
)
/**
 * 两个域的确认字段并集 —— `confirm_request` 与 decision 上用它。
 * ⚠ `prompt` 两边都有：工作台那条没有 `nodeId`，画布那条必带；分辨靠 `nodeId` 在不在。
 */
export const AssistantOperatorAnyConfirmFieldSchema = z.union([
  AssistantOperatorConfirmFieldSchema,
  AssistantOperatorCanvasConfirmFieldSchema,
])
export const AssistantOperatorConfirmChoiceSchema = z.enum(
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
)
export const AssistantOperatorRejectReasonSchema = z.enum(
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
)
export const AssistantOperatorStopReasonSchema = z.enum(
  ASSISTANT_OPERATOR_STOP_REASONS,
)
export const AssistantOperatorStepStatusSchema = z.enum(
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
)
/**
 * ⚠ `satisfies` 是这里唯一的用处：把「操作员能搜的类型」钉成
 * `OUTPUT_TYPE_VALUES` 的真子集。哪天媒体类型词表改名，这一行编译期就红。
 */
export const AssistantOperatorSearchKindSchema = z.enum(
  ASSISTANT_OPERATOR_SEARCH_KINDS satisfies readonly OutputTypeValue[],
)

// ─── ① 客户端表单快照 ────────────────────────────────────────────
//
// **`read_state` 的数据源就是它，服务端一个字段都不查库。** 库里没有「用户此刻
// 在输入框里打了一半的字」，而那恰恰是就地确认要判的东西（拍板 3）。
//
// ⚠ 贯穿全表的一条规矩：**某一节缺席 = 这个工作台没有那个控件**，不是「有但空
// 着」。图片台没有负面框就是这一档（2026-08-22 真机实证，见
// `lib/assistant-workbench-state.ts` 里同一段注释）。缺席时对应的工具按
// `noSuchControl` 拒 —— 这就是拍板 19「助手只动用户看得见的旋钮」的落地方式，
// 也是台账 BJ（参考强度没有控件）自动被兜住的原因。

export const AssistantOperatorSnapshotModelSchema = z.object({
  id: IdSchema,
  label: LabelSchema.optional(),
})

export const AssistantOperatorSnapshotSpecsSchema = z.object({
  /** 现值。`null` = 控件在但还没选。 */
  aspectRatio: ParamValueSchema.nullable(),
  resolution: ParamValueSchema.nullable(),
  /**
   * 能选什么。⛔ 空表不等于「随便填」——与画布 `set_params` 同一条：不给可选列表，
   * 模型只会编一个。
   * ⚠ 空表时 `set_specs` 在**进 args schema 之前**就被拒（`planSpecsPrecondition`）：
   * 这两个字段都是必填非空串，空表下模型填什么都过不了，拒晚一步用户就只能看到
   * 一条学不会的 `malformedArgs`。理由按成因分岔 —— 没选模型 → `noModelSelected`，
   * 这台工作台就是没有这组档位 → `noSuchControl`。
   */
  aspectRatioOptions: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions),
  resolutionOptions: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions),
})

/**
 * 视频档的规格三格（P4-A）。
 *
 * ⚠ 与图片的 `specs` **分开一张 schema**，不是给它加两个可选字段：
 * 两边的必填规则相反。图片档比例与清晰度必须同时给（台账 AE/BG/BS）；视频档的
 * 三个参数是 provider 的三个独立字段，而且**逐型号有无** —— Kling V3 Pro 与
 * MiniMax H3 的契约里 `parameters.resolution === false`，HappyHorse 连
 * `duration` 都没有（`constants/video-model-send-plan.ts`）。合成一张 schema 就
 * 得把必填全放开，图片档那条硬性要求当场失效。
 *
 * ⚠ 三个「现值」都可以是 `null`：`resolution` 是用户主动清掉的（再点一次 = 交给
 * provider 默认，界面上真有这条出路）；另两个是「档位表空 / 还没选模型」。
 * ⚠ 三张档位表**都可能是空的**，空的那格 = 这个型号不吃这个参数。三张全空时
 * 整个 `videoSpecs` 节缺席（那时界面上的规格浮层也整块不渲染）。
 */
export const AssistantOperatorSnapshotVideoSpecsSchema = z.object({
  durationSeconds: z.number().int().positive().nullable(),
  aspectRatio: ParamValueSchema.nullable(),
  resolution: ParamValueSchema.nullable(),
  durationOptions: z
    .array(z.number().int().positive())
    .max(LIMITS.maxSpecOptions),
  aspectRatioOptions: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions),
  resolutionOptions: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions),
})

/**
 * 视频的**音频参考位**（P4-A，台账 A）。
 *
 * ⚠ `limit` 来自**选中线路**的契约（`slots.audio`），不是一个写死的数 ——
 * 没选模型时是 0，那时界面上那个面板也只给一句「先选模型」。
 * ⚠ `requiresVisual` 同样**按线路不按模型**：同一个 Seedance 2.5，火山 / BytePlus
 * 允许纯音频参考，fal 那条不允许（`video-model-send-plan.ts` 里两条相反的声明）。
 * 它进快照是为了让助手在只挂音频时**先去挂一张图**，而不是等用户点了生成才被
 * 服务端 400 顶回来。
 */
export const AssistantOperatorSnapshotAudioReferenceSchema = z.object({
  url: z.string().url(),
  label: LabelSchema.optional(),
  /** 这段声音属于哪个角色（界面上那颗 `AudioOwnerPicker`）。 */
  ownerName: LabelSchema.optional(),
})

export const AssistantOperatorSnapshotAudioReferencesSchema = z.object({
  items: z
    .array(AssistantOperatorSnapshotAudioReferenceSchema)
    .max(LIMITS.maxSnapshotReferences),
  limit: z.number().int().nonnegative(),
  requiresVisual: z.boolean(),
})

/**
 * 视频**出不出声**的三态（P4-A）。
 *
 * ⚠ `value: null` = 用户没设过，最终值落到模型目录的默认；`effective` 就是那个
 * 「现在实际是什么」—— 界面上的开关显示的正是它。两个都给是因为**它们回答的是
 * 不同的问题**：助手要知道「用户表过态没有」（表过就别乱改），也要知道「现在
 * 到底响不响」（用户说「静音」时，本来就没声就不必白花一步）。
 */
export const AssistantOperatorSnapshotSoundSchema = z.object({
  value: z.boolean().nullable(),
  effective: z.boolean(),
})

export const AssistantOperatorSnapshotCountSchema = z.object({
  value: z.number().int().positive(),
  /** 本仓是 `IMAGE_BATCH_COUNTS`（1/2/4）。⚠ 别在这里抄一份常量，档位由宿主给。 */
  options: z.array(z.number().int().positive()).min(1),
})

export const AssistantOperatorSnapshotReferenceSchema = z.object({
  /** 素材库里的 id；用户临时上传的没有 id，只有 URL。 */
  assetId: IdSchema.optional(),
  url: z.string().url(),
  label: LabelSchema.optional(),
})

export const AssistantOperatorSnapshotReferencesSchema = z.object({
  items: z
    .array(AssistantOperatorSnapshotReferenceSchema)
    .max(LIMITS.maxSnapshotReferences),
  /** 这个模型的参考图槽位数。已满时 `mount_reference` 按 `referencesFull` 拒。 */
  limit: z.number().int().nonnegative(),
})

/**
 * 装配台上**已经挂着的一把**（P4-C）。
 *
 * ⚠ `id` 是**库记录 id**（`LoraAssetRecord.id`），不是检索候选的 `candidateId` ——
 * 两者是不同的东西：候选来自 Civitai/HF，挂载项来自用户自己的库。`unmount_lora` /
 * `set_lora_weight` 收的是这个 id，`mount_lora` 收的是那个。合成一个的表现是助手
 * 拿候选 id 去调摘除，然后连着撞两条拒绝。
 * ⚠ `enabled` 是界面上那颗启停开关：`false` = 留在栈里但**这次不送去出图**
 * （`handleGenerate` 里那条 `.filter(entry => entry.enabled !== false)`）。助手要知道
 * 它，否则会对着一把被按住的 LoRA 调权重然后奇怪为什么画面没变。
 */
export const AssistantOperatorSnapshotLoraSchema = z.object({
  id: IdSchema,
  name: LabelSchema,
  weight: z.number(),
  enabled: z.boolean(),
  /** 这把 LoRA 的底模家族（`sdxl` / `anima-dit` / `flux`…）。null = 库里没记。 */
  family: ParamValueSchema.nullable(),
  /**
   * 与当前底模**架构对不对得上**。
   *
   * ⭐ 判据来自既有的 `isLoraBaseModelMountCompatible` —— ⛔ 别在提示词里让模型
   * 自己按名字猜：Civitai 的 DiT 枚举值就叫 `"Anima"`，而 "Anima Pencil XL" /
   * "Animagine" 报的是 `"SDXL 1.0"`，按子串猜必错（那条判据在
   * `constants/lora-base-models.ts` 里是**精确相等**而不是 includes）。
   */
  compatible: z.boolean(),
})

/**
 * 装配台的**挂载栈**（P4-C）。
 *
 * ⚠ **缺席 = 这个工作台没有挂载栈**（图片 / 视频档就是这一档：`LoraStackProvider`
 * 只包 `/studio/lora`）。⛔ 不是「有但空着」—— 空着是 `items: []`。
 * ⛔ **故意没有 `limit`**：本仓三个后端全不限挂载数，服务端不读 maxLoras 是故意的。
 * 摆一个 limit 在这里，下一个人就会照着 `references.limit` 的样子加一条
 * 「挂满了」的拒绝 —— 那是把一条产品决定反着实现一遍。
 */
export const AssistantOperatorSnapshotLorasSchema = z.object({
  items: z
    .array(AssistantOperatorSnapshotLoraSchema)
    .max(LIMITS.maxSnapshotReferences),
  /** 当前底模的家族 —— 检索时按它做**软偏好**排序（不是硬过滤）。 */
  baseFamily: ParamValueSchema.nullable(),
  /** 权重值域，与 `[[lora]]` 推荐块共用同一对数（见词表 `setLoraWeight`）。 */
  minWeight: z.number(),
  maxWeight: z.number(),
})

// ─── ① 画布快照节（C0，任务书 §2.2）──────────────────────────────
//
// 与工作台各节同一条规矩：**控件不在整个键不给**，⛔ 别 `?? null`。
// 字段名一律取自 `types/node-workflow.ts` / `constants/node-types.ts`，不另起名。

/** 引用架上的一条（`NodeWorkflowReferenceAssetSchema` 的投影：只带助手要看的）。 */
export const AssistantOperatorCanvasReferenceSchema = z.object({
  id: IdSchema,
  role: AssistantOperatorCanvasReferenceRoleSchema,
  /** 来自画布另一个节点时是那个节点的 id（`source === 'canvas'`）。 */
  sourceId: IdSchema.optional(),
  /**
   * ⭐ URL **进快照、不进首轮提示**（K-4 根治）：`read_node` 从工作副本按需取，
   * `read_graph` 级概览与系统提示一个字都不带它（测试两向断言）。
   */
  url: CanvasUrlSchema,
})

/** 节点上选的模型 —— **modelId 与 optionId（渠道）成对**（K-3）。 */
export const AssistantOperatorCanvasModelSchema = z.object({
  modelId: IdSchema,
  optionId: z.string().trim().min(1).max(LIMITS.maxCanvasOptionIdChars),
})

/**
 * 角色卡 / 场景卡的**外观字段** —— 取自 `NodeWorkflowNodeDataSchema.character`
 * （`name` / `visualSeed`）与 `cardId`。⚠ 缺席 = 这个节点不是身份卡。
 * 与 URL 同一条规矩：只经 `read_node` 取，不进首轮提示。
 */
export const AssistantOperatorCanvasCharacterSchema = z.object({
  name: LabelSchema.optional(),
  visualSeed: TextValueSchema.optional(),
  cardId: IdSchema.optional(),
})

export const AssistantOperatorCanvasNodeSchema = z.object({
  id: IdSchema,
  type: AssistantOperatorCanvasNodeTypeSchema,
  /** 画布上显示的那个名字（`resolveNodeDisplayName`），不是类型标签。 */
  title: z.string().trim().min(1).max(LIMITS.maxIdChars),
  status: AssistantOperatorCanvasNodeStatusSchema,
  /** 统一 `image` 节点的角色；其它类型缺席。 */
  role: AssistantOperatorCanvasImageRoleSchema.optional(),
  /** 散图节点自己的分类；缺席 = 这个节点没有分类控件，或还没设。 */
  imageCategory: AssistantOperatorCanvasReferenceRoleSchema.optional(),
  imageCategoryLabel: LabelSchema.optional(),
  /**
   * 这个节点**真有**的自由文本字段现值（`NODE_WORKFLOW_FIELDS_BY_NODE_TYPE` /
   * `_BY_IMAGE_ROLE` 那张族表里的键 + `prompt`）。⚠ 键不在 = 这个节点没有那一栏；
   * 值为空串 = 有栏但空着（覆写确认只看非空的，拍板 3）。
   */
  fields: z.record(z.string(), TextValueSchema),
  /** 缺席 = 这个节点不选模型（身份卡 / 参考视频 / 合并节点）；在但没选由规划器按 `noModelSelected` 说。 */
  model: AssistantOperatorCanvasModelSchema.nullable().optional(),
  /** 生成档位（`NODE_ASSISTANT_PARAM_IDS` 那几个键）。缺席 = 这类节点档位不长在节点上。 */
  params: z.record(z.string(), CanvasParamValueSchema).optional(),
  references: z
    .array(AssistantOperatorCanvasReferenceSchema)
    .max(LIMITS.maxCanvasNodeReferences),
  character: AssistantOperatorCanvasCharacterSchema.optional(),
  /** 节点自己的主媒体地址 —— `attach_refs` 从画布节点挂参考时服务端从这里取 URL。 */
  mediaUrl: CanvasUrlSchema.optional(),
  /** 主媒体的审核态（`mediaReview[mediaUrl].state`）。缺席 = 没有审核记录（祖父条款 = 通过）。 */
  reviewState: AssistantOperatorCanvasReviewStateSchema.optional(),
})

export const AssistantOperatorCanvasEdgeSchema = z.object({
  id: IdSchema,
  source: IdSchema,
  target: IdSchema,
})

/**
 * 模型目录的一行（附录 D §7）：**按 nodeType 列，modelId + optionId 成对**。
 * `set_node_model` 只认表内组合：modelId 不在表里拒 `unknownModel`，modelId 在而
 * optionId 对不上拒 `missingChannel`。⚠ 只放用户此刻真能跑的渠道（绑了 key 或
 * 平台出资）—— 与工作台 `availableModels` 同一条判据。
 * `priceLabel` 是宿主算好的相对价签（展示用短字符串）；缺席 = 宿主没算。
 */
export const AssistantOperatorCanvasModelOptionSchema = z.object({
  nodeType: AssistantOperatorCanvasNodeTypeSchema,
  modelId: IdSchema,
  optionId: z.string().trim().min(1).max(LIMITS.maxCanvasOptionIdChars),
  label: LabelSchema,
  priceLabel: LabelSchema.optional(),
})

export type AssistantOperatorCanvasModelOption = z.infer<
  typeof AssistantOperatorCanvasModelOptionSchema
>

export const AssistantOperatorSnapshotCanvasSchema = z.object({
  projectId: IdSchema,
  projectName: z.string().trim().max(LIMITS.maxIdChars),
  selectedNodeIds: z.array(IdSchema).max(LIMITS.maxCanvasNodes),
  nodes: z.array(AssistantOperatorCanvasNodeSchema).max(LIMITS.maxCanvasNodes),
  edges: z.array(AssistantOperatorCanvasEdgeSchema).max(LIMITS.maxCanvasEdges),
  /** 空数组 = 这张画布上此刻没有一条能跑的模型渠道（`set_node_model` 全拒）。 */
  modelOptions: z
    .array(AssistantOperatorCanvasModelOptionSchema)
    .max(LIMITS.maxCanvasModelOptions),
  /** C3 填内容，C0 留位。缺席 = 这个项目没有 ScriptDoc。 */
  scriptDoc: z
    .object({
      summary: z.string().max(LIMITS.maxCanvasScriptDocSummaryChars),
    })
    .optional(),
})

export type AssistantOperatorCanvasNode = z.infer<
  typeof AssistantOperatorCanvasNodeSchema
>
export type AssistantOperatorCanvasEdge = z.infer<
  typeof AssistantOperatorCanvasEdgeSchema
>
export type AssistantOperatorCanvasReference = z.infer<
  typeof AssistantOperatorCanvasReferenceSchema
>
export type AssistantOperatorSnapshotCanvas = z.infer<
  typeof AssistantOperatorSnapshotCanvasSchema
>

/**
 * 画布图的**工作副本**（与 service 里的 `OperatorWorkingState` 平行，⛔ 不塞进它
 * 的表单字段里）。`inverse` 以副本当下值为准：第二条改动撤回到第一条之后。
 *
 * ⚠ 它是**运行态**，不是线上的载荷，所以没有 zod schema：`aliases` 是一张
 * `Map`（别名 → 本轮 `stage_nodes` 造出的节点），线上不会出现。三个成员的元素
 * 类型全部从上面的 zod 推导，不另写一份形状。
 * ⚠ `nodes` / `edges` 必须是**可变拷贝**：`stage_nodes` 往里推、`set_node_fields`
 * 改现值，都发生在这份副本上。
 */
export interface CanvasWorkingState {
  projectId: string
  projectName: string
  selectedNodeIds: string[]
  nodes: AssistantOperatorCanvasNode[]
  edges: AssistantOperatorCanvasEdge[]
  /** `new:<n>` → 本轮建出的节点（真实 id 由客户端 apply 时分配，这里只有别名）。 */
  aliases: Map<string, AssistantOperatorCanvasNode>
  scriptDocSummary: string | null
}

export const AssistantOperatorSnapshotSchema = z.object({
  /**
   * 正面提示词现值。空串 = 空框（随便填，拍板 3）；非空 = 用户手写内容，写它要先确认。
   * ⚠ 可选（附录 D §1）：画布宿主**不发**它（画布上没有「这台工作台的提示词框」，
   * 每一格都是某个节点的）；工作台三域照常必发，service 对缺席按空串处理。
   */
  prompt: TextValueSchema.optional(),
  /** ⚠ 缺席 = 这个工作台没有负面框。见本节头注。 */
  negativePrompt: TextValueSchema.optional(),
  /** `null` = 明确「还没选模型」；缺席 = 这个工作台不选模型。两者不同。 */
  model: AssistantOperatorSnapshotModelSchema.nullable().optional(),
  /**
   * 现在**能切**到哪些模型。只放用户真的能跑的（绑了 key 或平台出资）——
   * 推荐一个跑不了的等于把人推去配置页，那不是帮忙。
   */
  availableModels: z
    .array(AssistantOperatorSnapshotModelSchema.extend({ label: LabelSchema }))
    .max(LIMITS.maxAvailableModels)
    .default([]),
  specs: AssistantOperatorSnapshotSpecsSchema.optional(),
  /** ⚠ 视频档的规格。与 `specs` **互斥** —— 两个都在就是构造快照的人写错了。 */
  videoSpecs: AssistantOperatorSnapshotVideoSpecsSchema.optional(),
  count: AssistantOperatorSnapshotCountSchema.optional(),
  references: AssistantOperatorSnapshotReferencesSchema.optional(),
  /** ⚠ 缺席 = 这个工作台挂不了音频参考（图片档、或视频档但线路不吃音频）。 */
  audioReferences: AssistantOperatorSnapshotAudioReferencesSchema.optional(),
  /** ⚠ 缺席 = 这条线路没有「出不出声」这个开关（界面上那颗 Switch 也不渲染）。 */
  sound: AssistantOperatorSnapshotSoundSchema.optional(),
  /** ⚠ 缺席 = 这个工作台没有 LoRA 挂载栈（图片 / 视频档）。见 schema 头注。 */
  loras: AssistantOperatorSnapshotLorasSchema.optional(),
  /**
   * 节点画布（C0，§2.2）。⚠ 缺席 = 这不是画布域的请求；`domain: 'canvas'` 而这节
   * 缺席，画布工具一律按 `noSuchControl` 拒（规划器判）。
   */
  canvas: AssistantOperatorSnapshotCanvasSchema.optional(),
})

export type AssistantOperatorSnapshot = z.infer<
  typeof AssistantOperatorSnapshotSchema
>

// ─── ① 请求 ─────────────────────────────────────────────────────

export const AssistantOperatorMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

/**
 * 上一轮已经跑完的步骤摘要。
 *
 * ⚠ **这条链没有服务端会话态**，这是打断语义得以成立的原因（拍板 13：打断 =
 * 客户端 abort + 带新消息重发）。代价是「刚才做过什么」必须由客户端带回来，
 * 否则助手被插话后会忘记自己已经改过提示词，然后再改一遍。
 * 就地确认（拍板 3）复用同一条通道 —— 那也是一次「带上下文重发」。
 */
export const AssistantOperatorPriorStepSchema = z.object({
  tool: AssistantOperatorToolSchema,
  status: AssistantOperatorStepStatusSchema,
  summary: z.string().trim().max(LIMITS.maxPriorStepSummaryChars),
})

export const AssistantOperatorConfirmDecisionSchema = z.object({
  field: AssistantOperatorAnyConfirmFieldSchema,
  choice: AssistantOperatorConfirmChoiceSchema,
  /**
   * 画布域的复合键另一半（§2.4）：decision 按 `${nodeId}:${field}` 存。
   * 工作台三域缺席 —— 那里一个域只有一个提示词框。
   */
  nodeId: IdSchema.optional(),
})

/**
 * 「助手备的那一次生成」刚刚跑完的结果（P3-C，拍板 4）。
 *
 * ⭐ **这个字段的在场与否就是拍板 4 本身**：客户端只在归属追踪认定这一次生成
 * 是助手 primed 的那一枪时才带它上来（`lib/studio-operator-claim.ts`）。用户
 * 自己点的生成永远不填这里，于是「不打扰」在结构上成立 —— 服务端没有别的路
 * 能拿到一张结果图，`critique_result` 也就无从被误用。
 *
 * ⚠ 与 `AssistantOperatorSnapshotReference` 分开：那是**挂在表单上的参考图**
 * （输入），这是**刚出炉的产物**（输出）。合成一个的表现是助手把自己刚评过的
 * 那张图当成参考图去数槽位。
 */
export const AssistantOperatorResultSchema = z.object({
  /** 结果图的 https 地址 —— 视觉那一跳吃的就是它。 */
  url: z.string().url(),
  /** 卡片上画的那张缩略图；缺席时回落到 `url`。 */
  thumbnailUrl: z.string().url().optional(),
  /** 库里的 generation id —— 只用于日志归因，模型碰不到它。 */
  generationId: IdSchema.optional(),
  /** 出它的那个模型（卡片与观察里都要说清楚是谁画的）。 */
  modelLabel: LabelSchema.optional(),
  /** 当时用的提示词（截断）—— 评价要对着「想要什么」说，不是对着一张孤图说。 */
  prompt: z.string().max(LIMITS.maxPromptChars).optional(),
})

export type AssistantOperatorResult = z.infer<
  typeof AssistantOperatorResultSchema
>

/**
 * 视觉那一跳的产出（**模型 → 服务端**，与 `AssistantOperatorTurnSchema` 同一档）。
 *
 * ⚠ 故意不含图片地址：地址是服务端填的，模型只负责说它看见了什么。
 */
export const AssistantOperatorCritiqueSchema = z.object({
  findings: z
    .array(
      z.object({
        /** `true` = 这一条达成了；`false` = 没达成（卡片上那个 ✗）。 */
        ok: z.boolean(),
        text: z.string().trim().min(1).max(LIMITS.maxCritiqueFindingChars),
      }),
    )
    .min(1)
    .max(LIMITS.maxCritiqueFindings),
  /** 下一轮该怎么改，一句话。⚠ 允许 `null`：确实挺好时不硬编一条建议。 */
  advice: z.string().trim().max(LIMITS.maxCritiqueAdviceChars).nullish(),
})

export type AssistantOperatorCritique = z.infer<
  typeof AssistantOperatorCritiqueSchema
>

export const AssistantOperatorRequestSchema = z.object({
  messages: z.array(AssistantOperatorMessageSchema).min(1),
  domain: AssistantOperatorDomainSchema,
  snapshot: AssistantOperatorSnapshotSchema,
  priorSteps: z
    .array(AssistantOperatorPriorStepSchema)
    .max(LIMITS.maxPriorSteps)
    .optional(),
  /**
   * 用户对就地确认小条的回答。**每个字段最多一条**，重发时原样带回来。
   * 没有它时，遇到有手写内容的字段就再问一次 —— 幂等，且不会静默覆盖。
   */
  confirmations: z
    .array(AssistantOperatorConfirmDecisionSchema)
    .max(LIMITS.maxConfirmDecisions)
    .optional(),
  /**
   * 助手备的那一枪刚打完（P3-C）。缺席 = 这一轮没有东西可看，
   * `critique_result` 按 `noResultToCritique` 拒。见 schema 头注。
   */
  result: AssistantOperatorResultSchema.optional(),
  /** 用户在设置里选的 LLM key；缺省走 `resolveLlmTextRoute` 的优先级。 */
  apiKeyId: z.string().optional(),
  /** 用户选的 LLM 档位（非生成模型），服务端对表校验。 */
  llmModelId: z.string().optional(),
  /**
   * 助手说话用哪种语言。⚠ 复用现有助手那张三值表，不另立词表 —— 同一个助手
   * 换个面板不该换一套语言 id。
   */
  responseLanguage: PromptAssistantResponseLanguageSchema.optional(),
})

export type AssistantOperatorRequest = z.infer<
  typeof AssistantOperatorRequestSchema
>

// ─── ② 模型这一轮写的东西 ────────────────────────────────────────

/**
 * 每个工具的入参，**模型视角**。
 *
 * ⚠ 一律宽松：`modelId` 是 `string` 不是 `enum(availableModels)`，比例是 `string`
 * 不是枚举。值域全部在规划器收窄（`services/kernel/assistant-operator.service.ts`），
 * 理由见文件头注 ②。
 * 写成 `Record<AssistantOperatorTool, …>`：工具表加一条而这里没跟上，编译期就红。
 */
export const ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS: Record<
  AssistantOperatorTool,
  z.ZodType
> = {
  [ASSISTANT_OPERATOR_TOOL_IDS.readState]: z.object({}),
  [ASSISTANT_OPERATOR_TOOL_IDS.searchAssets]: z.object({
    query: z.string().trim().min(1).max(LIMITS.maxSearchQueryChars),
    kind: AssistantOperatorSearchKindSchema.optional(),
    limit: z.number().int().positive().max(LIMITS.maxSearchResults).optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders]: z.object({
    query: z.string().trim().min(1).max(LIMITS.maxFolderQueryChars),
    limit: z.number().int().positive().max(LIMITS.maxFolderMatches).optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder]: z.object({
    /** ⛔ 只能来自本轮 `list_asset_folders`，规划器再做一次准入校验。 */
    folderId: IdSchema,
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.maxFolderVisionInstructionChars)
      .optional(),
  }),
  /**
   * ⚠ 只有一个查询词 —— **没有 `site:` / 域名过滤这类旋钮**。多给一个参数就是多
   * 一件模型会写错的东西，而联网搜图的召回质量靠的是查询词本身（系统提示里让它
   * 写短英文）。将来要接第二路召回（Wikimedia / Met）那是服务端的分派，不是这里
   * 多一个字段。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages]: z.object({
    query: z.string().trim().min(1).max(LIMITS.maxWebImageQueryChars),
    limit: z
      .number()
      .int()
      .positive()
      .max(LIMITS.maxWebImageResults)
      .optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]: z.object({
    /** ⛔ 只有 id，没有 URL —— URL 由服务端从本轮检索结果里查出来填。 */
    assetId: IdSchema,
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.setModel]: z.object({ modelId: IdSchema }),
  [ASSISTANT_OPERATOR_TOOL_IDS.setPrompt]: z.object({
    value: z.string().trim().max(LIMITS.maxPromptChars),
    mode: AssistantOperatorWriteModeSchema.optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: z.object({
    value: z.string().trim().max(LIMITS.maxPromptChars),
    mode: AssistantOperatorWriteModeSchema.optional(),
  }),
  /** ⚠ 台账 AE/BG/BS：两个字段一起下，缺一个就不是真比例。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: z.object({
    aspectRatio: ParamValueSchema,
    resolution: ParamValueSchema,
  }),
  /**
   * 视频规格三格（P4-A）。
   *
   * ⚠ 三个字段**全是可选**，与图片那条相反 —— 理由见
   * `AssistantOperatorSnapshotVideoSpecsSchema` 的头注：逐型号有无，
   * 写成必填就等于在 Kling / MiniMax H3 上把这条工具变成无解。
   * ⚠ 「至少给一个」与「给的那个必须在档位表里」都留在规划器
   * （本文件头注 ②：schema 拒 = 整轮读不出来，规划器拒 = 助手读得到理由）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs]: z.object({
    durationSeconds: z.number().optional(),
    aspectRatio: ParamValueSchema.optional(),
    resolution: ParamValueSchema.optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: z.object({ count: z.number() }),
  [ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference]: z.object({
    /** ⛔ 同 `mount_reference`：只有 id，URL 由服务端从本轮检索结果里查出来填。 */
    assetId: IdSchema,
    /** 这段声音属于哪个角色 —— 界面上那颗归属选择器允许自由文本，所以这里也是。 */
    ownerName: LabelSchema.optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.setSound]: z.object({ enabled: z.boolean() }),
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: z.object({}),
  /**
   * ⛔ **没有图片地址这个参数** —— 地址来自请求里的 `result`（拍板 4 的归属
   * 追踪填的），模型给不出、也不许给。它唯一能写的是「这一轮本来想要什么」，
   * 让视觉那一跳有个对照物；不写就用线程里的提示词兜底。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]: z.object({
    goal: z.string().trim().max(LIMITS.maxCritiqueGoalChars).optional(),
  }),
  /**
   * 用户亲手递来的那条地址（P3-D，拍板 22）。
   *
   * ⚠ 这里**只管形状**（像不像一条 http(s) 地址），「是不是用户给的」由规划器逐字
   * 比对用户消息（`urlNotFromUser`）—— 与本文件头注 ② 同一条：值域校验留在规划器，
   * 因为 schema 拒 = 整轮读不出来，规划器拒 = 日志上写着为什么、助手还能改口。
   * ⚠ `.url()` 放行 `ftp:` / `file:` 这类协议，所以补一道协议闸：非 http(s) 的地址
   * 客户端那条导入路由根本取不到（它自己也只允许这两种），拦在这里省一步。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl]: z.object({
    url: z
      .string()
      .trim()
      .max(LIMITS.maxUserUrlChars)
      .url()
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'url must be http(s)',
      }),
  }),
  /**
   * ⚠ 只有一个查询词，理由与 `search_web_images` 同源：多一个参数就是多一件模型会
   * 写错的东西。底模家族**不由模型给** —— 服务端从快照里现取（那是「用户此刻选的
   * 底模」，模型没有理由比快照更清楚）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchLoras]: z.object({
    query: z.string().trim().min(1).max(LIMITS.maxLoraQueryChars),
    limit: z.number().int().positive().max(LIMITS.maxLoraResults).optional(),
  }),
  /**
   * ⛔ 只有 candidateId 与一个权重，**没有名字 / 地址 / 底模**：那些全由服务端从
   * 本轮检索结果里查出来填（同 `mount_reference`）。
   * ⚠ `weight` 可选：不给就用候选自带的推荐值 / 资产默认值 —— 编一个数不如不编。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.mountLora]: z.object({
    candidateId: IdSchema,
    weight: z.number().optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.unmountLora]: z.object({ loraId: IdSchema }),
  /**
   * ⚠ 值域（0.1–2）**留在规划器**收窄，不写进 schema —— 与本文件头注 ② 同一条：
   * schema 拒 = 整轮读不出来，规划器拒 = 日志上写着「权重得在 0.1 到 2 之间」，
   * 助手还能改口再来一次。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight]: z.object({
    loraId: IdSchema,
    weight: z.number(),
  }),
  // ── 画布域（C0）。一律宽松：type / field / state / role 都是 string，值域在规划器收窄。
  [ASSISTANT_OPERATOR_TOOL_IDS.readGraph]: z.object({}),
  [ASSISTANT_OPERATOR_TOOL_IDS.readNode]: z.object({
    nodeId: CanvasNodeRefSchema,
  }),
  /**
   * 一步一批。`alias` 可选：模型没给时服务端按顺序补 `new:<n>`，所以载荷里永远有。
   * `type` 是 `string` 不是 `enum(NODE_TYPES)`：写错一个类型不该让同批其它节点陪葬
   * （`unknownNodeType` 只点名那一项）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.stageNodes]: z.object({
    items: canvasBatch(
      z.object({
        alias: AssistantOperatorCanvasAliasSchema.optional(),
        type: IdSchema,
        role: IdSchema.optional(),
        title: z.string().trim().min(1).max(LIMITS.maxIdChars).optional(),
        fields: z.record(z.string(), TextValueSchema).optional(),
      }),
    ),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.connectNodes]: z.object({
    items: canvasBatch(
      z.object({ source: CanvasNodeRefSchema, target: CanvasNodeRefSchema }),
    ),
  }),
  /**
   * 按节点分组的字段写入。`fields` 的键是 `title` / 自由文本字段 / `imageCategory` /
   * 档位名 —— 哪些键这个节点真有，规划器按族表查（`unknownField`）。
   * `mode` 只对自由文本有意义（追加 / 替换），档位一律替换。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields]: z.object({
    items: canvasBatch(
      z.object({
        nodeId: CanvasNodeRefSchema,
        fields: z.record(z.string(), CanvasFieldValueSchema),
        mode: AssistantOperatorWriteModeSchema.optional(),
      }),
    ),
  }),
  /** ⛔ `optionId` **必填**（K-3 根治）：缺渠道整步拒，不由服务端「挑第一条能跑的」。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel]: z.object({
    nodeId: CanvasNodeRefSchema,
    modelId: IdSchema,
    optionId: z.string().trim().min(1).max(LIMITS.maxCanvasOptionIdChars),
  }),
  /**
   * 每条参考**二选一**：`sourceId`（画布节点，取它的主媒体）或 `assetId`
   * （本轮 `search_assets` 返回过的）。⛔ 没有 URL 字段。「至少给一个、不能都给」
   * 留在规划器判（`malformedArgs` 学不会，`unknownNode` / `unknownAsset` 学得会）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.attachRefs]: z.object({
    nodeId: CanvasNodeRefSchema,
    refs: canvasBatch(
      z.object({
        sourceId: CanvasNodeRefSchema.optional(),
        assetId: IdSchema.optional(),
        role: IdSchema.optional(),
      }),
    ),
  }),
  /** `state` 收全部三态（含 `approved`），规划器按 `approvedForbidden` 拒 —— 同一个禁令，可教的那种。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]: z.object({
    nodeId: CanvasNodeRefSchema,
    state: IdSchema,
    reason: z.string().trim().min(1).max(LIMITS.maxReasonChars).optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate]: z.object({
    nodeId: CanvasNodeRefSchema,
  }),
  /** C3 实现。整份文档下发；投影仍走 `previewScriptDocProjection` + 既有确认门。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc]: z.object({
    doc: ScriptDocSchema,
  }),
}

export const AssistantOperatorTurnSchema = z.object({
  /** 计划条，只在第一轮有意义。 */
  plan: z
    .array(z.string().trim().min(1).max(LIMITS.maxPlanItemChars))
    .max(LIMITS.maxPlanItems)
    .optional(),
  /** 说给用户听的话。 */
  message: z.string().max(LIMITS.maxMessageChars).optional(),
  tool: z
    .object({
      name: AssistantOperatorToolSchema,
      /**
       * 日志条上的一行标题。
       *
       * ⚠ **可选**，服务端漏了就用工具名兜底。写成必填的代价太大：模型少写一个
       * 装饰性字段，整轮输出就作废、退化成一次「读不出来」的重试 —— 一个标题不值
       * 一步（每步都是一次 LLM 往返）。同理 `args` 收 null。
       */
      title: z.string().trim().min(1).max(LIMITS.maxTitleChars).optional(),
      /** 为什么这么做 —— 拍板 18 的日志详情里展示。 */
      reason: z.string().trim().max(LIMITS.maxReasonChars).optional(),
      args: z
        .record(z.string(), z.unknown())
        .nullish()
        .transform((value) => value ?? {}),
    })
    .optional(),
  /** 模型认为活干完了。没有 `tool` 时等价于 true。 */
  finished: z.boolean().optional(),
})

export type AssistantOperatorTurn = z.infer<typeof AssistantOperatorTurnSchema>

// ─── ③ 服务端吐给客户端的 step ───────────────────────────────────

const STEP_BASE_SHAPE = {
  /** 同一步的 `running` 与 `done` 共用一个 id —— 客户端按 id 覆盖，不追加。 */
  id: z.string().trim().min(1).max(LIMITS.maxIdChars),
  title: z.string().trim().min(1).max(LIMITS.maxTitleChars),
  reason: z.string().trim().max(LIMITS.maxReasonChars).optional(),
}

const OK_STATUS_SCHEMA = z.enum([
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS.done,
])

/** 读类工具：没有 op，也就没有 `inverse`。`result` 在 `running` 阶段为 `null`。 */
function readStep<
  T extends AssistantOperatorTool,
  P extends z.ZodType,
  R extends z.ZodType,
>(tool: T, payload: P, result: R) {
  return z.object({
    ...STEP_BASE_SHAPE,
    tool: z.literal(tool),
    status: OK_STATUS_SCHEMA,
    payload,
    result: result.nullable(),
  })
}

/**
 * 改动型工具：`payload` 是客户端要应用的 op，`inverse` 是撤销它的载荷。
 * **两个都是必填** —— 这个函数签名就是那条硬性要求本身。
 */
function mutatingStep<
  T extends AssistantOperatorTool,
  P extends z.ZodType,
  I extends z.ZodType,
>(tool: T, payload: P, inverse: I) {
  return z.object({
    ...STEP_BASE_SHAPE,
    tool: z.literal(tool),
    status: OK_STATUS_SCHEMA,
    payload,
    inverse,
  })
}

export const AssistantOperatorSearchResultAssetSchema = z.object({
  assetId: IdSchema,
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  kind: AssistantOperatorSearchKindSchema,
  /** 截断过的提示词，供日志详情展示（拍板 18）。 */
  prompt: z.string().max(LIMITS.maxPriorStepSummaryChars).optional(),
  model: LabelSchema.optional(),
  createdAt: z.string().optional(),
})

export type AssistantOperatorSearchResultAsset = z.infer<
  typeof AssistantOperatorSearchResultAssetSchema
>

/**
 * 一张**联网预览候选**（P3-B）。
 *
 * ⭐ 它与 `AssistantOperatorSearchResultAsset` 长得像但**故意没有 `assetId`** ——
 * 那正是两者的全部区别：库里的素材已经是用户的（有 id、挂得上），联网候选只是
 * 一串第三方地址，在用户点选转存之前它在本仓里**不存在**。少了这个字段，
 * `mount_reference`（只吃 assetId）在类型上就够不着它。
 *
 * ⚠ `thumbnailUrl` 与 `imageUrl` 必须分开：Serper 给的缩略图是 gstatic 的、
 * 不过期且一定取得到；原图直链来自任意第三方站，实测约三成会 403（Cloudflare
 * JS challenge，补 Referer 无效）。**网格里画缩略图、转存时取原图** —— 反过来
 * 就是「候选格子一半是碎图」。
 *
 * ⚠ `width` / `height` 是**搜索引擎报的数**，不是实到值（台账：库里的 width/height
 * 曾被当成实到值用过，两个模型记错）。它只配在候选上写一行「1600×1200」当选图
 * 参考；真正落库的尺寸由转存那条腿自己 `sharp` 量。
 */
export const AssistantOperatorWebImageSchema = z.object({
  /** 原图直链 —— 转存时取的就是它。 */
  imageUrl: z.string().url(),
  /** 预览缩略图（gstatic，不过期）。缺席时网格回落到 `imageUrl`。 */
  thumbnailUrl: z.string().url().optional(),
  /** 图片所在页 —— 来源快照要它，界面上也要能点过去看出处。 */
  pageUrl: z.string().url().optional(),
  /** 站点域名，候选格子上的那行小字。 */
  domain: LabelSchema.optional(),
  title: z.string().max(LIMITS.maxPriorStepSummaryChars).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export type AssistantOperatorWebImage = z.infer<
  typeof AssistantOperatorWebImageSchema
>

/**
 * 一条 **LoRA 候选**在操作员协议里的投影（P4-C）。
 *
 * ⭐ 它是 `LoraCandidate` 的**投影而不是别名**，两条理由各自独立：
 *  ① `LoraCandidate` 上挂着 `importPayload`（来源快照 + 权重文件地址 + 落库入参）。
 *    那份对象**不该跟着每条候选流到客户端的日志里** —— 它只在真的要挂那一把时
 *    才需要，所以它住在 `mount_lora` 的载荷上，由服务端从本轮检索结果里查出来填。
 *  ② 这里多出两位是**本工作台此刻**才算得出来的：`compatible`（与当前底模架构对
 *    不对得上）。检索层不知道用户选了哪个底模，那是快照的事。
 *
 * ⚠ **许可原样透传，"不知道" 不软化**（`licenseKnown:false` 就是不知道）——
 * 与 `buildAssistantLoraCandidateDirective` 里那条「Never soften unknown into
 * probably fine」是同一条规矩的两侧。
 */
export const AssistantOperatorLoraCandidateSchema = z.object({
  candidateId: IdSchema,
  source: z.enum(LORA_CANDIDATE_SOURCE_VALUES),
  name: LabelSchema,
  /** null = 上游取不到作者（Civitai 作者注销 / HF repoId 没有命名空间段）。 */
  author: LabelSchema.nullable(),
  /** 底模家族。null = **定不出来**（那也正是 `importable:false` 的成因之一）。 */
  family: ParamValueSchema.nullable(),
  triggerWords: z.array(LabelSchema).max(LIMITS.maxSpecOptions),
  thumbnailUrl: z.string().url().optional(),
  pageUrl: z.string().url().optional(),
  downloads: z.number().int().nonnegative().nullable(),
  /** 上游写的那一行许可（HF 的 `cardData.license`）。null = 该源没有这个字段。 */
  licenseLabel: LabelSchema.nullable(),
  /** `label` 与 `commercialUse` 至少有一个非 null。⛔ false 就是「不知道」。 */
  licenseKnown: z.boolean(),
  /** Civitai 作者勾的商用范围（`Image` / `Rent` / `Sell`）。null = 该源没有。 */
  commercialUse: z.array(LabelSchema).nullable(),
  importable: z.boolean(),
  notImportableReason: z
    .enum(LORA_CANDIDATE_NOT_IMPORTABLE_REASON_VALUES)
    .optional(),
  /** 与当前底模架构对不对得上（判据见 `AssistantOperatorSnapshotLoraSchema`）。 */
  compatible: z.boolean(),
  alreadyMounted: z.boolean(),
  alreadyImported: z.boolean(),
})

export type AssistantOperatorLoraCandidate = z.infer<
  typeof AssistantOperatorLoraCandidateSchema
>

export const AssistantOperatorAppliedStepSchema = z.discriminatedUnion('tool', [
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.readState,
    z.object({}),
    /** 助手实际看到的那段状态文本 —— 日志详情直接展示它，省得猜它读到了什么。 */
    z.object({ digest: z.string().max(LIMITS.maxMessageChars) }),
  ),
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.searchAssets,
    z.object({
      query: z.string().trim().min(1).max(LIMITS.maxSearchQueryChars),
      kind: AssistantOperatorSearchKindSchema.nullable(),
      limit: z.number().int().positive().max(LIMITS.maxSearchResults),
    }),
    z.object({
      /** 命中数（拍板 18 的日志详情要它）。`null` = 上游没给总数。 */
      totalFound: z.number().int().nonnegative().nullable(),
      assets: z
        .array(AssistantOperatorSearchResultAssetSchema)
        .max(LIMITS.maxSearchResults),
    }),
  ),
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.listAssetFolders,
    z.object({
      query: z.string().trim().min(1).max(LIMITS.maxFolderQueryChars),
      limit: z.number().int().positive().max(LIMITS.maxFolderMatches),
    }),
    z.object({
      folders: z
        .array(AssistantAssetFolderCandidateSchema)
        .max(LIMITS.maxFolderMatches),
    }),
  ),
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.inspectAssetFolder,
    z.object({
      folderId: IdSchema,
      instruction: z
        .string()
        .min(1)
        .max(LIMITS.maxFolderVisionInstructionChars),
    }),
    AssistantAssetFolderVisionResultSchema,
  ),
  /**
   * ⛔ 这一支是 `readStep` 不是 `mutatingStep`，而且**永远只能是 readStep**：
   * 它一张图都没落下来，日志条上那几格是纯预览。转存由用户点选触发，走另一条
   * API 路由（owner 拍板：预览优先）。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.searchWebImages,
    z.object({
      query: z.string().trim().min(1).max(LIMITS.maxWebImageQueryChars),
      limit: z.number().int().positive().max(LIMITS.maxWebImageResults),
    }),
    z.object({
      /** 候选条数（拍板 18 的日志详情要它）。 */
      totalFound: z.number().int().nonnegative(),
      images: z
        .array(AssistantOperatorWebImageSchema)
        .max(LIMITS.maxWebImageResults),
    }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.mountReference,
    z.object({
      assetId: IdSchema,
      /** 服务端从本轮检索结果里查出来的真地址，模型碰不到它。 */
      url: z.string().url(),
      thumbnailUrl: z.string().url().optional(),
      kind: AssistantOperatorSearchKindSchema,
      label: LabelSchema.optional(),
    }),
    /** 撤销 = 按 id 把它摘掉。 */
    z.object({ assetId: IdSchema }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setModel,
    z.object({ modelId: IdSchema, modelLabel: LabelSchema.optional() }),
    /** `null` = 改之前一个模型都没选，撤销就是回到没选。 */
    z.object({ modelId: IdSchema.nullable() }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setPrompt,
    z.object({
      value: TextValueSchema,
      mode: AssistantOperatorWriteModeSchema,
    }),
    /** ⚠ 逆操作一律是**改前的完整原文**（可能是空串），所以 append / replace 撤法相同。 */
    z.object({ value: TextValueSchema }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setNegative,
    z.object({
      value: TextValueSchema,
      mode: AssistantOperatorWriteModeSchema,
    }),
    z.object({ value: TextValueSchema }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setSpecs,
    /** ⚠ 台账 AE/BG/BS：两个字段必须同时下发。 */
    z.object({ aspectRatio: ParamValueSchema, resolution: ParamValueSchema }),
    z.object({
      aspectRatio: ParamValueSchema.nullable(),
      resolution: ParamValueSchema.nullable(),
    }),
  ),
  /**
   * 视频规格（P4-A）。
   *
   * ⭐ **载荷与逆操作永远带齐三格**（没有的那格是 `null`）—— 这是台账 AE/BG/BS
   * 那条教训在视频档的形态：撤销一次落回一个**真实存在过的三元组**，
   * ⛔ 不会撤出「5s 配 1080p 配 21:9」这种从没有过的组合。
   * 「这一步只改了时长」这件事看载荷与逆操作的差就知道，不必靠字段缺席来表达。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setVideoSpecs,
    z.object({
      durationSeconds: z.number().int().positive().nullable(),
      aspectRatio: ParamValueSchema.nullable(),
      resolution: ParamValueSchema.nullable(),
    }),
    z.object({
      durationSeconds: z.number().int().positive().nullable(),
      aspectRatio: ParamValueSchema.nullable(),
      resolution: ParamValueSchema.nullable(),
    }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setCount,
    z.object({ count: z.number().int().positive() }),
    z.object({ count: z.number().int().positive() }),
  ),
  /**
   * 挂音频参考（P4-A，台账 A）。形状照 `mount_reference`：`url` 由服务端从本轮
   * 检索结果里查出来填，撤销按 id 摘。多的那个字段是**角色归属**。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.mountAudioReference,
    z.object({
      assetId: IdSchema,
      url: z.string().url(),
      label: LabelSchema.optional(),
      ownerName: LabelSchema.optional(),
    }),
    z.object({ assetId: IdSchema }),
  ),
  /**
   * 出不出声（P4-A）。
   *
   * ⚠ `payload.enabled` 只能是 `true` / `false`（助手表得了态），而
   * `inverse.enabled` **允许 `null`** —— 用户改之前很可能一次都没设过，
   * 撤销必须能回到「没设过」那一档。把它也收窄成布尔，撤销之后表单会从
   * 「跟目录默认走」变成「用户明确选了这个值」，两者在请求体里发出去的东西不同。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setSound,
    z.object({ enabled: z.boolean() }),
    z.object({ enabled: z.boolean().nullable() }),
  ),
  /**
   * 看图（P3-C，拍板 6）。
   *
   * ⭐ 它是 `readStep`：评价不改表单。**`payload.imageUrl` 是服务端从请求里那份
   * `result` 抄过来的**（模型碰不到），卡片左半边画的就是它 —— 拍板 6 的
   * 「证据长在结论里」因此不是渲染层的自觉，而是契约里就带着的字段。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult,
    z.object({
      imageUrl: z.string().url(),
      thumbnailUrl: z.string().url().optional(),
      modelLabel: LabelSchema.optional(),
      /** 模型自己说的「这一轮想要什么」；没写就是 `null`。 */
      goal: z.string().max(LIMITS.maxCritiqueGoalChars).nullable(),
    }),
    AssistantOperatorCritiqueSchema.extend({
      /**
       * 用户选的那条路看不了图、这一轮借了别的模型来看。
       * ⚠ 如实说出来 —— 「你选的是 DeepSeek，但看图用的是 Gemini」
       * （形态照 `ResolvedVisionRoute.borrowed`）。
       */
      borrowedVisionRoute: z.boolean(),
    }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
    /**
     * ⛔ 这里是整条链上离「生成」最近的地方，也就到此为止：`primed: true` 只是
     * 让生成键亮起来并算价，服务端不创建任何 generation（见词表文件头注）。
     */
    z.object({ primed: z.literal(true) }),
    z.object({ primed: z.literal(false) }),
  ),
  /**
   * 用户递来的地址（P3-D，拍板 22）。
   *
   * ⚠ 载荷里是**源地址**，不是落地地址 —— 落地地址此刻还不存在：取图 / 落 R2 /
   * 落库那一跳发生在**客户端**（既有导入路由），服务端在这一步一个字节都没碰。
   * 于是 `inverse` 也只能按源地址给，客户端拿「源地址 → 落地地址」的对照表反查
   * 要摘哪一张（见 `use-studio-operator-revert.ts` 里那张模块级表）。
   * ⚠ `domain` 是服务端从 URL 现算的（不是模型写的），只用于日志详情那行小字。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.importUserUrl,
    z.object({
      url: z.string().url(),
      domain: LabelSchema.optional(),
    }),
    z.object({ url: z.string().url() }),
  ),
  /**
   * 找 LoRA（P4-C）。⛔ **永远是 readStep**：它一把都没下载、一把都没挂上。
   * 落地由 `mount_lora` 负责，撤销也撤在那一条上 —— 与 `search_web_images` 同构。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.searchLoras,
    z.object({
      query: z.string().trim().min(1).max(LIMITS.maxLoraQueryChars),
      limit: z.number().int().positive().max(LIMITS.maxLoraResults),
    }),
    z.object({
      totalFound: z.number().int().nonnegative(),
      candidates: z
        .array(AssistantOperatorLoraCandidateSchema)
        .max(LIMITS.maxLoraResults),
      /**
       * 每个源一条回执（`ok` / `empty` / `failed` / `skipped`…）。
       *
       * ⭐ **空不是挂**：两个上游里有一个挂了、还是两个都好好的但没命中，用户看到的
       * 该是两句不同的话（检索层本来就分得出来，见 `LoraCandidateSourceReceipt`）。
       * 拍板 18 的「候选与放弃理由」在这一档就长这个样子。
       */
      sources: z
        .array(
          z.object({
            source: z.enum(LORA_CANDIDATE_SOURCE_VALUES),
            status: ParamValueSchema,
            count: z.number().int().nonnegative(),
          }),
        )
        .max(LORA_CANDIDATE_SOURCE_VALUES.length),
    }),
  ),
  /**
   * 挂一把 LoRA（P4-C）。
   *
   * ⚠ 载荷里带着 `importPayload` —— 那是**客户端导入那一跳的入参**（走既有
   * `favoriteLoraAPI`）。服务端只是把它从本轮检索结果里抄过来，一个字节都没下载：
   * 钱闸 / R2 闸与拍板 22 那条逐字同源。
   * ⚠ `inverse` 只有 `candidateId`：库记录 id 在服务端还不存在（导入在客户端），
   * 客户端拿「candidateId → 库记录」的对照表反查要摘哪一把。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.mountLora,
    z.object({
      candidateId: IdSchema,
      name: LabelSchema,
      /** 最终用的权重（模型给了用模型的，没给用候选/资产默认值）。 */
      weight: z.number(),
      /** 挂上之后要写进提示词的触发词 —— 走宿主既有的追加路径，⛔ 不新造一条。 */
      triggerWords: z.array(LabelSchema).max(LIMITS.maxSpecOptions),
      family: ParamValueSchema.nullable(),
      compatible: z.boolean(),
      importPayload: LoraCandidateImportPayloadSchema,
    }),
    z.object({ candidateId: IdSchema }),
  ),
  /**
   * 摘一把（P4-C）。
   *
   * ⚠ `inverse` 里只有 id 与权重：把它挂回去要的是那条**库记录**，而记录在客户端
   * 手上（它此刻正挂在装配台上）。客户端在摘的那一刻把记录扣下来 —— 与 `mount_lora`
   * 共用同一张模块级对照表。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.unmountLora,
    z.object({ loraId: IdSchema, name: LabelSchema }),
    z.object({ loraId: IdSchema, weight: z.number() }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setLoraWeight,
    z.object({ loraId: IdSchema, name: LabelSchema, weight: z.number() }),
    z.object({ loraId: IdSchema, weight: z.number() }),
  ),
  // ── 画布域（C0，任务书 §2.3）──────────────────────────────────────
  /** 概览：与 `read_state` 同构，`digest` 就是助手实际读到的那段文本。⛔ 不含 URL / 外观字段。 */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.readGraph,
    z.object({}),
    z.object({ digest: z.string().max(LIMITS.maxMessageChars) }),
  ),
  /** 单节点全量 —— URL 与外观字段只从这里出（K-4）。 */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.readNode,
    z.object({ nodeId: IdSchema }),
    z.object({ digest: z.string().max(LIMITS.maxMessageChars) }),
  ),
  /**
   * 建一批。`alias` 在载荷里**必填**（模型没给的由服务端补齐）—— 客户端 apply 按它
   * 分配真实 id 并登记别名表。`type` / `role` 到这里已经过规划器收窄，所以是 enum。
   * `inverse.nodeIds` 里是**这些别名**：真实 id 在服务端不存在，客户端按别名表反查删。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.stageNodes,
    z.object({
      items: canvasBatch(
        z.object({
          alias: AssistantOperatorCanvasAliasSchema,
          type: AssistantOperatorCanvasNodeTypeSchema,
          role: AssistantOperatorCanvasImageRoleSchema.optional(),
          title: z.string().trim().min(1).max(LIMITS.maxIdChars).optional(),
          fields: z.record(z.string(), TextValueSchema).optional(),
        }),
      ),
    }),
    z.object({ nodeIds: canvasBatch(AssistantOperatorCanvasAliasSchema) }),
  ),
  /**
   * 连一批。边 id 由客户端 apply 时分配（服务端没有），所以撤销按 (source, target)
   * 对反查 —— 载荷与逆操作是同一组对。id 可以是别名（同 run 里 `stage_nodes` 给的）。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.connectNodes,
    z.object({
      items: canvasBatch(
        z.object({ source: CanvasNodeRefSchema, target: CanvasNodeRefSchema }),
      ),
    }),
    z.object({
      items: canvasBatch(
        z.object({ source: CanvasNodeRefSchema, target: CanvasNodeRefSchema }),
      ),
    }),
  ),
  /**
   * 改字段。`inverse` 是每个字段**改前的值**，`null` = 改前没有这个键（撤销 = 删键）。
   * 自由文本 append / replace 撤法相同（改前完整原文），与 `set_prompt` 同一条。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setNodeFields,
    z.object({
      items: canvasBatch(
        z.object({
          nodeId: CanvasNodeRefSchema,
          fields: z.record(z.string(), CanvasFieldValueSchema),
          mode: AssistantOperatorWriteModeSchema,
        }),
      ),
    }),
    z.object({
      items: canvasBatch(
        z.object({
          nodeId: CanvasNodeRefSchema,
          fields: z.record(z.string(), CanvasFieldValueSchema.nullable()),
        }),
      ),
    }),
  ),
  /** 换模型：载荷与逆操作都是 **modelId + optionId 成对**；`null` = 改前没选。 */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setNodeModel,
    z.object({
      nodeId: CanvasNodeRefSchema,
      modelId: IdSchema,
      optionId: z.string().trim().min(1).max(LIMITS.maxCanvasOptionIdChars),
      modelLabel: LabelSchema.optional(),
    }),
    z.object({
      nodeId: CanvasNodeRefSchema,
      model: AssistantOperatorCanvasModelSchema.nullable(),
    }),
  ),
  /**
   * 挂参考：`url` 由服务端从工作副本（画布节点的 `mediaUrl`）或本轮检索结果里填，
   * 模型碰不到。`id` 是这条参考在引用架上的 id（服务端分配），撤销按它摘。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.attachRefs,
    z.object({
      nodeId: CanvasNodeRefSchema,
      refs: canvasBatch(
        z.object({
          id: IdSchema,
          url: CanvasUrlSchema,
          role: AssistantOperatorCanvasReferenceRoleSchema,
          source: AssistantOperatorCanvasReferenceSourceSchema,
          sourceId: IdSchema.optional(),
          name: LabelSchema.optional(),
        }),
      ),
    }),
    z.object({ nodeId: CanvasNodeRefSchema, refIds: canvasBatch(IdSchema) }),
  ),
  /** 审核态：载荷的 `state` 永远不会是 `approved`（规划器拒），逆操作 `null` = 改前没有记录。 */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
    z.object({
      nodeId: CanvasNodeRefSchema,
      state: AssistantOperatorCanvasReviewStateSchema,
      reason: z.string().trim().min(1).max(LIMITS.maxReasonChars).optional(),
    }),
    z.object({
      nodeId: CanvasNodeRefSchema,
      state: AssistantOperatorCanvasReviewStateSchema.nullable(),
    }),
  ),
  /**
   * ⛔ 与 `prime_generate` 同一条宪法：载荷只有 `{ nodeId, primed: true }`，
   * 服务端不创建任何 generation、不算价（money-gate 测试 ① 锁死这个形状）。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.primeNodeGenerate,
    z.object({ nodeId: CanvasNodeRefSchema, primed: z.literal(true) }),
    z.object({ nodeId: CanvasNodeRefSchema, primed: z.literal(false) }),
  ),
  /** 写 ScriptDoc（C3 实现）：逆操作是改前整份文档，`null` = 改前没有。 */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.updateScriptDoc,
    z.object({ doc: ScriptDocSchema }),
    z.object({ doc: ScriptDocSchema.nullable() }),
  ),
])

/**
 * 被规划器拒掉的一步。
 *
 * **有意让它出现在日志流里**而不是静默丢掉：模型编了个不存在的模型 id 时，用户
 * 该看到「这个模型不在你能选的表里」，而不是助手默默什么都没做。
 * ⚠ 它没有 `payload` / `inverse` —— 什么都没应用，也就没有东西可撤。
 */
export const AssistantOperatorRejectedStepSchema = z.object({
  ...STEP_BASE_SHAPE,
  tool: AssistantOperatorToolSchema,
  status: z.literal(ASSISTANT_OPERATOR_STEP_STATUS_IDS.error),
  error: z.object({
    reason: AssistantOperatorRejectReasonSchema,
    detail: z.string().max(LIMITS.maxReasonChars).optional(),
  }),
})

/**
 * ⚠ 用 `z.union` 而不是 `discriminatedUnion`：两支的判别键不同（成功支按 `tool`
 * 分，失败支按 `status: 'error'` 分）。两支的 `status` 值域不相交，所以不存在
 * 「一条载荷两支都过」的歧义 —— 少了 `inverse` 的改动型 step 会两支都不过，
 * 那正是这份契约要的行为。
 */
export const AssistantOperatorStepSchema = z.union([
  AssistantOperatorAppliedStepSchema,
  AssistantOperatorRejectedStepSchema,
])

export type AssistantOperatorStep = z.infer<typeof AssistantOperatorStepSchema>
export type AssistantOperatorAppliedStep = z.infer<
  typeof AssistantOperatorAppliedStepSchema
>

/**
 * 看图那一支（P3-C）—— 评价卡收的就是它。
 *
 * ⚠ 用 `Extract` 从判别联合里取，⛔ 别手写一份接口：手写的那份会在契约改动时
 * 静默漂掉（编译器不会告诉你两份形状不一样了）。
 */
export type AssistantOperatorCritiqueStep = Extract<
  AssistantOperatorAppliedStep,
  { tool: typeof ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult }
>

// ─── ③ 事件 ─────────────────────────────────────────────────────

export const AssistantOperatorOpenEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.open),
})

export const AssistantOperatorPlanEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.plan),
  steps: z
    .array(z.string().trim().min(1).max(LIMITS.maxPlanItemChars))
    .min(1)
    .max(LIMITS.maxPlanItems),
})

export const AssistantOperatorStepEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.step),
  step: AssistantOperatorStepSchema,
})

/**
 * 就地确认（拍板 3）。
 *
 * ⚠ 它之后这条流**就结束了**（`stopped` / `awaiting_confirm`）—— 服务端没有会话
 * 态可以挂起，续跑靠客户端带 `confirmations` 重发，与打断复用同一条机制。
 */
export const AssistantOperatorConfirmRequestEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.confirmRequest),
  field: AssistantOperatorAnyConfirmFieldSchema,
  /** 画布域的复合键另一半（§2.4）：问的是「这个节点的这一栏」。工作台三域缺席。 */
  nodeId: IdSchema.optional(),
  /** 用户已经写在那儿的东西（截断）—— 小条上要让人认出「哦是我写的那段」。 */
  have: z.string().max(LIMITS.maxConfirmHaveChars),
  /** 助手想写进去的东西（截断同上）。 */
  proposed: z.string().max(LIMITS.maxConfirmHaveChars),
})

export const AssistantOperatorMessageEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.message),
  text: z.string().max(LIMITS.maxMessageChars),
})

export const AssistantOperatorDoneEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.done),
})

export const AssistantOperatorStoppedEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.stopped),
  reason: AssistantOperatorStopReasonSchema,
})

/** 形态与 `AssistantStreamErrorFrame` 逐字一致 —— 客户端两条流共用一个错误渲染。 */
export const AssistantOperatorErrorEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.error),
  error: z.string(),
  errorCode: z.string().optional(),
  i18nKey: z.string().optional(),
})

export const AssistantOperatorEventSchema = z.discriminatedUnion('type', [
  AssistantOperatorOpenEventSchema,
  AssistantOperatorPlanEventSchema,
  AssistantOperatorStepEventSchema,
  AssistantOperatorConfirmRequestEventSchema,
  AssistantOperatorMessageEventSchema,
  AssistantOperatorDoneEventSchema,
  AssistantOperatorStoppedEventSchema,
  AssistantOperatorErrorEventSchema,
])

export type AssistantOperatorEvent = z.infer<
  typeof AssistantOperatorEventSchema
>

/** 这几个类型是 P2 应用 op 时要按 `tool` 分派的那一族。 */
export type AssistantOperatorStepEvent = z.infer<
  typeof AssistantOperatorStepEventSchema
>
export type AssistantOperatorConfirmRequestEvent = z.infer<
  typeof AssistantOperatorConfirmRequestEventSchema
>
export type AssistantOperatorPriorStep = z.infer<
  typeof AssistantOperatorPriorStepSchema
>
export type AssistantOperatorConfirmDecision = z.infer<
  typeof AssistantOperatorConfirmDecisionSchema
>
export type AssistantOperatorMessage = z.infer<
  typeof AssistantOperatorMessageSchema
>

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
  ASSISTANT_CHOICE_REQUEST_LIMITS as CHOICE_LIMITS,
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_CONFIRM_TIER_IDS,
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_CRITIQUE_FRAME_LABELS,
  ASSISTANT_OPERATOR_REFERENCE_SLOTS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_SEARCH_KINDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_VERDICT_SEVERITIES,
  ASSISTANT_OPERATOR_WRITE_MODES,
  ASSISTANT_PLAN_CARD_LIMITS as PLAN_LIMITS,
  ASSISTANT_PLAN_REQUEST_REASONS,
  ASSISTANT_PROJECT_RULE_LIMITS as RULE_LIMITS,
  ASSISTANT_RESEARCH_CONFIDENCES,
  ASSISTANT_RESEARCH_EVIDENCE_KINDS,
  ASSISTANT_RESEARCH_LIMITS as RESEARCH_LIMITS,
  ASSISTANT_RESEARCH_SCOPES,
  ASSISTANT_RESEARCH_SOURCES,
  ASSISTANT_COST_TICK_KINDS,
  ASSISTANT_WORKING_MEMORY as MEMORY_LIMITS,
  GENERATION_REVIEW_STATES,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { ASSISTANT_PLAN_VISUAL_IDS } from '@/constants/assistant-plan-visuals'
import { EVIDENCE_CREDIBILITY_VALUES } from '@/constants/research'
import { VIDEO_FRAME_LIMITS } from '@/constants/video-analysis'
import { WEB_IMAGE_SOURCE_VERDICTS } from '@/constants/web-image-sources'
import {
  LORA_CANDIDATE_NOT_IMPORTABLE_REASON_VALUES,
  LORA_CANDIDATE_SOURCE_VALUES,
} from '@/constants/lora-candidate'
import { PromptAssistantResponseLanguageSchema } from '@/types'
import type { OutputTypeValue } from '@/types'
import {
  AssistantAssetFolderCandidateSchema,
  AssistantAssetFolderVisionResultSchema,
} from '@/types/asset-folder-vision'
import { LoraCandidateImportPayloadSchema } from '@/types/lora-candidate'
import { CONTEXT_CARD_LIMITS } from '@/constants/context-cards'
import {
  ContextCardDigestSchema,
  ContextCardKindSchema,
  ContextCardSchema,
} from '@/types/context-cards'
import {
  ProjectRuleSchema,
  ProjectRuleScopeSchema,
} from '@/types/assistant-persona'

// ─── 小件 ────────────────────────────────────────────────────────

const IdSchema = z.string().trim().min(1).max(LIMITS.maxIdChars)
const LabelSchema = z.string().trim().min(1).max(LIMITS.maxLabelChars)
const ParamValueSchema = z.string().trim().min(1).max(LIMITS.maxParamValueChars)
/** ⚠ 允许空串：它是「这个框现在是空的」，与「没有这个框」（字段缺席）不是一回事。 */
const TextValueSchema = z.string().max(LIMITS.maxPromptChars)

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
export const AssistantOperatorReferenceSlotSchema = z.enum(
  ASSISTANT_OPERATOR_REFERENCE_SLOTS,
)

export const AssistantOperatorCritiqueFrameLabelSchema = z.enum(
  ASSISTANT_OPERATOR_CRITIQUE_FRAME_LABELS,
)

/**
 * 一张产物的审核态（切片 X）。⚠ **缺席 = `pending`** —— 词表头注写着为什么。
 * ⛔ 别在任何一处把缺席当成「不可用」：存量的每一行都缺席。
 */
export const GenerationReviewStateSchema = z.enum(GENERATION_REVIEW_STATES)

export type GenerationReviewStateValue = z.infer<
  typeof GenerationReviewStateSchema
>

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
  /**
   * **带图时**上游把宽高比钉死成这个值（第二期）。`null` / 缺席 = 这条线路不钉。
   *
   * ⭐ 值由宿主从发送契约里取（`getVideoModelSendContract().imageAspectRatioLock`），
   * ⛔ 服务端不自己算：视频档快照里的模型 id 是 **optionId**（型号 × 渠道，K-3），
   * 服务端拿它查不出契约，硬要查就得在这一层再抄一份 optionId → modelId 的解析。
   * 出处（官方）：火山「视频生成教程」使用限制段 —— Seedance 2.5 在首帧 / 首尾帧 /
   * 视频编辑 / 视频延长这些**有图**的场景下 `ratio` 只接受 `adaptive`，传具体宽高比
   * 直接 400（`constants/video-model-send-plan.ts` 的 `VOLCENGINE_ADAPTIVE_RATIO`）。
   * ⚠ 它是**能力声明**不是当前状态：真的锁上要再加一条「首帧槽里有图」——
   * 纯文生视频不受限，那一条判在规划器（`aspectLockedByFirstFrame`）。
   * ⚠ 这个值**可以不在 `aspectRatioOptions` 里**（`adaptive` 就不在，界面上没有这一档）：
   * 规划器因此对它单开一条放行，见 `planSetVideoSpecs`。
   */
  aspectRatioLock: ParamValueSchema.nullish(),
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
 * 视频档的**具名帧槽**（第二期）。
 *
 * ⭐ 它与 `references` 是**同一批图的两个视角**，不是两处素材：`keyframe` 档的参考
 * 位今天靠位置承载语义（[0] 首帧、[1] 尾帧，见
 * `constants/reference-image-capabilities.ts` 头注与 `buildWan30`）。宿主把那两个
 * 位置**读成名字**放在这里，助手于是能说「把这张换成尾帧」而不是「换第 1 个」。
 * ⛔ 别让它成为第二份真值：落地那一跳仍然写回同样那两个位置。
 *
 * ⚠ 整节缺席 = 这个工作台 / 这个模型没有帧槽（图片域、多图参考档、全能参考档都
 * 是这一档）。`last` 单独缺席 = 这个模型只有首帧（`keyframeSlots === 1`）——
 * 那时 `mount_reference slot:'last'` 按 `noSuchControl` 拒。
 */
export const AssistantOperatorSnapshotFrameReferencesSchema = z.object({
  /** 首帧。缺席 = 槽位空着（不是「没有这个槽」——那是整节缺席）。 */
  first: AssistantOperatorSnapshotReferenceSchema.optional(),
  /** 尾帧。⚠ 只有 `keyframeSlots === 2` 的模型有这个槽。 */
  last: AssistantOperatorSnapshotReferenceSchema.optional(),
  /** 这个模型认几个具名帧槽：1 = 只有首帧，2 = 首帧 + 尾帧。 */
  slots: z.union([z.literal(1), z.literal(2)]),
})

export const AssistantOperatorSnapshotVideoReferenceSchema = z.object({
  assetId: IdSchema.optional(),
  url: z.string().url(),
  label: LabelSchema.optional(),
})

/**
 * 视频档的**参考视频位**（第二期）。
 *
 * ⚠ 整节缺席 = 这条线路不吃参考视频（`slots.videos === 0`，绝大多数模型），
 * **或者这个宿主上还没有那个控件** —— 工作台今天就是后者：表单里没有任何一处存
 * 参考视频（2026-09-07 清点 `studio-context` 全文）。按本文件的头注纪律，
 * 「控件不在整节就不给」，于是 `mount_reference slot:'video'` 在工作台上一律
 * `noSuchControl`。⛔ 别为了形状整齐补一个空节：那会让助手去挂一段落不了地的视频。
 */
export const AssistantOperatorSnapshotVideoReferencesSchema = z.object({
  items: z
    .array(AssistantOperatorSnapshotVideoReferenceSchema)
    .max(LIMITS.maxSnapshotReferences),
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

export const AssistantOperatorSnapshotSchema = z.object({
  /** 正面提示词现值。空串 = 空框（随便填，拍板 3）；非空 = 用户手写内容，写它要先确认。 */
  prompt: TextValueSchema,
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
  /** ⚠ 缺席 = 没有具名帧槽（图片档 / 多图参考档 / 全能参考档）。见 schema 头注。 */
  frameReferences: AssistantOperatorSnapshotFrameReferencesSchema.optional(),
  /** ⚠ 缺席 = 这个宿主上没有参考视频位。见 schema 头注。 */
  videoReferences: AssistantOperatorSnapshotVideoReferencesSchema.optional(),
  /** ⚠ 缺席 = 这个工作台挂不了音频参考（图片档、或视频档但线路不吃音频）。 */
  audioReferences: AssistantOperatorSnapshotAudioReferencesSchema.optional(),
  /** ⚠ 缺席 = 这条线路没有「出不出声」这个开关（界面上那颗 Switch 也不渲染）。 */
  sound: AssistantOperatorSnapshotSoundSchema.optional(),
  /** ⚠ 缺席 = 这个工作台没有 LoRA 挂载栈（图片 / 视频档）。见 schema 头注。 */
  loras: AssistantOperatorSnapshotLorasSchema.optional(),
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
  field: AssistantOperatorConfirmFieldSchema,
  choice: AssistantOperatorConfirmChoiceSchema,
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
/** 三段评审的严重度（`fail` / `warn` / `pass`）—— 值域住在 constants。 */
export const AssistantOperatorVerdictSeveritySchema = z.enum(
  ASSISTANT_OPERATOR_VERDICT_SEVERITIES,
)

export const AssistantOperatorCritiqueSchema = z.object({
  findings: z
    .array(
      z.object({
        /**
         * 否定 / 异常 / 达成 —— 三档的分工写在
         * `ASSISTANT_OPERATOR_VERDICT_SEVERITY_IDS` 的头注上。
         * ⚠ 它取代了原来那个 `ok: boolean`，⛔ 没有并存的两套。
         */
        severity: AssistantOperatorVerdictSeveritySchema,
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

/**
 * 视频评审卡上的**一帧**（第二期）。
 *
 * `t` 是秒（服务端从计划里取的真时间戳），`url` 是转存后的 R2 地址，`label` 是
 * 位置名。三个字段各有各的读者：`url` 给卡片、`label` 给模型与文案、`t` 给
 * 「回到那一刻」那种将来会有的动作。⛔ 别把 `t` 省掉换成「按序号推」——
 * 极短片的三帧会退化（见 `planVideoEndpointFrames` 头注），序号推不出真时间。
 */
export const AssistantOperatorCritiqueFrameSchema = z.object({
  t: z.number().nonnegative(),
  url: z.string().url(),
  label: AssistantOperatorCritiqueFrameLabelSchema,
})

/**
 * 视频域看片评审的产出（第二期，§7「视频域第二期扩成三帧抽帧版」）。
 *
 * ⚠ 与图片档那份**分成两张 schema**而不是给它加可选字段：图片档的 `findings` 说的
 * 是「这一张图达没达成」，视频档的 `verdicts` 说的是「这段片子达没达成」，而后者
 * 的证据是三帧**合起来**。合成一张的下场是卡片分不出该画一张图还是三格帧带。
 * ⚠ `frames` 恒三张（`length`，不是 `max`）：三个位置各绑一个固定问题，
 * 少一张就有一个问题没人回答。
 */
export const AssistantOperatorVideoCritiqueSchema = z.object({
  frames: z
    .array(AssistantOperatorCritiqueFrameSchema)
    .length(LIMITS.videoCritiqueFrameCount),
  /** 三段评审（否定 / 异常 / 建议里的前两段）。形状与图片档的 `findings` 同构。 */
  verdicts: z
    .array(
      z.object({
        severity: AssistantOperatorVerdictSeveritySchema,
        text: z.string().trim().min(1).max(LIMITS.maxCritiqueFindingChars),
      }),
    )
    .min(1)
    .max(LIMITS.maxCritiqueFindings),
  advice: z.string().trim().max(LIMITS.maxCritiqueAdviceChars).nullish(),
})

export type AssistantOperatorVideoCritique = z.infer<
  typeof AssistantOperatorVideoCritiqueSchema
>

/**
 * 图示 id（§9 词表）。⚠ 只在**服务端 → 客户端**这一侧收窄；模型那一侧是宽松的
 * `z.string()`（见 `AssistantOperatorTurnPendingSchema`），写错的 id 由服务端剥掉
 * 并 `logger.warn`，⛔ 不作废整一轮。
 */
export const AssistantPlanVisualSchema = z.enum(ASSISTANT_PLAN_VISUAL_IDS)

/**
 * 「这一枪大概花多少」。
 *
 * ⚠ `credits` **可选，而且今天基本都缺席** —— 本仓至今没有任何一处能在客户端或
 * 助手侧算出准确 credit 数（`AI_MODELS[].cost` 是每次请求的基数，真正的扣费口径
 * 在服务端 credit policy）。缺席时卡上那一行**不画**，⛔ 不画一个「约 0」——
 * 一个错的数比没有数更糟（论据与 `StudioCostPreview` 的「缺价不折进合计」同源）。
 * ⚠ 缺席同时意味着「本会话不再问」**匹配不上**（见 `autoApprove`），于是退回每次
 * 硬确认 —— 这正是安全的那个方向。
 */
export const AssistantOperatorPlanEstimateSchema = z.object({
  credits: z.number().int().nonnegative().optional(),
  model: LabelSchema.optional(),
  count: z.number().int().positive().optional(),
})

export type AssistantOperatorPlanEstimate = z.infer<
  typeof AssistantOperatorPlanEstimateSchema
>

/** 这一枪的规格。⚠ 三格**永远带齐**（没有的那格是 `null`，论据同 `set_video_specs`）。 */
export const AssistantOperatorGenerationSpecsSchema = z.object({
  aspectRatio: ParamValueSchema.nullable(),
  resolution: ParamValueSchema.nullable(),
  durationSeconds: z.number().int().positive().nullable(),
})

/**
 * 花钱档的那一份载荷（§6）—— **一份形状，两处用**：
 *  · `request_generation` 这一步的 `payload`（客户端据它调 `triggerGeneration`）；
 *  · `spend_request` 事件（硬确认卡据它画模型 / 张数 / 规格 / 预估）。
 * ⛔ 别抄成两份：卡上写的和真的发出去的必须是同一个对象，否则「确认了 4 张、
 * 发出去 1 张」这种事没有任何东西拦得住。
 */
export const AssistantOperatorGenerationRequestSchema = z.object({
  model: z.object({ id: IdSchema, label: LabelSchema }),
  count: z.number().int().positive(),
  specs: AssistantOperatorGenerationSpecsSchema,
  estimate: AssistantOperatorPlanEstimateSchema,
  /**
   * 助手给这一枪起的名（切片 X）——**透传字段**：服务端只是把模型给的那个字
   * 抄进来，客户端提交时把它交给 `createGeneration({ displayLabel })`。
   * ⚠ 服务端在这一步照旧一行库都不写（钱闸不变）。
   * ⚠ 缺席 = 不起名，产物名的摘要段退回提示词头几个字。
   */
  label: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.maxGenerationLabelChars)
    .optional(),
})

export type AssistantOperatorGenerationRequest = z.infer<
  typeof AssistantOperatorGenerationRequestSchema
>

/**
 * 反问卡上**一个选项**（§9 三条画法分支：缩略图 → 图示 → 纯文字）。
 *
 * ⭐ `description` 是**必填**，这是本轮改写的要点：旧形状只有 `label`，于是卡上
 * 出现的是「3D 游戏渲染 / 风格化 3D」两颗看不出差别的 chip，而用户要回答的正是
 * 「它俩差在哪」。说明那一句就是差别本身 —— ⛔ 没有它就不该出这个选项。
 * ⚠ `visual` / `assetUrl` 降成行首小图示，⛔ 不再是选项本体。
 */
export const AssistantOperatorPlanOptionSchema = z.object({
  id: IdSchema,
  label: z.string().trim().min(1).max(PLAN_LIMITS.maxOptionLabelChars),
  /** 一句「这条路会发生什么」。 */
  description: z
    .string()
    .trim()
    .min(1)
    .max(PLAN_LIMITS.maxOptionDescriptionChars),
  /**
   * 推荐项 —— 排第一并带「推荐」标。
   * ⚠ 一题最多一个：服务端只认第一个，其余剥掉（见 `normalizePlanQuestions`）。
   */
  recommended: z.boolean().optional(),
  /** 命中词表才画图示；缺席 = 纯文字。 */
  visual: AssistantPlanVisualSchema.optional(),
  /** 「选哪张参考图」这一类：缩略图本身就是选项，⚠ 优先级高于 `visual`。 */
  assetUrl: z.string().url().optional(),
})

/**
 * 反问卡上**一道题**（2026-09-06，替换 `pending`）。
 *
 * ⚠ `header` 与 `question` **分开**：收起态那一行摘要只写得下 header，而问句
 * 要完整。合成一个字段的代价是二选一 —— 要么摘要里塞一整句，要么卡上只有几个字。
 * ⚠ `multiSelect` **显式**而不是「看选项个数猜」：猜错的表现是用户点了第二项、
 * 第一项自己没了。
 * ⚠ `allowOther` 缺省 **true**：多数题都该留一句「都不是，我要……」的出口，
 * 关掉它是一个有意的动作（比如「用哪张参考图」这种闭集）。
 */
export const AssistantOperatorPlanQuestionSchema = z.object({
  id: IdSchema,
  /** chip 上那几个字（≤12 字）。 */
  header: z.string().trim().min(1).max(PLAN_LIMITS.maxHeaderChars),
  question: z.string().trim().min(1).max(PLAN_LIMITS.maxQuestionChars),
  multiSelect: z.boolean(),
  allowOther: z.boolean(),
  /** ⚠ 至少两个：一个选项的「单选」不是问题，是通知。 */
  options: z
    .array(AssistantOperatorPlanOptionSchema)
    .min(PLAN_LIMITS.minOptions)
    .max(PLAN_LIMITS.maxOptions),
})

export type AssistantOperatorPlanQuestion = z.infer<
  typeof AssistantOperatorPlanQuestionSchema
>
export type AssistantOperatorPlanOption = z.infer<
  typeof AssistantOperatorPlanOptionSchema
>

/**
 * 用户在反问卡上的一次回答。
 *
 * ⚠ `optionIds` 是**数组**而不是单值 —— 单选也是长度 1 的数组：两种形状会在
 * 「多选题改成单选题」这种服务端改口时静默漂掉一半答案。
 * ⚠ `otherText` 与 `optionIds` **并存**：多选题里可以既选 A 又补一句其他；
 * 单选题选了「其他」时 `optionIds` 为空、只有这一句。
 */
export const AssistantOperatorPlanAnswerSchema = z.object({
  questionId: IdSchema,
  optionIds: z.array(IdSchema).max(PLAN_LIMITS.maxOptions),
  otherText: z.string().trim().max(PLAN_LIMITS.maxOtherTextChars).optional(),
})

export type AssistantOperatorPlanAnswer = z.infer<
  typeof AssistantOperatorPlanAnswerSchema
>

/**
 * 「本会话此类不再问」（§6 拍板 24）**在客户端**的那一半。
 *
 * ⭐ 服务端**不存任何记忆** —— 它只在每次请求里收到这张条子，然后逐条核：
 * 同模型？金额 ≤ 上次确认过的？两条都成立才跳过硬确认。作用域的第三要素
 * 「同会话」由客户端负责（换一条会话它就不再带上来），因为会话本来就只活在客户端。
 * ⚠ `estimate.credits` 缺席时**匹配不上**（`undefined <= n` 恒假的那条判据写在
 * 服务端），于是回到每次确认 —— 安全的那个方向。
 */
export const AssistantOperatorAutoApproveSchema = z.object({
  tier: z.literal(ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.spend),
  /** 上次确认的那个模型 id。换个模型 = 换一笔账，重新问。 */
  model: IdSchema,
  /** 上次确认过的金额，本次不许超。 */
  maxCredits: z.number().int().nonnegative(),
})

export type AssistantOperatorAutoApprove = z.infer<
  typeof AssistantOperatorAutoApproveSchema
>

/**
 * 客户端抽好的那组帧（**客户端 → 服务端**，第二期 · 视频域评审）。
 *
 * ⭐ **为什么帧从客户端来**：抽帧发生在浏览器里（`<video>` + canvas，
 * `lib/video-frame-capture.ts`），服务端只**复算计划再逐帧核对时间戳**
 * （`persistVideoFrameSet`）—— 那一次核对就是「这组帧真的是按计划抽的」的全部凭证。
 * ⛔ 服务端不自己抽：本仓没有服务端解码器，而且视频本来就已经在用户浏览器里。
 *
 * ⚠ `sourceUrl` 必须与被评的那个目标**逐字相同**，否则服务端按 `unknownAsset` 拒：
 * 没有这一条，「看片」就变成了「客户端说这是哪段片子就是哪段」。
 */
export const AssistantOperatorVideoFrameSchema = z.object({
  /** 计划里的**序号**（0 = start / 1 = mid / 2 = end），不是数组下标。 */
  index: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.videoCritiqueFrameCount - 1),
  timestampSeconds: z.number().min(0),
  /**
   * `data:image/webp;base64,…`。上限按字节上限的 2 倍字符给（base64 膨胀 ~4/3）——
   * 真正说了算的是服务端解码后的字节数与魔数校验（`persistVideoFrameSet`），
   * 这里只挡住离谱载荷。形状与 `lib/video-frame-request.ts` 那份逐字同源。
   */
  dataUrl: z
    .string()
    .min(1)
    .max(VIDEO_FRAME_LIMITS.maxFrameBytes * 2),
})

export const AssistantOperatorVideoFramesSchema = z.object({
  /** 这组帧是从哪段视频抽的。 */
  sourceUrl: z.string().url(),
  /** 客户端从 `<video>.duration` 读到的片长 —— 服务端按它复算计划。 */
  durationSeconds: z.number().positive(),
  /**
   * ⚠ **整组或者没有**：缺一帧的帧集评出来的结论复跑不出来，而它看起来完全正常
   * （与 `VideoAnalyzeRequestSchema` 那条 `superRefine` 同一条纪律）。
   */
  frames: z
    .array(AssistantOperatorVideoFrameSchema)
    .length(LIMITS.videoCritiqueFrameCount),
})

export type AssistantOperatorVideoFrames = z.infer<
  typeof AssistantOperatorVideoFramesSchema
>

/**
 * **跨轮工作记忆**（客户端 → 服务端，切片 X）—— 上限见
 * `ASSISTANT_WORKING_MEMORY` 的头注（含「它为什么仍然不是服务端状态」）。
 *
 * ⭐ 它答的是一个具体的失败：用户说「把刚才那张挂上」，而「刚才那张」产生于上一轮
 * —— 服务端零会话态，本轮的 `searchIndex` 里一条都没有，于是助手要么重搜一遍，
 * 要么按 `unknownAsset` 拒。`priorSteps` 带得回「做过什么」（一行摘要），
 * 带不回「产出了什么」（可指认、挂得上的东西）。
 *
 * ⚠ 每件产物带 `displayName`：模型在对白里指认用的就是它（切片 N1 的名字），
 * ⛔ 不念 id。`url` 可选 —— 有地址的才挂得上，没地址的（一段检索证据）只是让
 * 助手记得「这件事我上一轮查过了」。
 */
export const AssistantOperatorWorkingMemoryArtifactSchema = z.object({
  id: IdSchema,
  displayName: LabelSchema,
  /**
   * 这件东西是什么：助手备的那一枪的产物 / 联网候选 / 检索证据 / 素材库里的一张。
   * ⚠ 它**不是** `AssistantOperatorSearchKind`（image / video / audio）：那说的是
   * 媒体类型，这说的是「它从哪来」—— 而准入判定关心的正是后者。
   */
  kind: z.enum(['result', 'candidate', 'evidence', 'asset']),
  url: z.string().url().optional(),
})

export const AssistantOperatorWorkingMemoryRoundSchema = z.object({
  /** 那一轮的身份（客户端给的稳定串）—— 只用于把同一轮的东西归到一起。 */
  runKey: IdSchema,
  /** ISO 串。系统提示里按它排「最近的在最后」。 */
  at: z.string(),
  /**
   * ⚠ `.readonly()` 是**给调用方留的口**：客户端那份记忆是只读结构（它是从
   * 已经落定的历史里算出来的），而 `T[]` 可以赋给 `readonly T[]`、反过来不行。
   * 写成可变数组的表现是客户端要为了过类型 `[...]` 拷一份 —— 拷贝没有任何收益。
   */
  artifacts: z
    .array(AssistantOperatorWorkingMemoryArtifactSchema)
    .max(MEMORY_LIMITS.maxArtifactsPerRound)
    .readonly(),
})

export const AssistantOperatorWorkingMemorySchema = z.object({
  rounds: z
    .array(AssistantOperatorWorkingMemoryRoundSchema)
    .max(MEMORY_LIMITS.maxRounds)
    .readonly(),
})

export type AssistantOperatorWorkingMemory = z.infer<
  typeof AssistantOperatorWorkingMemorySchema
>

export type AssistantOperatorWorkingMemoryArtifact = z.infer<
  typeof AssistantOperatorWorkingMemoryArtifactSchema
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
    .max(Object.keys(ASSISTANT_OPERATOR_CONFIRM_FIELDS).length)
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
  /**
   * 用户在计划卡上选了什么（§2.6）。⚠ 与 `confirmations` 走**同一条通道** ——
   * 「带上下文重发」，服务端照旧没有会话态。
   */
  planAnswers: z
    .array(AssistantOperatorPlanAnswerSchema)
    .max(PLAN_LIMITS.maxQuestions)
    .optional(),
  /**
   * 计划卡上按的是哪一颗。
   *  · `true`  = 「开始」—— 带着答复照原计划跑；
   *  · `false` = 「修改」—— 把答复并进上下文**重新规划一次**（§3.1 ⑤）；
   *  · 缺席    = 这一轮压根没出过计划卡。
   */
  planApproved: z.boolean().optional(),
  /** 输入区那颗「先问我」（§3.3）。开着 = 本轮无条件先出计划卡。 */
  forcePlan: z.boolean().optional(),
  /** 「本会话此类不再问」的条子（§6 拍板 24）。见 schema 头注。 */
  autoApprove: AssistantOperatorAutoApproveSchema.optional(),
  /**
   * 用户这一轮 `@` 引用的那几张图（§7 四入口共用的 chip 管线，切片 3a）。
   *
   * ⭐ **拍板 4 推翻的落点**：归属票不再是看图的唯一凭证 —— `@` 指定的任意一张都
   * 能直接作 `critique_result` 的目标。它与 `result` 是两条来源，不是一条的两种写法：
   * `result` 是「助手自己备的那一枪回来了」（客户端归属追踪填的），这一格是
   * 「用户指着说这张」。
   * ⛔ **它同时是那条闸**：`critique_result.targetIds` 只能从这张名单里挑，模型
   * 写一条名单外的地址一律 `unknownAsset` 拒。没有这张名单，「看图」就变成了
   * 「模型说看哪张就看哪张」。
   * ⚠ 用户消息里那句 `[attached: …]` 是**给模型读的展示文本**，不是这张名单 ——
   * ⛔ 别去解析它：一段给人看的字符串当成权限清单用，是最容易被提示词注入撬开的
   * 那一类。
   */
  mentionedAssets: z
    .array(
      z.object({
        id: IdSchema,
        url: z.string().url(),
        label: LabelSchema.optional(),
        /**
         * 这张的产物序号（`Generation.seq`，切片 N1 改真计数器）。
         * ⚠ 正文里 `@图_012` 落到哪一张**只按它比**（`matchMentionedByName`）。
         * ⚠ 缺席 = 这一条没有号（迁移前的存量行、老客户端），于是**永远不会被
         * `@序号` 命中** —— ⛔ 不退回 id 派生：一个算出来的号会去撞别人的真号。
         * 用户照旧能从选择器点它上来，那条路不经过名字。
         */
        seq: z.number().int().nonnegative().optional(),
        /**
         * 这张此刻的审核态（切片 X）。⚠ **缺席 = `pending`**，⛔ 不是「未知所以
         * 拒」—— 存量的每一行都缺席，把缺席当成禁用等于禁掉整个素材库。
         * ⚠ 它由客户端带上来只是为了**省一次查库**：真正说了算的是服务端自己
         * 从库里读到的那一位（`readGenerationReviewStates`）。客户端把
         * `blocked` 写成 `approved` 换不到放行 —— 挂载那一步会自己去读。
         */
        reviewState: GenerationReviewStateSchema.optional(),
      }),
    )
    .max(LIMITS.maxSnapshotReferences)
    .optional(),
  /**
   * 最近几轮的产出（切片 X）。见 `AssistantOperatorWorkingMemorySchema` 头注。
   *
   * ⚠ 缺席 = 这一轮没有跨轮记忆（新会话 / 老客户端），一切照旧：准入名单退回
   * 「本轮检索 + `@` 名单」那两张。
   */
  workingMemory: AssistantOperatorWorkingMemorySchema.optional(),
  /**
   * 这一轮客户端抽好的**三帧**（第二期 · 视频域评审）。见 schema 头注。
   *
   * ⚠ 缺席 = 这一轮没有帧可看，视频域 `critique_result` 按 `videoFramesMissing`
   * 拒。⛔ 服务端不去「自己抽一次」：本仓没有、也不打算有服务端解码器
   * （`lib/video-frame-capture.ts` 的选型头注：worker 跑不了原生二进制，
   * 服务端 ffmpeg 要往 Vercel 包里塞几十 MB）。
   */
  videoFrames: AssistantOperatorVideoFramesSchema.optional(),
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
    /**
     * **谁**（作品名 + 角色名），2026-09-06 加。
     *
     * ⚠ 它与 `query` 分开而不是「让模型把这些词写进 query」：服务端要拿它去铺
     * 多语言变体（中/日/英各一条），而拆一句自由文本拆不出「哪部分是主体」。
     * 🔬 起因是 owner 的用例：只发一条英文 query 时，一手立绘（中/日文官方渠道）
     * 一张都进不了召回。
     * ⚠ 不给就是不给 —— 服务端退回单条查询，与切片 3b 的成本形状不变。
     */
    subject: z.string().trim().max(RESEARCH_LIMITS.maxSubjectChars).optional(),
    /**
     * 要不要把「官方 / 设定图 / 公式資料」这类限定词铺进变体，并把官方与 wiki
     * 来源排到前面。⚠ 找角色设定图时**必须给 true**，系统提示里写着。
     */
    preferOfficial: z.boolean().optional(),
    limit: z
      .number()
      .int()
      .positive()
      .max(LIMITS.maxWebImageResults)
      .optional(),
  }),
  /**
   * 有目标的检索（2026-09-06）。
   *
   * ⚠ 与 `search_web` 的形状**故意不同构**：那条是「一句查询」，这条是
   * 「一个目标 + 几个实体 + 打哪些源」——三个字段各自答一个模型真的知道的问题，
   * 而把它们揉成一句查询正是「搜到一句台词就放弃」的成因。
   * ⚠ `sources` 是**粗粒度分组**（web / wiki / bilibili / danbooru），⛔ 不是真源
   * 表：让模型挑「萌百还是中文维基」是让它猜一件它不可能知道的事。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.research]: z.object({
    goal: z.string().trim().min(1).max(RESEARCH_LIMITS.maxGoalChars),
    entities: z
      .array(z.string().trim().min(1).max(RESEARCH_LIMITS.maxEntityChars))
      .max(RESEARCH_LIMITS.maxEntities)
      .optional(),
    sources: z
      .array(z.enum(ASSISTANT_RESEARCH_SOURCES))
      .max(ASSISTANT_RESEARCH_SOURCES.length)
      .optional(),
  }),
  /**
   * 读一页正文（2026-09-06）。
   *
   * ⚠ 协议闸与 `import_user_url` 逐字同源（`.url()` 放行 `ftp:` / `file:`）。
   * 「这条地址该不该读」（本站 / 读不出来）留在规划器：schema 拒 = 整轮读不出来，
   * 规划器拒 = 助手读得到理由还能换一个来源。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.readUrl]: z.object({
    url: z
      .string()
      .trim()
      .max(LIMITS.maxUserUrlChars)
      .url()
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'url must be http(s)',
      }),
    /** 「外貌与服饰」这类一句话 —— 服务端按它在正文里截段。 */
    focus: z.string().trim().max(RESEARCH_LIMITS.maxFocusChars).optional(),
  }),
  /**
   * 联网查文字（切片 3b）。形状与搜图那条**故意逐字同构**（`query` + 可选 `limit`）：
   * 两条工具在模型眼里长得一样、只是要的东西不同，多一个参数就是多一件它会写错的东西。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.searchWeb]: z.object({
    query: z.string().trim().min(1).max(LIMITS.maxWebSearchQueryChars),
    limit: z
      .number()
      .int()
      .positive()
      .max(LIMITS.maxWebSearchResults)
      .optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.mountReference]: z.object({
    /** ⛔ 只有 id，没有 URL —— URL 由服务端从本轮检索结果里查出来填。 */
    assetId: IdSchema,
    /**
     * 挂到**哪个槽**（第二期 · 视频域）。缺席 = `reference`（无语义参考图），
     * 图片域永远是这一档。
     * ⚠ 这里是**宽松**的（值域校验留在规划器，见文件头注 ②）：模型写了一个这个
     * 模型没有的槽（比如只有首帧的模型上写 `last`），规划器按 `noSuchControl` 拒
     * 并说清楚 —— schema 拒的话它这一轮整个作废，还学不到为什么。
     */
    slot: AssistantOperatorReferenceSlotSchema.optional(),
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
  /**
   * ⚠ 唯一的入参是一个**可选的名字**（切片 X）：助手给这一枪起的名，最长
   * `maxGenerationLabelChars` 字。它落到产物名的**摘要段**（`图_012·主视觉`），
   * ⛔ 落不到身份段 —— 那一段只由 id 决定（`lib/generation-name.ts` 头注）。
   * ⚠ 服务端**不写库**：它只把这个字透传进 op 载荷，写库发生在客户端提交那一跳
   * （`createGeneration({ displayLabel })`）—— 与钱闸的分工逐字一致。
   * ⛔ 别把它做成必填：想不出名字时取提示词头几个字，比逼模型编一个好。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: z.object({
    label: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.maxGenerationLabelChars)
      .optional(),
  }),
  /**
   * ⛔ **空入参是这条工具的一半设计**：要发什么全部来自快照（模型 / 张数 / 规格），
   * 而快照是客户端此刻真正看到的那份。让模型自己写一份「我想发的参数」，就会出现
   * 卡上写 4 张、表单里是 1 张这种对不上的情况 —— 而那正是花钱档最不能出的错。
   * 要改参数就先调 `set_*`，改完再请求发送。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration]: z.object({
    /** ⚠ 与 `prime_generate` 上那个**同一件事**：给这一枪起个名，见那边的头注。 */
    label: z
      .string()
      .trim()
      .min(1)
      .max(LIMITS.maxGenerationLabelChars)
      .optional(),
  }),
  /**
   * ⛔ **仍然没有图片地址这个参数**：模型只能从两处**已有的名单**里挑，⛔ 不许
   * 自己写一条 URL。两处是——
   *  · `targetIds`（切片 3a，拍板 4 推翻）：用户 `@` 引用的那几张（`mentionedAssets`）。
   *    值可以是那张图的 id（generation id / assetId）**或**它的 URL，服务端两样都认。
   *    不在名单里的 id 按 `unknownAsset` 拒 —— 这条是「不许自己编一张图来评」的闸。
   *  · 缺席时回落到请求里的 `result`（归属票：助手自己 primed 的那一枪）。
   *
   * `goal` 仍是「这一轮本来想要什么」，让视觉那一跳有个对照物；不写就用线程里的
   * 提示词兜底。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult]: z.object({
    goal: z.string().trim().max(LIMITS.maxCritiqueGoalChars).optional(),
    targetIds: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(LIMITS.maxIdChars * 4),
      )
      .max(LIMITS.maxSnapshotReferences)
      .optional(),
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
  /**
   * ⚠ 只有一个可选的作用域过滤 —— **没有查询词**：规则总共只有几十条，全量读回来
   * 比让模型猜一个关键词靠谱（猜错的表现是「明明写过的规则助手说没有」）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules]: z.object({
    scope: ProjectRuleScopeSchema.optional(),
  }),
  /**
   * ⛔ **没有 `source` 参数**：这条工具记下的一律是 `assistant`，服务端写死。
   * 让模型自己声明来源，来源就不再是证据（论据与 `import_user_url` 的
   * 「是不是用户给的由服务端逐字比对」同源）。
   * ⚠ `scope` 可选，缺省 = 全域：一条规则默认对四台工作台都成立，缩小它是一个
   * 有意的动作。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]: z.object({
    text: z.string().trim().min(1).max(RULE_LIMITS.maxTextChars),
    scope: ProjectRuleScopeSchema.optional(),
  }),
  /**
   * 上下文卡两条（K1）。
   *
   * ⚠ 列表那条**只有一个可选的类型过滤，没有查询词** —— 判据与
   * `read_project_rules` 逐字同源：一个用户的卡总共几十张，全量列回来比让模型猜
   * 一个关键词靠谱（猜错的表现是「明明建过的角色卡助手说没有」）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.listContextCards]: z.object({
    kind: ContextCardKindSchema.optional(),
  }),
  /** ⚠ 只吃 id：卡名会重（两张都叫「西格莉卡」），id 不会。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.readContextCard]: z.object({
    cardId: IdSchema,
  }),
  /**
   * 标一张产物的审核态（切片 X）。
   *
   * ⚠ `state` 收下**三个值都收**（含 `approved`），值域不在这里收窄 —— 与本文件
   * 头注 ② 同一条。真正的准入（这张是不是这个用户的）在服务端按 userId 查库，
   * 模型给一个别人的 id 只会得到一条「找不到」。
   * ⚠ `reason` 可选但**强烈建议给**：它跟着素材落进 snapshot，下一轮、下一台
   * 工作台读回来的就是这句话。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setReviewState]: z.object({
    assetId: IdSchema,
    state: GenerationReviewStateSchema,
    reason: z.string().trim().max(LIMITS.maxReviewReasonChars).optional(),
  }),
}

export const AssistantOperatorTurnSchema = z.object({
  /** 计划条，只在第一轮有意义。 */
  plan: z
    .array(z.string().trim().min(1).max(LIMITS.maxPlanItemChars))
    .max(LIMITS.maxPlanItems)
    .optional(),
  /** 说给用户听的话。⚠ **只写结论一句 + 下一步一句**，理由写进 `detail`。 */
  message: z.string().max(LIMITS.maxMessageChars).optional(),
  /**
   * 「为什么」那一段（2026-09-06）—— 客户端把它折起来，用户想读才展开。
   *
   * ⭐ 它存在的意义是**让「正文两句」这条约束有个落点**：不给解释一个地方放，
   * 模型只会把它塞回 `message`，于是每一轮回复都是一段小作文。
   * ⚠ 缺席 = 这一条没有可展开的解释，⛔ 不画一颗点开是空的「为什么」。
   */
  detail: z.string().trim().max(LIMITS.maxMessageChars).optional(),
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
  /**
   * 这一轮**引用了哪几条项目规则**（§10，拍板 23）。只收 id。
   *
   * ⭐ 只收 id 是这条契约的全部要点：规则原文由服务端从本轮读到的规则里查出来填，
   * 模型转述出来的那句话就不再是用户写下的那句了 —— 而规则薄卡的价值恰恰在于
   * 「这是你当时写的原话」。不在本轮规则表里的 id 被剥掉并 `logger.warn`，
   * ⛔ 不让整轮因为一个写错的 id 而作废（同 §9 的图示词表纪律）。
   */
  ruleHits: z.array(IdSchema).max(RULE_LIMITS.maxInPrompt).optional(),
  /**
   * 这一轮**还有什么要问用户**（§2.6 反问卡，2026-09-06 替换 `pending`）。
   *
   * ⚠ 一律宽松（与整份 turn schema 同一条纪律）：`id` 由服务端补、`multiSelect`
   * / `allowOther` 缺省、`visual` 收 `z.string()` 而不是枚举 —— 模型写错一个图示
   * id 只该丢掉那个图示，⛔ 不该让整轮读不出来（§9「校验纪律」逐字同源）。
   * 收窄发生在服务端出帧那一跳（`AssistantOperatorPlanQuestionSchema`）。
   * ⚠ `description` 在这一侧也**宽松**（可缺）：缺了由服务端剥掉那个选项，
   * ⛔ 不作废整轮 —— 而剥到少于两项时整道题一起丢。
   * ⚠ 缺省为空：绝大多数轮次没什么可问的，⛔ 别逼模型每轮编两道题。
   */
  questions: z
    .array(
      z.object({
        id: z.string().trim().max(LIMITS.maxIdChars).nullish(),
        header: z.string().trim().max(LIMITS.maxPlanItemChars).nullish(),
        question: z.string().trim().min(1).max(LIMITS.maxPlanItemChars),
        multiSelect: z.boolean().nullish(),
        allowOther: z.boolean().nullish(),
        options: z
          .array(
            z.object({
              id: z.string().trim().max(LIMITS.maxIdChars).nullish(),
              label: z
                .string()
                .trim()
                .min(1)
                .max(PLAN_LIMITS.maxOptionLabelChars),
              description: z
                .string()
                .trim()
                .max(PLAN_LIMITS.maxOptionDescriptionChars)
                .nullish(),
              recommended: z.boolean().nullish(),
              visual: z.string().trim().max(LIMITS.maxIdChars).nullish(),
              assetUrl: z
                .string()
                .trim()
                .max(LIMITS.maxIdChars * 4)
                .nullish(),
            }),
          )
          .max(PLAN_LIMITS.maxOptions),
      }),
    )
    .max(PLAN_LIMITS.maxQuestions)
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

/**
 * 花钱档：**只有 `payload`，没有 `inverse`，也没有 `result`**（§6 第三档）。
 *
 * ⭐ 这个函数签名就是「这一步撤不掉」本身 —— 与 `mutatingStep` 把 `inverse` 写成
 * 必填是同一手法的反面。⛔ 别给它补一个空 `inverse` 去「统一形状」：那会让日志条
 * 上多出一颗点了没反应的撤销钮，而撤销的位置由结果卡顶着。
 */
function spendStep<T extends AssistantOperatorTool, P extends z.ZodType>(
  tool: T,
  payload: P,
) {
  return z.object({
    ...STEP_BASE_SHAPE,
    tool: z.literal(tool),
    status: OK_STATUS_SCHEMA,
    payload,
  })
}

export const AssistantOperatorSearchResultAssetSchema = z.object({
  assetId: IdSchema,
  /**
   * 产物名（`图_012·银发少女立绘`，切片 N1）—— **模型在句子里指认这一张时用的
   * 就是它**，⛔ 不念 assetId（那串 uuid 它转手就抄错，而用户也核对不了）。
   * ⚠ 可选：名字是纯函数现算的（`lib/generation-name.ts`），⛔ 不是准入凭证 ——
   * 挂载照旧只认 `assetId`。
   */
  displayName: LabelSchema.optional(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  kind: AssistantOperatorSearchKindSchema,
  /** 截断过的提示词，供日志详情展示（拍板 18）。 */
  prompt: z.string().max(LIMITS.maxPriorStepSummaryChars).optional(),
  model: LabelSchema.optional(),
  createdAt: z.string().optional(),
  /**
   * 这张此刻的审核态（切片 X）—— **服务端从库里读出来的那一位**，不是模型写的。
   * ⚠ 缺席 = `pending`。`blocked` 的素材**照旧出现在结果里**（⛔ 不静默过滤：
   * 用户问「刚才那张呢」时，一句「被你否了」比一个空结果有用得多），只是挂不上
   * 首帧 / 尾帧（`blockedSource`）。
   */
  reviewState: GenerationReviewStateSchema.optional(),
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
  /** 站点域名，候选格子上那行可点的小字（点它开原页，⛔ 不是选用）。 */
  domain: LabelSchema.optional(),
  /**
   * **发布者**——站点显示名（Serper 的 `source`），取不到时由服务端回落成域名。
   *
   * ⚠ 与 `domain` 分开而不是二选一（切片 3b 改的口径）：早先服务端把两者塞进同一
   * 个 `domain` 字段（`entry.domain ?? entry.source`），于是格子上那行字有时是
   * `pixiv.net`、有时是「pixiv」——而用户要判断的两件事**恰恰是这两个**：这是哪个
   * 站（点得开、认得出），以及谁发的。合并的表现是两条信息各丢一半。
   */
  publisher: LabelSchema.optional(),
  /**
   * 这张能不能当**生成输入**（切片 3b，owner 定）。
   *
   * ⭐ 判据在 `constants/web-image-sources.ts`，**是启发式不是法律判断**（那边头注
   * 写着）。`false` 的候选照样画出来、照样点得开原页，只是「选用」那颗按钮关掉，
   * 服务端那一侧也按 `sourceNotUsable` 拒——⛔ 一个闸两处写，是因为按钮是给人看的，
   * 服务端那道才是真的守得住。
   * ⚠ 写成**必填**：缺席就成了「不知道能不能用」，而那是第三种状态，界面上没有
   * 它的位置。未知许可的那一档在 `sourceVerdict` 里，值仍然是可用。
   */
  usableAsInput: z.boolean(),
  /** 落在哪一档（`allowed` / `unknownLicense` / `blocked`）——格子上那行小字按它写。 */
  sourceVerdict: z.enum(WEB_IMAGE_SOURCE_VERDICTS),
  title: z.string().max(LIMITS.maxPriorStepSummaryChars).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

/**
 * 一条**文字**搜索结果（切片 3b）。
 *
 * ⚠ 它与 `AssistantOperatorWebImageSchema` 是两张表不是一张带可选字段的表：图那条
 * 的中心是一个可以被转存的字节流（`imageUrl` 必填），这条的中心是一句可以被引用的
 * 话（`snippet` + 出处）。合成一张的表现是两边各有一半字段永远是 `undefined`。
 */
export const AssistantOperatorWebSearchResultSchema = z.object({
  title: z.string().max(LIMITS.maxTitleChars),
  url: z.string().url(),
  snippet: z.string().max(LIMITS.maxWebSearchSnippetChars),
  /** 站点显示名/域名——时间线上那行小字，也是模型引用来源时该说的那个词。 */
  publisher: LabelSchema.optional(),
})

/**
 * 一条**证据**（`research`，2026-09-06）。
 *
 * ⚠ 它与 `AssistantOperatorWebSearchResultSchema` 是两张表不是一张带可选字段的表 ——
 * 判据是**多出来的那三个字段都是服务端算的、而且用户读得到**：
 *  · `publisher` 在这里是**必填**（网搜那条可选）：证据卡的全部意义是「谁说的」，
 *    一条没有出处的证据在卡上没有位置；取不到站名时服务端回落成域名。
 *  · `confidence` 由**源的层级**算出来（官方 / 百科 / 社区），⛔ 不由模型写 ——
 *    让模型给自己找的东西打分，它给的永远是 high。
 *  · `kind` 说这条是**一段话、一串标签、还是一张图**。标签那一档是这条链最值钱的
 *    东西：danbooru / 萌百分类给的「粉发 · 金瞳 · 下双马尾」是已经结构化的外观词，
 *    提示词直接吃得下，⛔ 不需要再过一次模型提取（少一次提取少一处幻觉）。
 *
 * ⚠ `url` 可选：danbooru 的共现标签这类证据没有单一页面可点。
 */
export const AssistantOperatorEvidenceSchema = z.object({
  title: z.string().max(RESEARCH_LIMITS.maxEvidenceTitleChars),
  url: z.string().url().optional(),
  publisher: z.string().max(RESEARCH_LIMITS.maxEvidencePublisherChars),
  snippet: z.string().max(RESEARCH_LIMITS.maxEvidenceSnippetChars),
  kind: z.enum(ASSISTANT_RESEARCH_EVIDENCE_KINDS),
  confidence: z.enum(ASSISTANT_RESEARCH_CONFIDENCES),
  /**
   * 官方 / 官方转载 / 资料 / 玩家整理 —— 由**发布域名**算出来
   * （`judgeEvidenceCredibility`）。⚠ 它与 `confidence` 不是两张表：三档皮肤是
   * 这四档压出来的，细的那一档留在这里给工具环与卡片上的那行小字。
   */
  credibility: z.enum(EVIDENCE_CREDIBILITY_VALUES),
  /**
   * 这一条答的是**这个角色**还是只答了作品。
   * 🔬 owner 真机的 10 条证据条条「相关」而条条只讲游戏本身 —— 「有没有证据」
   * 分不出这件事，所以判据独立成一个字段，由服务端算，⛔ 不由模型写。
   */
  scope: z.enum(ASSISTANT_RESEARCH_SCOPES),
})

export type AssistantOperatorEvidence = z.infer<
  typeof AssistantOperatorEvidenceSchema
>

export type AssistantOperatorWebSearchResult = z.infer<
  typeof AssistantOperatorWebSearchResultSchema
>

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
      /**
       * ⚠ 这里是**服务端真的发出去的那几条**（带 subject 时是多语言变体），
       * 不是模型写的那一条。日志详情按它列 —— 「它到底查了什么」是用户判断
       * 「为什么没找到官方图」的唯一依据。
       */
      query: z.string().trim().min(1).max(LIMITS.maxWebImageQueryChars),
      queries: z
        .array(z.string().min(1))
        .max(RESEARCH_LIMITS.maxImageQueryVariants)
        .optional(),
      subject: LabelSchema.optional(),
      preferOfficial: z.boolean().optional(),
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
  /**
   * 联网查文字（切片 3b）。⛔ **永远是 readStep**：它一个字节都不落、一个字段都
   * 不改——与 `search_web_images` 逐字同构。真要照查到的东西改表单，那是之后那条
   * `set_*` 的事，撤销也撤在那一条上。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.searchWeb,
    z.object({
      query: z.string().trim().min(1).max(LIMITS.maxWebSearchQueryChars),
      limit: z.number().int().positive().max(LIMITS.maxWebSearchResults),
    }),
    z.object({
      totalFound: z.number().int().nonnegative(),
      results: z
        .array(AssistantOperatorWebSearchResultSchema)
        .max(LIMITS.maxWebSearchResults),
    }),
  ),
  /**
   * 有目标的检索（2026-09-06）。⛔ **永远是 readStep**：它打的是只读接口，
   * 一个字节都不落、表单一个字都不改。
   *
   * ⚠ 载荷里带 `round`：多轮是这条工具的核心（第一轮定官方站、第二轮问外貌），
   * 而「这是第几轮」既是日志上要说的事，也是那道上限闸判的东西。
   * ⚠ `sources` 是**服务端真的打了哪几组**，不是模型请求的那几组 —— 模型不给时
   * 服务端自己挑，日志上该显示实际发生的事。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.research,
    z.object({
      goal: z.string().min(1).max(RESEARCH_LIMITS.maxGoalChars),
      entities: z
        .array(z.string().min(1).max(RESEARCH_LIMITS.maxEntityChars))
        .max(RESEARCH_LIMITS.maxEntities),
      sources: z.array(z.enum(ASSISTANT_RESEARCH_SOURCES)),
      round: z.number().int().positive().max(RESEARCH_LIMITS.maxRoundsPerTurn),
    }),
    z.object({
      totalFound: z.number().int().nonnegative(),
      evidence: z
        .array(AssistantOperatorEvidenceSchema)
        .max(RESEARCH_LIMITS.maxEvidenceItems),
    }),
  ),
  /**
   * 读一页正文（2026-09-06）。⛔ 也永远是 readStep —— 它只把一段文字摆到桌上。
   * ⚠ `focus` 在载荷里是 `null` 而不是缺席：日志上「他带着什么问题去读的」
   * 与「他没带问题」是两件不同的事，缺席表达不了后者（同 `critiqueResult.goal`）。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.readUrl,
    z.object({
      url: z.string().url(),
      focus: z.string().max(RESEARCH_LIMITS.maxFocusChars).nullable(),
    }),
    z.object({
      title: z.string().max(RESEARCH_LIMITS.maxEvidenceTitleChars),
      url: z.string().url(),
      excerpt: z.string().max(RESEARCH_LIMITS.maxReadUrlExcerptChars),
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
      /**
       * 落到哪个槽（第二期）。**必填**而不是可选：客户端按它决定写 0 槽、1 槽还是
       * 追加一张 —— 缺席时那一跳只能猜，而猜错的表现是「助手说换了尾帧，画面上
       * 换的是首帧」。服务端在规划期就把它收窄成四个值之一（默认 `reference`）。
       */
      slot: AssistantOperatorReferenceSlotSchema,
    }),
    /**
     * 撤销 = 按 id 把它摘掉。
     * ⚠ `slot` 在逆操作里**也带着**：摘首帧是「把 0 槽清空」，摘一张普通参考图是
     * 「把这张从列表里删掉」—— 两者在客户端是不同的动作。
     */
    z.object({ assetId: IdSchema, slot: AssistantOperatorReferenceSlotSchema }),
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
    /**
     * ⚠ **两支**（第二期）：图片档给 `imageUrl`，视频档给 `videoUrl`。用 union 而
     * 不是「`imageUrl` 里塞一条 mp4 地址」——后者会让卡片把视频画进 `<img>`，
     * 而那是一个空白格子加一次静默失败。
     */
    z.union([
      z.object({
        imageUrl: z.string().url(),
        thumbnailUrl: z.string().url().optional(),
        modelLabel: LabelSchema.optional(),
        /** 模型自己说的「这一轮想要什么」；没写就是 `null`。 */
        goal: z.string().max(LIMITS.maxCritiqueGoalChars).nullable(),
      }),
      z.object({
        videoUrl: z.string().url(),
        thumbnailUrl: z.string().url().optional(),
        modelLabel: LabelSchema.optional(),
        goal: z.string().max(LIMITS.maxCritiqueGoalChars).nullable(),
      }),
    ]),
    z.union([
      AssistantOperatorCritiqueSchema.extend({
        /**
         * 用户选的那条路看不了图、这一轮借了别的模型来看。
         * ⚠ 如实说出来 —— 「你选的是 DeepSeek，但看图用的是 Gemini」
         * （形态照 `ResolvedVisionRoute.borrowed`）。
         */
        borrowedVisionRoute: z.boolean(),
      }),
      /**
       * 视频档（第二期）。客户端靠 `frames` 在不在分支 —— 两支的必填字段
       * （`findings` vs `frames` + `verdicts`）互不相容，parse 不会走岔。
       */
      AssistantOperatorVideoCritiqueSchema.extend({
        borrowedVisionRoute: z.boolean(),
      }),
    ]),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate,
    /**
     * ⛔ 这里是整条链上离「生成」最近的地方，也就到此为止：`primed: true` 只是
     * 让生成键亮起来并算价，服务端不创建任何 generation（见词表文件头注）。
     */
    z.object({
      primed: z.literal(true),
      /** 助手给这一枪起的名（切片 X）——客户端提交时透传给 `displayLabel`。 */
      label: z
        .string()
        .trim()
        .min(1)
        .max(LIMITS.maxGenerationLabelChars)
        .optional(),
    }),
    z.object({ primed: z.literal(false) }),
  ),
  /**
   * 请求生成（§6 花钱档）。
   *
   * ⭐ **载荷就是硬确认卡上写的那几行**（`AssistantOperatorGenerationRequestSchema`
   * 一份形状两处用）。服务端到此为止：它不建 generation、不扣 credit、不调
   * provider —— 客户端 `applyOperatorStep` 拿着这份载荷去按宿主那颗生成键。
   * ⛔ 没有 `inverse`：钱花出去了撤不回来，回头路是结果卡不是撤销钮。
   */
  spendStep(
    ASSISTANT_OPERATOR_TOOL_IDS.requestGeneration,
    AssistantOperatorGenerationRequestSchema,
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
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.readProjectRules,
    z.object({ scope: ProjectRuleScopeSchema.nullable() }),
    z.object({ rules: z.array(ProjectRuleSchema).max(RULE_LIMITS.maxPerUser) }),
  ),
  /**
   * 记一条规则（§10）。
   *
   * ⚠ 全表唯一一条后果**落在服务端**的改动型 step：`payload` 里那条 `ruleId`
   * 是库里刚写出来的那一行，所以 `inverse` 直接放它 —— ⛔ 不像 `mount_lora`
   * 那样放一个候选 id 让客户端反查，这里没有「落地地址在客户端才产生」那回事。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule,
    ProjectRuleSchema.extend({ ruleId: IdSchema }).omit({ id: true }),
    z.object({ ruleId: IdSchema }),
  ),
  /**
   * 上下文卡两条（K1）——都是**读**，没有 `inverse`，日志条上不该出现撤销。
   *
   * ⚠ 列表那条的 `result` 只带**卡摘要**（id / 类型 / 名字 / 一句话 / 有没有硬
   * 否定 / 几张图），⛔ 不带正文：正文四千字，塞进 SSE 载荷等于让每一条日志都
   * 拖着一整份设定过网。正文由 `read_context_card` 单独拉。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.listContextCards,
    z.object({ kind: ContextCardKindSchema.nullable() }),
    z.object({
      cards: z
        .array(ContextCardDigestSchema)
        .max(CONTEXT_CARD_LIMITS.maxReadResults),
    }),
  ),
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.readContextCard,
    z.object({ cardId: IdSchema }),
    ContextCardSchema.nullable(),
  ),
  /**
   * 标一张产物的审核态（切片 X）。
   *
   * ⚠ 与 `add_project_rule` 同一档：后果**落在服务端**（写 `Generation.snapshot`），
   * 所以 `inverse` 里放的是**服务端读到的旧值**——撤销 = 写回去，⛔ 不需要客户端
   * 反查任何对照表。
   * ⚠ 载荷里带 `displayName` 与 `url`：日志条上那一格要画得出「你否掉的是这张」，
   * 而客户端此刻手上未必有这条素材（它可能来自上一轮）。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setReviewState,
    z.object({
      assetId: IdSchema,
      state: GenerationReviewStateSchema,
      reason: z.string().max(LIMITS.maxReviewReasonChars).optional(),
      displayName: LabelSchema.optional(),
      url: z.string().url().optional(),
    }),
    z.object({ assetId: IdSchema, state: GenerationReviewStateSchema }),
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

/**
 * **计划卡的素材**（§2.6 / §5，切片 2a）—— 紧跟 `plan` 之后，第一个 `step` 之前。
 *
 * ⛔ 收到它**不等于**要出卡：出不出由 `lib/studio-operator-plan.ts` 的
 * `shouldShowPlanCard` 判（owner 2026-09-06「客户端硬判」）。这一帧只是把判据要
 * 用的三样东西摆出来 —— 阶段、反问题、预估。
 * ⚠ `questions` 允许为空数组：多数轮次没什么可问的，卡上就只有阶段列表 +「开始」。
 */
export const AssistantOperatorPlanRequestEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.planRequest),
  /** ⚠ 带 `id` 而不是裸字符串：待定项要挂在阶段旁边，而序号会随重规划变。 */
  steps: z
    .array(
      z.object({
        id: IdSchema,
        label: z.string().trim().min(1).max(LIMITS.maxPlanItemChars),
      }),
    )
    .min(1)
    .max(LIMITS.maxPlanItems),
  questions: z
    .array(AssistantOperatorPlanQuestionSchema)
    .max(PLAN_LIMITS.maxQuestions),
  estimate: AssistantOperatorPlanEstimateSchema,
  /** 服务端**观察到**的理由 —— 证据不是判定，见常量头注。 */
  reason: z.enum(ASSISTANT_PLAN_REQUEST_REASONS),
})

/**
 * 花钱硬确认（§6 第三档）。它之后这条流结束（`awaiting_confirm`）。
 *
 * ⚠ 用户点「生成」**不是续跑这条流**：客户端带 `autoApprove` 重发一轮，服务端这
 * 次放行并吐 `request_generation` 那一步，扳机仍然在客户端扣（§5 流程图 H → G）。
 */
export const AssistantOperatorSpendRequestEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.spendRequest),
  tier: z.literal(ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.spend),
  request: AssistantOperatorGenerationRequestSchema,
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
  /**
   * 三档里的哪一档（§6）—— **恒 `overwrite`**（切片 3a 收成必填）。
   *
   * ⛔ 不是 `z.enum(三档)`：花钱档有自己的帧（`spend_request`），免费档压根不发帧。
   * 写成三选一等于允许一个「这张覆盖三选卡其实说的是花钱」的载荷存在，而那张卡
   * 的三颗按钮（追加 / 覆盖 / 保留）对花钱一件都答不上。
   * ⚠ 从可选收成必填是有意的（切片 2a 的注释里写着到这一片收）：可选意味着客户端
   * 得回答「缺席算哪一档」，而那正是兼容层的形状。
   */
  tier: z.literal(ASSISTANT_OPERATOR_CONFIRM_TIER_IDS.overwrite),
  field: AssistantOperatorConfirmFieldSchema,
  /** 用户已经写在那儿的东西（截断）—— 小条上要让人认出「哦是我写的那段」。 */
  have: z.string().max(LIMITS.maxConfirmHaveChars),
  /** 助手想写进去的东西（截断同上）。 */
  proposed: z.string().max(LIMITS.maxConfirmHaveChars),
})

/**
 * 说给用户听的一条。
 *
 * ⚠ `detail` 是**可折叠的「为什么」**（2026-09-06）：正文只留结论 + 下一步，
 * 解释放这里由客户端折起来。⛔ 别把它并进 `text` —— 并进去之后「两句」这条
 * 约束在结构上就没有落点了，只能靠模型自觉。
 */
export const AssistantOperatorMessageEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.message),
  text: z.string().max(LIMITS.maxMessageChars),
  detail: z.string().max(LIMITS.maxMessageChars).optional(),
})

/**
 * 正文的逐字增量（§4.1「正文按帧累积」）。
 *
 * ⚠ `text` 是**这一帧新解出来的那几个字**，不是累积值 —— 累积在客户端做。
 * ⛔ 别把它写成「到目前为止的全文」：那样每一帧都要重发整段正文，一段 400 字的
 * 回复会在网线上跑成几十 KB。
 * ⚠ 不设 `min(1)`：空增量在服务端就被挡掉了（`createOperatorMessageStreamer`
 * 无字可吐时返回空串，调用方不发帧），这里再拒一次只会把一条本该无害的帧变成
 * 整流报错。
 */
export const AssistantOperatorMessageDeltaEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.messageDelta),
  text: z.string().max(LIMITS.maxMessageChars),
})

/**
 * 助手引用了一条项目规则（§10，拍板 23）—— 规则薄卡收的就是它。
 *
 * ⚠ 载荷里的 `text` / `createdAt` **由服务端填**（模型只给 id），所以这里可以、
 * 也必须写成必填：薄卡上要显示的是用户当时写下的原话与日期，不是模型的转述。
 * ⚠ 它没有 step id：引用一条规则不是一步，见 `ASSISTANT_OPERATOR_EVENTS.ruleHit`。
 */
export const AssistantOperatorRuleHitEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.ruleHit),
  ruleId: IdSchema,
  /** 规则原文，逐字。 */
  text: z.string().trim().min(1).max(RULE_LIMITS.maxTextChars),
  source: ProjectRuleSchema.shape.source,
  /** ISO 串 —— 薄卡上那行「记于 YYYY-MM-DD」取它的日期段。 */
  createdAt: z.string(),
})

/**
 * **歧义反问单选**（§3.3 第 5 行 / §7，切片 3a）—— `StudioOperatorAssetChoiceCard`
 * 收的就是它。它之后这条流结束（`awaiting_confirm`）。
 *
 * ⚠ `options[].assetUrl` **必填**：这张卡的每一格就是一张缩略图（§11.4「反问单选
 * 卡」的 `grid-cols-4` + `aspect-3/4`），没有图的选项在这张卡上画不出来 ——
 * 那种问题该走计划卡的待定项，不是这里。
 * ⚠ `id` 是**客户端要拿去插 @chip 的那个身份**：素材库里的 assetId，或没有 id 时
 * 服务端拿 URL 兜的一个稳定串。
 */
export const AssistantOperatorChoiceRequestEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.choiceRequest),
  /** 助手问的那句原话。 */
  question: z.string().trim().min(1).max(CHOICE_LIMITS.maxQuestionChars),
  options: z
    .array(
      z.object({
        id: IdSchema,
        label: LabelSchema,
        assetUrl: z.string().url(),
      }),
    )
    .min(CHOICE_LIMITS.minOptions)
    .max(CHOICE_LIMITS.maxOptions),
})

/**
 * **成本计数帧**（切片 X）—— 词表 `ASSISTANT_OPERATOR_EVENTS.costTick` 的头注写着
 * 它为什么不是一步、也不是账单。
 *
 * ⚠ `label` 是 **i18n key**（`ASSISTANT_COST_TICK_LABEL_KEYS`），⛔ 不是人话：
 * 服务端不知道用户此刻的界面语言（`responseLanguage` 说的是助手说话用哪种语言，
 * 那是另一件事）。
 * ⚠ `units` 是**这一帧数了几次**，不是累计值：累计在客户端做。⛔ 别改成累计 ——
 * 那样每一帧都得知道前面所有帧，而这条流本来就允许客户端中途接进来。
 */
export const AssistantOperatorCostTickEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.costTick),
  kind: z.enum(ASSISTANT_COST_TICK_KINDS),
  units: z.number().int().positive(),
  label: z.string().trim().min(1).max(LIMITS.maxIdChars),
})

export type AssistantOperatorCostTickEvent = z.infer<
  typeof AssistantOperatorCostTickEventSchema
>

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
  AssistantOperatorPlanRequestEventSchema,
  AssistantOperatorStepEventSchema,
  AssistantOperatorConfirmRequestEventSchema,
  AssistantOperatorSpendRequestEventSchema,
  AssistantOperatorMessageEventSchema,
  AssistantOperatorMessageDeltaEventSchema,
  AssistantOperatorRuleHitEventSchema,
  AssistantOperatorChoiceRequestEventSchema,
  AssistantOperatorCostTickEventSchema,
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
/** 计划卡（§2.6）收的那一帧。 */
export type AssistantOperatorPlanRequestEvent = z.infer<
  typeof AssistantOperatorPlanRequestEventSchema
>
/** 花钱硬确认卡（§11.4）收的那一帧。 */
export type AssistantOperatorSpendRequestEvent = z.infer<
  typeof AssistantOperatorSpendRequestEventSchema
>
export type AssistantOperatorConfirmRequestEvent = z.infer<
  typeof AssistantOperatorConfirmRequestEventSchema
>
/** 规则薄卡（§2.21 / §4.2）收的那一帧。 */
export type AssistantOperatorRuleHitEvent = z.infer<
  typeof AssistantOperatorRuleHitEventSchema
>
/** 歧义反问单选卡（§11.4「反问单选卡」）收的那一帧。 */
export type AssistantOperatorChoiceRequestEvent = z.infer<
  typeof AssistantOperatorChoiceRequestEventSchema
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

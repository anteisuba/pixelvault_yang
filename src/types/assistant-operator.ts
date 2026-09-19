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
import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'

import { AdvancedParamsSchema, CivitaiImageRecipeSchema } from '@/types'
import {
  ReferenceAnalysisSchema,
  ReferenceProfilesSchema,
} from '@/types/assistant-reference-analysis'

import {
  ASSISTANT_OPERATOR_CONFIRM_CHOICES,
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES,
  ASSISTANT_OPERATOR_ENTRY_TOOL_IDS,
  ASSISTANT_OPERATOR_ENTRY_TOOLS,
  type AssistantOperatorEntryTool,
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
  ASSISTANT_OPERATOR_CRITIQUE_FRAME_LABELS,
  ASSISTANT_OPERATOR_REFERENCE_SLOTS,
  ASSISTANT_OPERATOR_REJECT_REASON_IDS,
  ASSISTANT_OPERATOR_RESUME_LIMITS as RESUME_LIMITS,
  ASSISTANT_OPERATOR_SEARCH_KINDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_STOP_REASONS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  ASSISTANT_OPERATOR_TOOLS,
  ASSISTANT_OPERATOR_VERBS,
  ASSISTANT_OPERATOR_VERDICT_SEVERITIES,
  ASSISTANT_OPERATOR_WRITE_MODES,
  ASSISTANT_PLAN_CARD_LIMITS as PLAN_LIMITS,
  ASSISTANT_PROJECT_RULE_LIMITS as RULE_LIMITS,
  PROJECT_RULE_KIND_ALIASES,
  PROJECT_RULE_TEXT_ARG_ALIASES,
  ASSISTANT_ASSET_WRITE_LIMITS as ASSET_WRITE_LIMITS,
  ASSISTANT_RESEARCH_CONFIDENCES,
  ASSISTANT_RESEARCH_EVIDENCE_KINDS,
  ASSISTANT_RESEARCH_LIMITS as RESEARCH_LIMITS,
  ASSISTANT_RESEARCH_SCOPES,
  ASSISTANT_RESEARCH_SOURCES,
  ASSISTANT_EVIDENCE_REF_PATTERN,
  ASSISTANT_EVIDENCE_RECALL_LIMITS as EVIDENCE_RECALL_LIMITS,
  ASSISTANT_ROUND_SUMMARY_LIMITS as ROUND_LIMITS,
  ASSISTANT_SOURCE_ALLOWLIST_LIMITS as SOURCE_ALLOWLIST_LIMITS,
  GENERATION_REVIEW_STATES,
  type AssistantOperatorTool,
} from '@/constants/assistant-operator'
import { ASSISTANT_PLAN_VISUAL_IDS } from '@/constants/assistant-plan-visuals'
/**
 * ⭐ 画布那两条**原样借 v4 的 op 词表**（进度表 22）：词表、确认三档与 inverse
 * 形状在 `constants/node-assistant-ops.ts` 里已经是一张封闭的真值表，画布的执行器
 * 逐条读的就是它。⛔ 别在这里抄第二份 —— 两份的分叉表现是「这条 op 在画布上要
 * 确认、在面板上直接落了」。
 */
import {
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_OP_V4_SPECS,
  NODE_ASSISTANT_OPS_V4,
  type NodeAssistantOpV4Id,
} from '@/constants/node-assistant-ops'
import {
  NodeAssistantOpV4Schema,
  NodeAssistantPlanRerunDownstreamOpSchema,
  NodeAssistantGenerateV4OpSchema,
} from '@/types/node-assistant-ops'
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
/**
 * ⚠ 来源 token 的那把刀只有一份（§9.3）：临时名单与库里的来源规则收的是同一种
 * 东西，⛔ 不在这里另写一个正则。
 */
import {
  ProjectRuleKindSchema,
  ProjectRuleSchema,
  ProjectRuleScopeSchema,
  ProjectRuleSourceTokenSchema,
} from '@/types/assistant-persona'

// ─── 小件 ────────────────────────────────────────────────────────

const IdSchema = z.string().trim().min(1).max(LIMITS.maxIdChars)
const LabelSchema = z.string().trim().min(1).max(LIMITS.maxLabelChars)
const ParamValueSchema = z.string().trim().min(1).max(LIMITS.maxParamValueChars)
/** ⚠ 允许空串：它是「这个框现在是空的」，与「没有这个框」（字段缺席）不是一回事。 */
const TextValueSchema = z.string().max(LIMITS.maxPromptChars)

/**
 * 素材库四条写操作共用的三块（v2 §10）。
 *
 * ⚠ 一次最多 20 件写在**这里**（schema 层）而不是规划器：它是结构护栏不是值域
 * —— 模型写 50 个 id 不是「挑错了一个值」，是它把助手当批处理器用了，而 §10
 * 的原话就是「一次动更多就该让用户去素材库自己框选」。
 */
const AssetIdListSchema = z
  .array(IdSchema)
  .min(1)
  .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite)

/** 一个标签就是一个词。⚠ 去重留给服务端：模型写重不该整轮作废。 */
const AssetTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSET_WRITE_LIMITS.maxTagChars)

/**
 * `inverse` 里那几张**逐条记下的原值**（§10 那条 ⚠）。
 *
 * ⛔ 别把它简化成「一个布尔 / 一个文件夹 id 配一串 assetId」：一批 20 张里
 * 各自的原值不同，共用一个值撤销出来的是一个**从没存在过的状态**。
 */
const AssetTagEntrySchema = z.object({
  assetId: IdSchema,
  tags: z.array(AssetTagSchema).max(ASSET_WRITE_LIMITS.maxTagsPerWrite),
})

const AssetFavoriteEntrySchema = z.object({
  assetId: IdSchema,
  value: z.boolean(),
})

const AssetFolderEntrySchema = z.object({
  assetId: IdSchema,
  /** `null` = 它原来不在任何文件夹里（素材库里的「未归档」）。 */
  folderId: IdSchema.nullable(),
})

export const AssistantOperatorAssetTagEntrySchema = AssetTagEntrySchema
export const AssistantOperatorAssetFavoriteEntrySchema =
  AssetFavoriteEntrySchema
export const AssistantOperatorAssetFolderEntrySchema = AssetFolderEntrySchema

export type AssistantOperatorAssetTagEntry = z.infer<typeof AssetTagEntrySchema>
export type AssistantOperatorAssetFavoriteEntry = z.infer<
  typeof AssetFavoriteEntrySchema
>
export type AssistantOperatorAssetFolderEntry = z.infer<
  typeof AssetFolderEntrySchema
>

export const AssistantOperatorDomainSchema = z.enum(ASSISTANT_OPERATOR_DOMAINS)
export const AssistantOperatorToolSchema = z.enum(ASSISTANT_OPERATOR_TOOLS)
/**
 * **五个入口工具**（v2 §2.1）—— 模型写在 `tool.name` 里的那个词。
 * ⚠ 值域与 `AssistantOperatorVerbSchema` 逐字相同（§2.4 对齐）。
 */
export const AssistantOperatorEntryToolSchema = z.enum(
  ASSISTANT_OPERATOR_ENTRY_TOOLS,
)
/** `step` 帧上那个必填的一等字段（v2 §3.1）。 */
export const AssistantOperatorVerbSchema = z.enum(ASSISTANT_OPERATOR_VERBS)
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
  quality: AdvancedParamsSchema.shape.quality.nullable(),
  preview: AdvancedParamsSchema.shape.preview.nullable(),
  background: AdvancedParamsSchema.shape.background.nullable(),
  qualityOptions: z
    .array(ParamValueSchema)
    .max(LIMITS.maxSpecOptions)
    .optional(),
  backgroundOptions: z
    .array(ParamValueSchema)
    .max(LIMITS.maxSpecOptions)
    .optional(),
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

/**
 * **当前模型专属的那一颗旋钮**（进度表 11 的 chip 行 → 进度表 21 的 `set_capability`）。
 *
 * ⚠ 这一节是**逐模型派生**的（`lib/model-capability-chips.ts` 那张唯一的派生表），
 * ⛔ 不是一份固定字段表：换个模型整行换掉。所以助手能设哪几个键，只能问快照。
 * ⚠ 整节缺席 = 这个工作台（或这个模型）没有专属 chip 行 —— 与全表其余每一节同
 * 一条规矩：缺席 = 没有这个控件，`set_capability` 按 `noSuchControl` 拒。
 * ⚠ `available: false` = chip 画着但点不动（今天只有一种成因：这颗要先挂参考图）。
 * ⛔ 不隐藏它 —— 隐藏了助手与用户都不知道这个模型有这档能力。
 */
export const AssistantOperatorSnapshotCapabilitySchema = z.object({
  /** 键 = `ProviderCapability`（`quality` / `guidanceScale` / `preview` …）。 */
  key: ParamValueSchema,
  /** 三种形态，与 `getCapabilityFieldType` 逐字同源。 */
  kind: z.enum(['select', 'slider', 'toggle']),
  /** 现值。`null` = 用户没设过（跟着缺省值走）。 */
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  /** 缺省值 —— 撤销回 `null` 之后实际生效的那个。 */
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
  /** `select` 的候选。⛔ 空表不下发这颗 chip（派生层已经滤过）。 */
  options: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions).optional(),
  /** `slider` 的值域。 */
  range: z
    .object({
      min: z.number(),
      max: z.number(),
      step: z.number().optional(),
    })
    .optional(),
  /** 此刻点得动吗（`false` = 要先挂一张参考图）。 */
  available: z.boolean(),
})

export type AssistantOperatorSnapshotCapability = z.infer<
  typeof AssistantOperatorSnapshotCapabilitySchema
>

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
  /**
   * 库记录上的触发词。`null` = 这把没有触发词。
   *
   * ⛔ **不是空串**：空串会被读成「有一个空的触发词」，于是状态块里印出一对空引号，
   * 而模型会以为要把它写进正文。构造快照的人负责把空白归一成 `null`。
   */
  triggerWord: z.string().trim().min(1).max(LIMITS.maxLabelChars).nullable(),
  /**
   * 那枚触发词 chip 现在是**开**还是**关**（装配台上用户点得动它）。
   *
   * ⚠ 无触发词时恒 `true`（没有 chip 可关），语义上不参与判断。
   * ⚠ 真值只在 `LoraWorkbench` 的 `disabledTriggerIds` 手里，沿宿主入参传下来 ——
   * ⛔ 谁都不许照着挂载栈再算一份：用户点 chip 时只会更新其中一份。
   */
  triggerEnabled: z.boolean(),
  /** 作者推荐提示词（`LoraAssetRecord.recommendedPrompt`）。`null` = 没有。 */
  recommendedPrompt: z
    .string()
    .trim()
    .min(1)
    .max(LIMITS.maxPromptChars)
    .nullable(),
  /**
   * 这把 LoRA 的**来源图提示词**（Civitai 挖来的那几条，装配台「来源配方」用的
   * 同一份数据）。**空数组 = 手上没有**（没 provenance / 还没取到 / 真的一条都没挖到）。
   *
   * ⭐ 它是取材阶梯第二档（`buildSourceMatchedLoraPrompt`）唯一喂得动的料：没有它，
   * 那一档拿到的只有触发词，于是永远 `reliable === false` 而每次都落第三档骨架。
   * ⛔ 不是数组套对象：`label` / `sampleCount` / `source` 那几格取材阶梯一格都不读，
   * 塞进快照只是让每一步的往返更贵。
   */
  sourcePrompts: z
    .array(z.string().trim().min(1).max(LIMITS.maxPromptChars))
    .max(LIMITS.maxLoraSourcePrompts),
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

export const AssistantLoraParametersSchema = z
  .object({
    steps: AdvancedParamsSchema.shape.steps.unwrap().nullable().optional(),
    guidanceScale: AdvancedParamsSchema.shape.guidanceScale
      .unwrap()
      .nullable()
      .optional(),
    runnerSeed: AdvancedParamsSchema.shape.runnerSeed
      .unwrap()
      .nullable()
      .optional(),
    runnerWidth: AdvancedParamsSchema.shape.runnerWidth
      .unwrap()
      .nullable()
      .optional(),
    runnerHeight: AdvancedParamsSchema.shape.runnerHeight
      .unwrap()
      .nullable()
      .optional(),
    runnerSampler: AdvancedParamsSchema.shape.runnerSampler
      .unwrap()
      .nullable()
      .optional(),
    runnerScheduler: AdvancedParamsSchema.shape.runnerScheduler
      .unwrap()
      .nullable()
      .optional(),
  })
  .strict()
export type AssistantLoraParameters = z.infer<
  typeof AssistantLoraParametersSchema
>

/**
 * 画布快照的**一个节点**（进度表 22）。
 *
 * ⚠ 只放模型改得动的那几格：id（它下一步要写回来的那一个）、名字（它和用户
 * 都用这个词指认）、族与子型（决定它有哪些槽）、正文 / 提示词、选的模型、
 * 接进来的几条线。⛔ 不放位置、尺寸、版本表 —— 那些它一格都改不了，塞进去
 * 只会挤掉真正有用的那几面镜。
 */
export const AssistantOperatorCanvasNodeSchema = z.object({
  id: IdSchema,
  name: LabelSchema,
  kind: LabelSchema,
  subtype: LabelSchema.optional(),
  /** 文本节点的正文 / 媒体节点的提示词。⚠ 截断，整段正文按需走 `read_state`。 */
  text: z.string().max(LIMITS.maxMessageChars).optional(),
  model: LabelSchema.optional(),
  /** 这个节点上选得动的模型 —— ⛔ 没有这一格模型就会编一个不存在的 id。 */
  availableModels: z
    .array(LabelSchema)
    .max(LIMITS.maxAvailableModels)
    .optional(),
  /** 接进来的线：哪个槽、从哪个节点来。 */
  inputs: z
    .array(z.object({ slot: LabelSchema, from: IdSchema }))
    .max(ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot)
    .optional(),
  /** 有没有产出。⚠ 是布尔不是 URL —— 挂图那一跳认的是节点 id，不是地址。 */
  hasOutput: z.boolean().optional(),
})

/**
 * 一面镜 —— **分层就落在这个 schema 上**（进度表 22）。
 *
 * ⭐ 当前镜与它左右各一面 `expanded: true`，带完整节点表；其余每面只出一行
 * 标题 + 节点数。为什么分层而不是整张画布全发：每一步都是一次完整的 LLM 往返
 * （`maxSteps` 只有 8），一张六十镜的画布全展开会把整轮步数烧在读上下文上。
 * ⚠ 折叠的镜**不是看不见**：模型知道它叫什么、有几个节点，要看细节就把焦点
 * 挪过去再读一次 —— ⛔ 别为此加一条「展开第 N 镜」的工具，那是 `read_state`
 * 自己该做的事。
 */
export const AssistantOperatorCanvasShotSchema = z.discriminatedUnion(
  'expanded',
  [
    z.object({
      expanded: z.literal(true),
      shotNo: z.number().int().min(1).max(999).nullable(),
      title: LabelSchema,
      nodes: z
        .array(AssistantOperatorCanvasNodeSchema)
        .max(ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot),
    }),
    z.object({
      expanded: z.literal(false),
      shotNo: z.number().int().min(1).max(999).nullable(),
      title: LabelSchema,
      nodeCount: z.number().int().min(0),
    }),
  ],
)

export const AssistantOperatorCanvasSnapshotSchema = z.object({
  /** 焦点所在的那一面镜 —— 展开哪三面由它定。`null` = 还没落焦点。 */
  currentShotNo: z.number().int().min(1).max(999).nullable(),
  shots: z
    .array(AssistantOperatorCanvasShotSchema)
    .max(ASSISTANT_OPERATOR_CANVAS_LIMITS.maxShotLines),
  /** 用户此刻选中的那几个节点（⌘K / 右键「问助手」带过来的就是它们）。 */
  selectedNodeIds: z
    .array(IdSchema)
    .max(ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot)
    .default([]),
})

export type AssistantOperatorCanvasNode = z.infer<
  typeof AssistantOperatorCanvasNodeSchema
>
export type AssistantOperatorCanvasShot = z.infer<
  typeof AssistantOperatorCanvasShotSchema
>
export type AssistantOperatorCanvasSnapshot = z.infer<
  typeof AssistantOperatorCanvasSnapshotSchema
>

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
  /**
   * ⚠ 缺席 = 这个工作台没有专属 chip 行（视频 / LoRA / 画布今天都是这一档，
   * 图片档在没有专属能力的模型上也是）。见 schema 头注。
   */
  capabilities: z
    .array(AssistantOperatorSnapshotCapabilitySchema)
    .max(LIMITS.maxSpecOptions)
    .optional(),
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
  loraParameters: AssistantLoraParametersSchema.optional(),
  sourceRecipe: CivitaiImageRecipeSchema.optional(),
  /**
   * ⚠ 缺席 = 这个宿主不是画布（图片 / 视频 / LoRA 三台工作台）。画布域的
   * `read_state` 读的就是这一格，⛔ 服务端一个字段都不查库 —— 库里没有
   * 「用户此刻把焦点放在第几镜」。
   */
  canvas: AssistantOperatorCanvasSnapshotSchema.optional(),
})

export type AssistantOperatorSnapshot = z.infer<
  typeof AssistantOperatorSnapshotSchema
>

// ─── ① 请求 ─────────────────────────────────────────────────────

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
  /**
   * ⭐ **这道题原本问的是什么**（v2 §3.4 落账规则，2026-09-12 真机 bug）。
   *
   * `questionId` / `optionIds` 是**上一条流现编的合成 id**（`question-1` /
   * `option-1-1`，见 `normalizePlanQuestions` 的头注），而服务端零会话态 ——
   * 下一轮手上只有这几个 id，谁都反查不回题面与选项文案。真机表现很具体：
   * 用户在卡上点完「角色设计展示立绘」，模型连着四轮重问「画面以哪位角色为主体」。
   * 所以答复必须**自带文本**：这两格在，下一轮的提示词里才写得出一句
   * 「用户对『…』的回答是『…』」。
   * ⚠ 可选是为了老客户端与覆盖三选那一支（它走 `confirmations`）：缺席时照旧
   *   只渲染 id，⛔ 不为此拒掉整条请求。
   */
  question: z.string().trim().max(PLAN_LIMITS.maxQuestionChars).optional(),
  /** 被点中的那几个选项的**文案**（与 `optionIds` 同序）。 */
  optionLabels: z
    .array(z.string().trim().max(PLAN_LIMITS.maxOptionLabelChars))
    .max(PLAN_LIMITS.maxOptions)
    .optional(),
})

export type AssistantOperatorPlanAnswer = z.infer<
  typeof AssistantOperatorPlanAnswerSchema
>

export const AssistantOperatorMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /**
   * ⭐ **这条 user 消息是问题卡上的一次选择**（v2 §3.4 落账规则，2026-09-12）。
   *
   * `planAnswers` 只覆盖**当次请求**：再下一轮它就不在请求里了，而对话里当时
   * 也只有一行 UI 系统行（不进 `messages`）—— 于是「两轮前用户已经答过」这件事
   * 对模型不存在，真机表现是同一道题被问第三次。所以答复现在**同时**是一条
   * 自带题面的 user 消息，这一格是它的结构化那一半：服务端据此把历史里的答案
   * 与本轮的 `planAnswers` 用同一个渲染器合并（见 `collectSettledAnswers`）。
   * ⚠ 缺席 = 普通对白。⛔ 不靠正文做模式匹配去认它。
   */
  answered: AssistantOperatorPlanAnswerSchema.optional(),
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

/** 这一枪的规格。⚠ 三格**永远带齐**（没有的那格是 `null`，论据同 `set_video_specs`）。 */
export const AssistantOperatorGenerationSpecsSchema = z.object({
  quality: AdvancedParamsSchema.shape.quality,
  background: AdvancedParamsSchema.shape.background,
  preview: AdvancedParamsSchema.shape.preview,
  aspectRatio: ParamValueSchema.nullable(),
  resolution: ParamValueSchema.nullable(),
  durationSeconds: z.number().int().positive().nullable(),
})

/**
 * 生成那一份载荷（§5）—— **一份形状，两处用**：
 *  · `request_generation` 这一步的 `payload`（客户端据它调 `triggerGeneration`）；
 *  · `confirm` 帧的 `generate` 支（确认卡据它画模型 / 张数 / 规格）。
 * ⛔ 别抄成两份：卡上写的和真的发出去的必须是同一个对象，否则「确认了 4 张、
 * 发出去 1 张」这种事没有任何东西拦得住。
 */
export const AssistantOperatorGenerationRequestSchema = z.object({
  model: z.object({ id: IdSchema, label: LabelSchema }),
  count: z.number().int().positive(),
  specs: AssistantOperatorGenerationSpecsSchema,
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
 * **一件可指认的产物**（切片 X；v2 §7.6 之后由**服务端现场派生**）。
 *
 * ⭐ 它答的是一个具体的失败：用户说「把刚才那张挂上」，而助手手上只有一串 id
 * —— 名字是称呼，准入名单在服务端（`run.workingMemoryIndex`）。
 * ⚠ 它**不再进请求体**（§7.6 删了 `request.workingMemory`）：服务端本来就手握
 * 每一步的完整 `result`，镜像一份再传回来是多养的一套逻辑。这份 schema 留着，
 * 是因为服务端与客户端（续跑的 `artifactIds`）读的是同一份形状。
 * ⚠ 每件产物带 `displayName`：模型在对白里指认用的就是它（切片 N1 的名字），
 * ⛔ 不念 id。`url` 可选 —— 有地址的才挂得上，没地址的（一段检索证据）只是让
 * 助手记得「这件事查过了」。
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

export type AssistantOperatorWorkingMemoryArtifact = z.infer<
  typeof AssistantOperatorWorkingMemoryArtifactSchema
>

/**
 * 一条证据的**编号**（§7.3）—— `#e12` 这种。
 *
 * ⚠ 它是**会话内**的稳定串：结论记录里只出现它，正文留在 `ResearchRun.evidence`
 * 的同名字段旁边。⛔ 别把它做成数组下标：下一轮再查一次，下标就指向别人了。
 */
export const AssistantOperatorEvidenceRefSchema = z
  .string()
  .trim()
  .regex(ASSISTANT_EVIDENCE_REF_PATTERN)

export type AssistantOperatorEvidenceRef = z.infer<
  typeof AssistantOperatorEvidenceRefSchema
>

/**
 * **一条钉住的结论**（§3.2 / 实测第三组 B）—— 面板顶部那条常驻条的全部载荷。
 *
 * ⚠ `refs` 是它钉的那几条证据的编号（§7.3）：证据卡据此认出「我是被钉住的那
 * 一张」，⛔ 不靠 `runKey` —— 那是这一次页面加载现造的串，刷新之后对不上。
 */
export const AssistantOperatorPinnedEvidenceSchema = z.object({
  refs: z
    .array(AssistantOperatorEvidenceRefSchema)
    .min(1)
    .max(ROUND_LIMITS.maxEvidenceRefs),
  conclusion: z
    .string()
    .trim()
    .min(1)
    .max(ROUND_LIMITS.maxPinnedConclusionChars),
  /** 卡上那一行「N 个来源」。 */
  sourceCount: z.number().int().nonnegative(),
  /** 其中几条有多源印证 —— 0 就不画那一截。 */
  corroborated: z.number().int().nonnegative(),
})

export type AssistantOperatorPinnedEvidence = z.infer<
  typeof AssistantOperatorPinnedEvidenceSchema
>

/**
 * **本轮结论**（§7.2）—— 每轮结账写下的那一条，四栏 + 三个元字段。
 *
 * ⭐ 它答的是 §7.1 那张断点表：证据、评审理由、问题卡选了什么、上一轮的计划，
 * 下一轮**一条都看不见**。四栏各有明确出处（§7.5 ①）：
 *  · `facts`     —— 「看 / 查」组产出的事实；
 *  · `decisions` —— 「问」组的答案与用户在确认卡上拍的板；
 *  · `todos`     —— 「请求生成」组挂起的事；
 *  · `evidenceRefs` —— 证据编号，**只有编号**（正文在 `ResearchRun`）。
 *
 * ⚠ 三条纪律，逐条对应一种走样：
 *  ① **每栏 ≤3 条、每条 ≤60 字**（`ROUND_LIMITS`）—— 它下一轮要整段进系统提示，
 *     放宽等于每一步 LLM 往返都多付一次；
 *  ② **服务端写，客户端只渲染**（§7.5 ④）—— 随 `done` 帧下发，⛔ 不再请求一次；
 *  ③ `editedByUser` 是**用户改过的标记**（§7.7）：改过的那版才是下一轮注入的
 *     那版，⛔ 不许被下一次结账悄悄覆盖回模型写的版本。
 */
export const AssistantOperatorRoundSummarySchema = z.object({
  /** 这条记录是这段会话的第几轮（0-based）。 */
  roundIndex: z.number().int().nonnegative(),
  /** ISO 串。 */
  createdAt: z.string(),
  facts: z
    .array(z.string().trim().min(1).max(ROUND_LIMITS.maxEntryChars))
    .max(ROUND_LIMITS.maxEntriesPerColumn),
  decisions: z
    .array(z.string().trim().min(1).max(ROUND_LIMITS.maxEntryChars))
    .max(ROUND_LIMITS.maxEntriesPerColumn),
  todos: z
    .array(z.string().trim().min(1).max(ROUND_LIMITS.maxEntryChars))
    .max(ROUND_LIMITS.maxEntriesPerColumn),
  evidenceRefs: z
    .array(AssistantOperatorEvidenceRefSchema)
    .max(ROUND_LIMITS.maxEvidenceRefs),
  /** 用户就地改过这条记录（§7.7）。⚠ 缺席 = 没改过，⛔ 别写成必填。 */
  editedByUser: z.boolean().optional(),
  /**
   * **这一轮钉住的那几条结论**（§3.2 证据卡第三态，2026-09-12 实测第三组 B）。
   *
   * ⭐ 钉住从此**落在这条记录上**而不是面板的局部态：实测第 8 步里刷新一次就
   * 全没了，而用户钉它正是为了「接下来别让我忘了这句」—— 一个刷新就忘的提醒
   * 不如没有。取消钉住 = 从这一列里移掉。
   * ⚠ 与 `evidenceRefs` **分开一列**：那一列是「这一轮查到的全部证据编号」
   * （结论块的证据 chip 行读它，§7.7），服务端结账时自动写满 —— 把钉住塞进去
   * 等于每张证据卡一出生就是钉住态。
   * ⚠ 带 `conclusion` / 计数是有意的：刷新之后历史里**没有证据卡**
   * （`StudioOperatorHistoryStepSchema` 不留证据列表），常驻条要画的那一句
   * 只能由这条记录自己带着。⛔ 但只带那一句，证据正文照旧在 `ResearchRun`。
   */
  pinnedEvidence: z
    .array(AssistantOperatorPinnedEvidenceSchema)
    .max(ROUND_LIMITS.maxPinnedPerRound)
    .optional(),
})

export type AssistantOperatorRoundSummary = z.infer<
  typeof AssistantOperatorRoundSummarySchema
>

/**
 * 压缩那一跳（§7.5 ③）问模型要的那份草稿 —— **模型 → 服务端**，所以它宽松：
 * 长度与条数在服务端收窄（`tidyColumn`），⛔ 不在 schema 里拒。判据与
 * `AssistantOperatorTurnSchema` 逐字同源：schema 拒 = 整条记录作废，
 * 服务端收窄 = 长了就截、多了就丢。
 *
 * ⚠ **没有 `evidenceRefs`**：编号是服务端按证据本分配的，让模型写就是让它编一个
 * 指不回任何东西的号。
 */
export const AssistantOperatorRoundSummaryDraftSchema = z.object({
  facts: z.array(z.string()),
  decisions: z.array(z.string()),
  todos: z.array(z.string()),
})

export type AssistantOperatorRoundSummaryDraft = z.infer<
  typeof AssistantOperatorRoundSummaryDraftSchema
>

/**
 * **查证收尾那一句归纳**（§9.1 ④，2026-09-12 实测第三组 A）—— 模型 → 服务端。
 *
 * ⭐ 它替掉的是「印证最多那条来源的原句」：实测里卡上那句结论是一段知乎评论的
 * 原文（「这篇完全是对卡通渲染的完整考虑。。。」），它被当作本轮的「事实」摆在
 * 钉住条与结论块里 —— 摘录读起来像结论，却是某一个人说话的半句。
 * ⚠ 它**只归纳、不添事实**：提示词里那条硬要求在服务端无从校验，所以宽的那一半
 * 由长度收（`maxConclusionChars`），窄的那一半由「失败就回落到确定性摘录」兜。
 * ⛔ 没有 `sources` / `confidence`：来源与可信度都是服务端算的，让模型写就是让它
 * 给自己打分（§9.2 那条头注的同一条论据）。
 */
export const AssistantResearchConclusionDraftSchema = z.object({
  conclusion: z.string(),
})

export type AssistantResearchConclusionDraft = z.infer<
  typeof AssistantResearchConclusionDraftSchema
>

/**
 * **断点续跑**的续跑凭据（客户端 → 服务端，第三期）。
 *
 * ⭐ 它答的是一个具体的失败：一份六步的计划跑到第四步断了（网络掉线 / 刷新 /
 * provider 抽风），用户再说一句「继续」，服务端零会话态 —— 它对前三步一无所知，
 * 于是从头再规划一遍，前三步已经花掉的时间和 credits 白花一次。
 *
 * ⚠ **只带「做完了什么」，不带「接下来做什么」**：`completedSteps` 是既成事实，
 * 而剩下的步由模型重新看一眼现场再定 —— 那三步之后表单已经变了，照着一份陈旧的
 * 待办清单往下跑，跑的是一个不存在的现场。
 * ⚠ 每一步只带 `label` 与产物 id：⛔ 不搬产物内容（那是 `workingMemory` 的活，
 * 两处都搬等于同一段 token 付两遍钱）。
 * ⛔ **续跑不是花钱的免检通道**：`resumeFrom` 一个字都不影响 `confirm` 帧 ——
 * 剩下的步里但凡有一步要花钱，硬确认卡照出（owner 2026-09-07 定）。判据写在
 * `assistant-operator.money-gate.test.ts` 里。
 */
export const AssistantOperatorResumeStepSchema = z.object({
  id: IdSchema,
  /** 这一步在计划卡上写的那句话 —— 提示里念的就是它。 */
  label: LabelSchema,
  /**
   * 这一步落下来的东西（generation id / asset id）。
   * ⚠ 可空：`read_state` 这类步做完了也不产出任何可指认的东西。
   */
  artifactIds: z
    .array(IdSchema)
    .max(RESUME_LIMITS.maxArtifactsPerStep)
    .optional(),
})

export const AssistantOperatorResumeFromSchema = z.object({
  /** 客户端给的那份计划的身份 —— 服务端只把它当不透明串回显进提示。 */
  planId: IdSchema,
  /**
   * 已经做完的那几步，**按原顺序**。
   * ⚠ `.min(1)`：一步都没做完的「续跑」就是普通的重跑，⛔ 别让它带着一份空清单
   * 上来 —— 那会让提示里出现一段「你已经完成了：（空）」。
   */
  completedSteps: z
    .array(AssistantOperatorResumeStepSchema)
    .min(1)
    .max(RESUME_LIMITS.maxSteps),
})

export type AssistantOperatorResumeStep = z.infer<
  typeof AssistantOperatorResumeStepSchema
>

export type AssistantOperatorResumeFrom = z.infer<
  typeof AssistantOperatorResumeFromSchema
>

/**
 * 一条 **LoRA 候选**在操作员协议里的投影（P4-C）。
 *
 * ⭐ 它是 `LoraCandidate` 的**投影而不是别名**，两条理由各自独立：
 *  ① `LoraCandidate` 上挂着 `importPayload`（来源快照 + 权重文件地址 + 落库入参）。
 *    那份对象**不跟着 `search_loras` 的步结果走** —— 步结果要进会话历史，每条候选
 *    背一份落库入参就是让每条消息多背几 KB，而那一刻还没有任何一把要挂。
 *    ⚠ 这条边界**就落在 `importPayload` 是不是可选上**：这份基础 schema 留它
 *    `.optional()`，步结果那条路（`toLoraCandidateProjection`）压根不填；推荐卡那
 *    一帧与勾选回传走的是派生出来的 `AssistantOperatorLoraPickCandidateSchema`，
 *    那里它是**必填**（`null` = 这把本来就导不进来）。理由见 lora-assistant §10.1：
 *    推荐卡是「真的要挂那几把」的前一刻，而 `candidateId → 候选` 的索引只活一轮
 *    （用户点「挂载所选」发生在流结束之后），所以候选本体必须跟着帧走。⛔ 别因此
 *    把它加回步结果，也⛔ 别改成「确认时按 id 再搜一次」：上游随时会改，用户看到
 *    的卡与实际导入的就不是同一版。
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
  /**
   * 这一把该用多大权重（lora-assistant §10.1）—— 推荐卡上那个 mono 读数。
   *
   * ⚠ 它是**三段回落的结果**（作者推荐 → 家族默认 → 全局默认），与 `planMountLora`
   * 算权重用的是**同一份** —— ⛔ 别在卡上另算一次：两处分叉的表现是「卡上写 0.8、
   * 挂上去变成 1.0」，而用户以为自己确认过那个数。
   */
  defaultWeight: z.number(),
  /**
   * 模型标的那一把（lora-assistant §10.1）—— 行上多一个「推荐」标。
   *
   * ⚠ **一张卡最多一个**：服务端只认第一个、其余剥掉，判据与 `PLAN_LIMITS` 那条
   * 逐字同源 —— 两项都标推荐等于没有推荐。
   */
  recommended: z.boolean(),
  /**
   * 一次确认之后要发给导入链的那份载荷（来源快照 + 权重文件地址 + 落库入参）。
   *
   * ⚠ **可选只对步结果那条路而言**（头注 ①）：`search_loras` 的步结果要进会话
   * 历史，⛔ 不填它。推荐卡与勾选回传用的是
   * `AssistantOperatorLoraPickCandidateSchema`，那边它是必填。
   * ⚠ `null` = 这把导不进来（与 `importable:false` 同一件事的两侧）—— 那几条
   * **照样进卡**（策略 C），只是挂不上。
   */
  importPayload: LoraCandidateImportPayloadSchema.nullable().optional(),
})

export type AssistantOperatorLoraCandidate = z.infer<
  typeof AssistantOperatorLoraCandidateSchema
>

/**
 * **推荐卡上（与勾选回传时）的那一条候选** —— 与上面同一份投影，只是把
 * `importPayload` 收成**必填**（lora-assistant §10.1）。
 *
 * ⭐ 派生而不是「一份可选到底」：可选到底的表现是卡上少一格没人发现，直到用户
 * 点了「挂载所选」才在服务端拒成 `loraNotImportable` —— 那时他已经等过一轮了。
 * ⚠ 必填的是**这一格在不在**，不是它非得有值：导不进来的候选照样进卡，那一格
 * 写 `null`。
 */
export const AssistantOperatorLoraPickCandidateSchema =
  AssistantOperatorLoraCandidateSchema.extend({
    importPayload: LoraCandidateImportPayloadSchema.nullable(),
  })

export type AssistantOperatorLoraPickCandidate = z.infer<
  typeof AssistantOperatorLoraPickCandidateSchema
>

export const AssistantOperatorRequestSchema = z.object({
  referenceProfiles: ReferenceProfilesSchema.optional(),
  messages: z.array(AssistantOperatorMessageSchema).min(1),
  mediaAttachments: z
    .array(
      z.object({
        kind: z.enum(['video', 'audio']),
        url: z.string().url().max(ASSISTANT_MEDIA_LIMITS.maxUrlLength),
        label: z.string().max(ASSISTANT_MEDIA_LIMITS.maxLabelLength),
      }),
    )
    .max(LIMITS.maxSnapshotReferences)
    .optional(),
  domain: AssistantOperatorDomainSchema,
  /**
   * 这一轮属于哪段会话（§7.5）。
   *
   * ⭐ 它是**结账写库唯一的落点**：结论记录住在 `AssistantConversation.rounds`，
   * 而服务端不认得「当前是哪段会话」—— 会话的身份一直由客户端持有（它是
   * `upsertAssistantConversation` 返回的那个 id）。
   * ⚠ 它**不放宽任何东西**：服务端照旧按 `userId` 核对这段会话归不归他，不归就
   * 不写（⛔ 不抛错、⛔ 不阻塞 `done`）。
   * ⚠ 缺席 = 这段会话还没落过库（第一轮）/ 老客户端：结账照旧算、照旧随 `done`
   * 下发，只是不落库。⛔ 别因此把它做成必填 —— 那会让第一轮直接 400。
   */
  conversationId: z.string().uuid().optional(),
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
   * **这两格现在的字是助手自己上一轮写的**（2026-09-12 实测第 2 条）。
   *
   * ⭐ 覆盖三选问的是「你手写的那一段怎么办」。助手上一轮 `set_prompt` 落下的字
   * 不是「他手写的」—— 对着自己的上一版再问一次，用户读到的是「你已经自己写过
   * 了」而他一个字都没打过（实测 #6）。服务端的 `assistantWrittenFields` 只活
   * 一轮，跨轮那一半的真值在客户端的改动登记簿里，所以由它上送。
   * ⚠ 它**只关掉那道问句**，⛔ 不放宽别的任何闸：写入照旧过参考图复核、照旧记
   * `inverse`（撤销仍然一路回到用户自己那一版）。
   * ⚠ 客户端只在**当前表单里的字与助手那一步写出来的字逐字相同**时才报 ——
   * 用户之后手改过一个字，这一格就不该出现（他改过的字重新算他手写的）。
   */
  authoredByAssistant: z
    .array(AssistantOperatorConfirmFieldSchema)
    .max(Object.keys(ASSISTANT_OPERATOR_CONFIRM_FIELDS).length)
    .optional(),
  /**
   * 助手备的那一枪刚打完（P3-C）。缺席 = 这一轮没有东西可看，
   * `critique_result` 按 `noResultToCritique` 拒。见 schema 头注。
   */
  result: AssistantOperatorResultSchema.optional(),
  /*
   * ⛔ **没有 `apiKeyId` / `llmModelId`**（commit #8，v2 §4.5）：这一轮用哪个
   * 脑子的唯一真值是 `AssistantPersona.routeModel`，服务端自己读。客户端上送那
   * 两个字段的年代里，同一件事有两个真值口，而「界面显示 A、实际打 B」正是那么
   * 来的（2026-08-19 生产事故）。要换模型去改 persona，⛔ 别把它加回请求体。
   */
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
  /**
   * 从上一份没跑完的计划**接着跑**（第三期）。见 schema 头注。
   *
   * ⚠ 缺席 = 这一轮不是续跑（新话题 / 老客户端），一切照旧。
   */
  resumeFrom: AssistantOperatorResumeFromSchema.optional(),
  /** 「本会话此类不再问」的条子（§6 拍板 24）。见 schema 头注。 */
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
  /*
   * ⛔ **没有 `workingMemory`**（v2 §7.6，commit #12）：产物索引改由**服务端现场
   * 派生** —— 它本来就手握每一步的完整 `result`，让客户端把它镜像一份再传回来，
   * 是为了「省一次查库」而多养的一套镜像逻辑。跨轮那一半由结论记录接手
   * （`AssistantConversation.rounds` → 系统提示的「之前几轮记住的事」一段），
   * 证据正文按编号翻（`recall_evidence`）。⛔ 别把它加回请求体。
   */
  /**
   * 这一轮客户端抽好的**三帧**（第二期 · 视频域评审）。见 schema 头注。
   *
   * ⚠ 缺席 = 这一轮没有帧可看，视频域 `critique_result` 按 `videoFramesMissing`
   * 拒。⛔ 服务端不去「自己抽一次」：本仓没有、也不打算有服务端解码器
   * （`lib/video-frame-capture.ts` 的选型头注：worker 跑不了原生二进制，
   * 服务端 ffmpeg 要往 Vercel 包里塞几十 MB）。
   */
  videoFrames: AssistantOperatorVideoFramesSchema.optional(),
  /**
   * **这一轮只信这几个来源**（v2 §9.3 · 输入区「+」菜单的「指定来源」）。
   *
   * ⭐ 它与库里的来源白名单是**同一个闸的两条命**：这一条只作用于本轮、⛔ 不写库
   * （用户为一个问题临时指了几个源，不该变成他此后每一轮的规矩）。服务端把两份
   * 并起来时**临时的优先**：用户刚在菜单里点的那几个，比他三周前写下的名单更能
   * 说明这一轮要什么。
   * ⚠ 每一条是**来源 id 或域名**，与 `ProjectRule.text` 逐字同形；⛔ 不收一句话。
   * ⚠ 缺席 = 这一轮没有临时名单（常态），库里那份照常生效。
   */
  sourceAllowlist: z
    .array(ProjectRuleSourceTokenSchema)
    .max(SOURCE_ALLOWLIST_LIMITS.maxPerTurn)
    .optional(),
  /**
   * **创作者在 LoRA 推荐卡上勾中的那几把**（lora-assistant §10.1/§10.2）。
   *
   * ⭐ 它是 `mount_lora` 的**准入闸本身**：服务端从这张名单现算一个
   * `Set<candidateId>`，模型写了一个不在名单里的 candidateId 一律按
   * `loraPickRequired` 拒。⛔ 不接受模型在入参里自称「用户已经确认过了」——
   * 闸判的是**有没有那一下勾选**，不是模型说了什么。
   * ⚠ **候选本体跟着回来**：`run.loraIndex` 只活一轮，而勾选那一下发生在流结束
   * 之后；服务端拿它 `hydrateLoraIndexFromPicks` 灌回索引，`planMountLora` 取候选
   * 那一段一个字都不用改。⛔ 不许改成「按 id 再搜一次」（上游随时会改）。
   * ⚠ 回传的 `importPayload` 服务端**一个字都不信任地用**：原样填进 `mount_lora`
   * 的 step 载荷，取图 / 落 R2 / 落库那一跳照旧在客户端。
   * ⚠ **只回勾中的那几条**，⛔ 不回整轮候选 —— 没被挑中的存了只是让每条消息多背
   * 几 KB（判据与 `AssistantConversationMessage.loraCandidates` 逐字同源）。
   * ⚠ `weight` 缺席 = 用候选自己的 `defaultWeight`，⛔ 不另拍一个数。
   */
  loraPicks: z
    .array(
      z.object({
        candidateId: IdSchema,
        weight: z.number().optional(),
        candidate: AssistantOperatorLoraPickCandidateSchema,
        receipt: z.object({
          assetId: IdSchema.nullable(),
          error: z.string().max(LIMITS.maxPromptChars).optional(),
        }),
      }),
    )
    .max(LIMITS.maxLoraResults)
    .optional(),
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
/**
 * **助手提议的一张上下文卡的草稿**（v2 §8.1）。
 *
 * ⭐ 它**不是** `ContextCard`：库里那一行有 id、有常挂域、有参考图、有 `status`，
 * 而这四样没有一样是模型说了算的。草稿只有用户读得懂的那四格 —— 卡的档、名字、
 * 一句话摘要、正文（外加可选的硬否定串）。
 * ⚠ 同一个形状既是工具入参，也是 `confirm(contextCard)` 那一帧的载荷：⛔ 别在
 * 两处各写一份，写两份的下场是模型填得出而卡渲染不出来。
 * ⚠ 上限逐条借 `CONTEXT_CARD_LIMITS` —— 用户点「存这张卡」时这份草稿原样进
 * `CreateContextCardSchema`，两处上限漂开的表现是「卡存不下去且说不出为什么」。
 */
export const AssistantOperatorContextCardDraftSchema = z.object({
  kind: ContextCardKindSchema,
  name: z.string().trim().min(1).max(CONTEXT_CARD_LIMITS.maxNameChars),
  /** 唯一每轮都进系统提示的那一行。 */
  summary: z.string().trim().max(CONTEXT_CARD_LIMITS.maxSummaryChars),
  body: z.string().max(CONTEXT_CARD_LIMITS.maxBodyChars),
  negative: z
    .string()
    .trim()
    .max(CONTEXT_CARD_LIMITS.maxNegativeChars)
    .nullish(),
})

export type AssistantOperatorContextCardDraft = z.infer<
  typeof AssistantOperatorContextCardDraftSchema
>

/**
 * **`add_project_rule` 的形状容错**（2026-09-12 实测第 9 步）。
 *
 * ⭐ 真机里这条工具**第一次调用一定被拒**、第二次才落 —— 用户读到的是一条
 * 「参数形状不对」加一次白等。掰的只有「同一个东西叫什么名字」三件：
 *  ① 整包裹在 `rule` / `input` 下的（`{rule:{text:…}}`）；
 *  ② `text` 写成 `rule` / `content` / `value` / `note`；
 *  ③ `kind` 写成别名或中文（`PROJECT_RULE_KIND_ALIASES`）。
 * ⛔ 长度与值域一个字都没松：掰不动的照旧 `malformedArgs`，并在观察里给一份
 * 正确形状（见 `ASSISTANT_OPERATOR_TOOL_ARG_SHAPE_HINTS`）。
 */
function normalizeAddProjectRuleArgs(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  let args = raw as Record<string, unknown>

  // ① 整包裹一层：`{rule:{…}}` / `{input:{…}}`。
  for (const wrapper of ['rule', 'input'] as const) {
    const inner = args[wrapper]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      args = { ...args, ...(inner as Record<string, unknown>) }
      delete args[wrapper]
    }
  }

  const next: Record<string, unknown> = { ...args }

  // ② `text` 的别名 —— ⚠ 只在 `text` 本身缺席/空时才顶上。
  if (typeof next.text !== 'string' || next.text.trim() === '') {
    for (const alias of PROJECT_RULE_TEXT_ARG_ALIASES) {
      const value = next[alias]
      if (typeof value === 'string' && value.trim() !== '') {
        next.text = value
        break
      }
    }
  }

  // ③ `kind` 的别名与中文。认不出来的**删掉**（缺省 = 普通规则）。
  if (typeof next.kind === 'string') {
    const mapped =
      PROJECT_RULE_KIND_ALIASES[next.kind.trim().toLowerCase()] ?? undefined
    if (mapped) next.kind = mapped
    else delete next.kind
  } else if (next.kind !== undefined) {
    delete next.kind
  }

  return next
}

/**
 * `canvas_apply` 收得下的那几条 op —— **从 v4 的 spec 表现算**（进度表 22）。
 *
 * ⭐ 判据就是 spec 表自己那一格：`inverse !== null` = 这条 op 撤得掉。撤不掉的
 * 两类各有去处 —— 读类（`read_canvas` / `find_node` / `plan_rerun_downstream`）
 * 归「看」，`generate` 归花钱档。⛔ 别改成手抄的字面量表：v4 词表加一条而这里
 * 漏了的表现是「画布上做得到的事助手做不到」，而那是安静的。
 */
export const CANVAS_APPLY_OP_IDS: readonly NodeAssistantOpV4Id[] =
  NODE_ASSISTANT_OPS_V4.filter(
    (op) =>
      NODE_ASSISTANT_OP_V4_SPECS[op].inverse !== null &&
      op !== NODE_ASSISTANT_OP_V4_IDS.generate,
  )

export function isCanvasApplyOpId(op: string): op is NodeAssistantOpV4Id {
  return (CANVAS_APPLY_OP_IDS as readonly string[]).includes(op)
}

/**
 * ⚠ 校验分两跳：形状归 v4 自己那张 union（⛔ 不重写），「这条撤得掉吗」归上面
 * 那张现算的清单。`superRefine` 而不是 `.and()`：错的时候要说得出是哪条 op。
 */
const CanvasApplyOpSchema = NodeAssistantOpV4Schema.superRefine((op, ctx) => {
  if (isCanvasApplyOpId(op.op)) return
  ctx.addIssue({
    code: 'custom',
    message: `op ${op.op} cannot be applied through canvas_apply`,
  })
})

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
    /**
     * **再多找几个源**（§9.1 ③ / 证据卡上那颗按钮，commit #16）。
     *
     * ⚠ 它不是「再查一次」的同义词：`true` 时服务端打**全部**源组（含默认里
     * 没有的 B站），⛔ 而不是换一句查询重来 —— 用户按那颗按钮说的是「这几条
     * 来源不够」，答案是加源，不是加轮。
     */
    expandSources: z.boolean().optional(),
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
   * **按编号翻证据本**（§7.3，commit #12）。
   *
   * ⚠ 入参是**编号数组**而不是单个编号：一条结论记录挂着一串号（`#e3 #e4 #e7`），
   * 而模型要判的往往是它们合起来说了什么。一次一条的表现是同一件事烧三步，
   * 而一轮只有 `maxSteps` 步。
   * ⚠ 形状闸（`#e` + 正整数）在 schema 上，**存在性闸**留在规划器
   * （`unknownEvidenceRef`）—— schema 拒 = 模型学不到「这个号没有」，
   * 规划器拒 = 它读得到理由还能换一个号。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence]: z.object({
    refs: z
      .array(AssistantOperatorEvidenceRefSchema)
      .min(1)
      .max(EVIDENCE_RECALL_LIMITS.maxRefsPerCall),
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
    /**
     * **创作者这一轮已经说了「覆盖」**（2026-09-12）。
     *
     * ⚠ 它只跳过那道三选问句，⛔ 不是「强制写」：前置校验、参考图复核、`inverse`
     * 一条都不动。⛔ 模型不许拿它当默认值 —— 只有创作者本轮原话里说过要换掉现有
     * 那一段时才置 true（服务端自己也从原话里认一遍，两条判据是或的关系）。
     */
    overwrite: z.boolean().optional(),
  }),
  [ASSISTANT_OPERATOR_TOOL_IDS.setNegative]: z.object({
    value: z.string().trim().max(LIMITS.maxPromptChars),
    mode: AssistantOperatorWriteModeSchema.optional(),
    /** 同 `set_prompt` 的那一格。 */
    overwrite: z.boolean().optional(),
  }),
  /** ⚠ 台账 AE/BG/BS：两个字段一起下，缺一个就不是真比例。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.setSpecs]: z.object({
    quality: ParamValueSchema.optional(),
    preview: z.boolean().optional(),
    background: ParamValueSchema.optional(),
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
  /**
   * 专属 chip 那一格（进度表 21）。
   *
   * ⚠ `key` 与 `value` 的值域**都留在规划器**（本文件头注 ②）：白名单是快照现给的
   * 那几颗 chip，而值域按 chip 的形态分三种 —— 写进 schema 就得把它做成一个随模型
   * 变的 union，那不是 schema 能表达的东西，而且 schema 拒 = 模型这一轮整个作废。
   * ⛔ `value` **不收 `null`**：清回缺省是撤销的事（`inverse`），不是助手的动作 ——
   * 与 `set_prompt` 不许写空串同源。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.setCapability]: z.object({
    key: ParamValueSchema,
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
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
  [ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences]: z.object({
    imageIndices: z
      .array(z.number().int().nonnegative())
      .min(1)
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
  /**
   * 摆一张 LoRA 推荐卡（lora-assistant §10.2.2）。
   *
   * ⚠ `candidateIds` 的值域（必须是本轮 `search_loras` 回过的）**留在规划器**收，
   * ⛔ 不写进 schema —— 与本文件头注 ② 同一条：schema 拒 = 整轮读不出来，
   * 规划器拒 = 日志上写着「这个 candidateId 本轮没搜到过」，助手还能改口再来一次。
   * ⚠ `recommendedCandidateId` 可选：一张卡最多一个推荐（多给的由服务端剥掉）。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick]: z.object({
    question: z.string().trim().min(1).max(PLAN_LIMITS.maxQuestionChars),
    groups: z
      .array(
        z.object({
          title: LabelSchema.optional(),
          candidateIds: z.array(IdSchema).min(1).max(LIMITS.maxLoraResults),
        }),
      )
      .min(1)
      .max(LIMITS.maxLoraResults),
    recommendedCandidateId: IdSchema.optional(),
  }),
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
  [ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters]:
    AssistantLoraParametersSchema,
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
  [ASSISTANT_OPERATOR_TOOL_IDS.addProjectRule]: z.preprocess(
    normalizeAddProjectRuleArgs,
    z.object({
      text: z.string().trim().min(1).max(RULE_LIMITS.maxTextChars),
      /**
       * ⚠ 认不出来的作用域**当没写**（`.catch(undefined)`）而不是整条拒：
       * 缺省 = 全域，本来就是这条工具最常见的形态 —— 让一个编出来的
       * `"global"` 把整轮拖垮，换来的只是用户连吃两条「参数形状不对」。
       */
      scope: ProjectRuleScopeSchema.optional().catch(undefined),
      /**
       * 哪一种规则（§9.3）。缺省 = 普通规则。
       *
       * ⚠ 来源名单那两种的 `text` 必须是来源 id 或域名 —— 值域在规划器收
       * （`planAddProjectRule`），⛔ 不在这里拒：schema 拒 = 模型这一轮整个作废，
       * 规划器拒 = 它读得到理由还能改口（文件头注 ②）。
       */
      kind: ProjectRuleKindSchema.optional().catch(undefined),
    }),
  ),
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
   * **提议**一张卡（v2 §8.1）—— 模型只写草稿，⛔ 写不出 id、写不出常挂域、
   * 也写不出 `status`：那三样分别由库、用户和「用户点了没点」决定。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard]:
    AssistantOperatorContextCardDraftSchema,
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
  /**
   * 素材库四条（v2 §10）。
   *
   * ⚠ 准入（这几件是不是这个用户的）**在服务端按 userId 查库**，⛔ 不是本轮
   * 检索名单 —— 与 `set_review_state` 逐字同源：这四条一个字都改不了别人的东西
   * （不是他的行 → 服务返回空 → 规划器按 `unknownAsset` 拒），而「上一轮那几张
   * 收藏一下」恰恰是最常见的用法。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.tagAsset]: z.object({
    assetIds: AssetIdListSchema,
    tags: z
      .array(AssetTagSchema)
      .min(1)
      .max(ASSET_WRITE_LIMITS.maxTagsPerWrite),
  }),
  /** ⚠ `value` **必填**：没有「切换」这个选项 —— 一批里各自的现值不同，切换出来的是一盘乱棋。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset]: z.object({
    assetIds: AssetIdListSchema,
    value: z.boolean(),
  }),
  /** ⚠ 一次只建一个：建两个夹子是两个决定，撤销也该分两次。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.createFolder]: z.object({
    name: z.string().trim().min(1).max(ASSET_WRITE_LIMITS.maxFolderNameChars),
    parentId: IdSchema.optional(),
  }),
  /**
   * ⚠ `targetFolderId` **必填且不可为 null**：「挪出文件夹」不是这条工具的活
   * （那是用户在素材库里自己拖的），而一个可空的目标会让模型把「不确定放哪」
   * 写成 `null`，结果是一批素材被静默地从文件夹里拿出来。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.moveAssets]: z.object({
    assetIds: AssetIdListSchema,
    targetFolderId: IdSchema,
  }),
  /**
   * 画布：**一条** v4 op，原样（⛔ 不是 `ops[]`）。
   *
   * ⚠ 这里收的是整张 v4 词表，只把**撤不掉的**那几条挡在门外
   * （`CANVAS_APPLY_OP_IDS` 由 spec 表现算）：读类没有东西可改，`generate` 走
   * 自己那条花钱档。⛔ 别在这里手抄一份可用 op 清单 —— 那就是第二处定义。
   */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasApply]: CanvasApplyOpSchema,
  /** 画布：算下游名单。`includeSelf` 默认 false —— 刚换上去的那个不该被盖掉。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun]:
    NodeAssistantPlanRerunDownstreamOpSchema.omit({ op: true }),
  /** 画布：那一枪。⛔ 载荷里只有目标节点 —— 模型不填模型 / 张数（快照现取）。 */
  [ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate]:
    NodeAssistantGenerateV4OpSchema.omit({ op: true }),
}

// ─── ②′ 五个入口工具（v2 §2.1 / §2.2）────────────────────────────

/**
 * `ask` 入口的入参 —— **组内没有旧工具**，所以它的形状写在这里（v2 §2.2）。
 *
 * ⚠ 一次只问一道题（§3.4）：想问两件事就分两轮。多问的那几道由服务端丢掉。
 * ⚠ 每个选项**必须带一句说明** —— 差别写在说明里，不写就没有差别可选
 * （`ASSISTANT_PLAN_CARD_LIMITS` 头注那段的复述）。剥到少于两项时整道题一起丢。
 * ⚠ 一律宽松（与整份「模型 → 服务端」档同一条纪律）：`id` 由服务端补，
 * `visual` 收 `z.string()` 而不是枚举 —— 写错一个图示 id 只该丢掉那个图示。
 */
export const AssistantOperatorAskArgsSchema = z.object({
  question: z.string().trim().min(1).max(PLAN_LIMITS.maxQuestionChars),
  /** 收起态那一行写得下的几个字；漏了服务端从问句头上截。 */
  header: z.string().trim().max(PLAN_LIMITS.maxHeaderChars).nullish(),
  multiSelect: z.boolean().nullish(),
  allowOther: z.boolean().nullish(),
  options: z
    .array(
      z.object({
        id: z.string().trim().max(LIMITS.maxIdChars).nullish(),
        label: z.string().trim().min(1).max(PLAN_LIMITS.maxOptionLabelChars),
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
  /** 为什么要问 —— 卡上那一行小字。 */
  why: z.string().trim().max(PLAN_LIMITS.maxQuestionChars).nullish(),
})

export type AssistantOperatorAskArgs = z.infer<
  typeof AssistantOperatorAskArgsSchema
>

/**
 * **每个入口的入参**（v2 §2.2 / 决策 2）—— 模型只挑动词，组内哪一支由 `action` 定。
 *
 * ── 为什么 `action` 之外的参数在这里是**放行**的 ──────────────────
 * 收口收的是「31 选 1」这个判断，⛔ 不是把 31 份入参 schema 复制一遍：真正的
 * 值域校验照旧由 `ASSISTANT_OPERATOR_TOOL_ARGS_SCHEMAS[action]` 在规划器里跑
 * （`services/kernel/assistant-operator.service.ts`），因此
 *  · 报错还是那条模型学得会的 `malformedArgs`（「value: Required」），
 *    ⛔ 不是一句「这个入口的参数不对」；
 *  · 旧工具的 schema 只有一份，⛔ 不会两份漂开。
 * 所以这里用 `z.looseObject`：`action` 收窄，其余原样带下去。
 *
 * ⚠ `action` 枚举是**全集**，域裁剪不在这一层：模型在视频档写 `set_count`
 * 时该读到一条可教的 `noSuchControl`（「这台工作台上没这个控件」），
 * ⛔ 不是一整轮读不出来。第一道闸（模型压根看不见）在系统提示里，
 * 见 `ASSISTANT_OPERATOR_ENTRY_ACTIONS_BY_DOMAIN`。
 */
export const ASSISTANT_OPERATOR_ENTRY_ARGS_SCHEMAS: Record<
  AssistantOperatorEntryTool,
  z.ZodType
> = {
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look]: z.looseObject({
    action: z.enum(
      ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.look
      ],
    ),
  }),
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research]: z.looseObject({
    action: z.enum(
      ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.research
      ],
    ),
  }),
  /**
   * ⚠ `ask` 是全表唯一**两种形状**的入口（v2 §8.1）：不写 `action` = 问一道题
   * （形状写在 `AssistantOperatorAskArgsSchema` 里，组内没有旧工具）；
   * 写了 `action` = 组里那一条（今天只有 `propose_context_card`）。
   * ⛔ 别把提议也塞进问题那个形状：它摆的是一张卡的草稿，不是 2–4 个选项。
   */
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask]: z.union([
    z.looseObject({
      action: z.enum(
        ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[
          ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.ask
        ],
      ),
    }),
    AssistantOperatorAskArgsSchema,
  ]),
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply]: z.looseObject({
    action: z.enum(
      ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.apply
      ],
    ),
  }),
  [ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.requestGeneration]: z.looseObject({
    action: z.enum(
      ASSISTANT_OPERATOR_ENTRY_ACTION_VALUES[
        ASSISTANT_OPERATOR_ENTRY_TOOL_IDS.requestGeneration
      ],
    ),
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
      /**
       * ⚠ **收 `z.string()` 而不是入口枚举**（v2 §2.1）：模型写了一个旧工具名
       * （`set_prompt`）时，它该读到一条可教的拒绝「这条工具退到 apply 后面去了」，
       * ⛔ 不是整轮读不出来退化成一次重试 —— 那正是本文件头注 ② 那条纪律。
       * 收窄发生在服务端拆入口那一跳（`unwrapEntryToolCall`）。
       */
      name: z.string().trim().min(1).max(LIMITS.maxIdChars),
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
  /**
   * **这一轮先问一句再动手**（v2 §3.3 / 决策 4）—— 多步确认卡的唯一触发。
   *
   * ⭐ 它替掉的是那条「步数 ≥ 3 就出卡」的死阈值：步数答不了用户真正在问的
   * 那件事（「它接下来要做的事里，有没有一步是我不想让它自己做的」）。
   * ⚠ 缺席 = 不出卡。⛔ 服务端不按步数补判。
   */
  confirmPlan: z.boolean().optional(),
  /** 模型认为活干完了。没有 `tool` 时等价于 true。 */
  finished: z.boolean().optional(),
})

export type AssistantOperatorTurn = z.infer<typeof AssistantOperatorTurnSchema>

// ─── ③ 服务端吐给客户端的 step ───────────────────────────────────

const STEP_BASE_SHAPE = {
  /** 同一步的 `running` 与 `done` 共用一个 id —— 客户端按 id 覆盖，不追加。 */
  id: z.string().trim().min(1).max(LIMITS.maxIdChars),
  /**
   * **这一步属于哪个动词**（v2 §3.1，必填）—— 面板那句状态词直接读它。
   *
   * ⭐ 必填不是洁癖：v1 的面板靠「按工具名反查一张对照表」猜动词，那张表和工具
   * 表漏同步的表现是「跑着一步而头像旁边一个字都没有」。写成一等字段之后，
   * 服务端出帧那一刻就得说清楚它在干哪一类活。
   * ⚠ 它与工具的归属由 `ASSISTANT_OPERATOR_TOOL_VERBS` 定，服务端填，
   *   ⛔ 客户端不再自己反查。
   */
  verb: AssistantOperatorVerbSchema,
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
   * **证据本编号**（§9.2 新增的两项之一）——`#e12` 这种，会话内自增。
   *
   * ⭐ 它在**这一步就给得出来**：号段在本轮第一次查证时从证据本现取一次
   * （`peekAssistantEvidenceRefSeq`），之后在内存里顺延，收尾落库时用同一段号。
   * 没有它这条卡上的「钉住」就钉不住 —— 钉住写进结论记录的正是这个号（§7.3）。
   * ⚠ 可选：没有 `conversationId`（第一轮 / 老客户端）或号段取不到时就是没有，
   * ⛔ 不编一个指不回任何东西的号。
   */
  evidenceRef: AssistantOperatorEvidenceRefSchema.optional(),
  /**
   * **印证源数**（§9.2 新增的两项之二）——几个**互相独立的源**说了同一件事。
   *
   * ⚠ 由服务端算（`research-fanout` 的 `countCorroboration`），⛔ 不由模型写：
   * 与 `confidence` 同一条理由 —— 让模型给自己找的东西打分，它给的永远是满分。
   * ⚠ `1` 就是「单源」，卡上要打标；⛔ 别把它软化成「暂未印证」。
   */
  corroboration: z.number().int().positive(),
  /**
   * 这条证据**什么时候说的**（§9.1 ④「谁说的、什么时候说的」）。
   *
   * ⚠ 可选而且**不回落成抓取时间**：`retrievedAt` 答的是「我什么时候看见它」，
   * 与「它什么时候发布」是两件事，混用会让一篇 2019 年的访谈在卡上写着今天。
   * 取不到就不显示那一栏。
   */
  publishedAt: z
    .string()
    .max(RESEARCH_LIMITS.maxEvidencePublisherChars)
    .optional(),
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

/**
 * **按编号翻回来的一条证据**（§7.3，commit #12）。
 *
 * ⭐ 它是 `EvidenceItem`（`types/research.ts`）的**投影而不是别名**：库里那一条
 * 带着 `sourceTier` / `retrievedAt` / `untrusted` 与三种 `kind` 各自的正文字段，
 * 而模型这一跳只要「谁说的、说了什么、哪一页」。整条透传的代价是每次翻账都把
 * 一堆它用不上的字段塞进上下文，而这条工具存在的全部理由就是省上下文。
 * ⚠ `body` 是**三种 kind 压平**后的正文（摘录 / 标签串 / 图片地址），⛔ 不在
 * 这一层把 kind 的判别搬给模型：它要的是内容，不是证据的形态学。
 */
export const AssistantOperatorRecalledEvidenceSchema = z.object({
  ref: AssistantOperatorEvidenceRefSchema,
  title: z.string().max(RESEARCH_LIMITS.maxEvidenceTitleChars),
  url: z.string().optional(),
  /** 源 id（萌百 / danbooru / web_search…），落库时就在那一条上。 */
  source: z.string().max(RESEARCH_LIMITS.maxEvidencePublisherChars),
  body: z.string().max(EVIDENCE_RECALL_LIMITS.maxBodyChars),
})

export type AssistantOperatorRecalledEvidence = z.infer<
  typeof AssistantOperatorRecalledEvidenceSchema
>

export type AssistantOperatorWebSearchResult = z.infer<
  typeof AssistantOperatorWebSearchResultSchema
>

export type AssistantOperatorWebImage = z.infer<
  typeof AssistantOperatorWebImageSchema
>

export const AssistantOperatorAppliedStepSchema = z.discriminatedUnion('tool', [
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences,
    z.object({}),
    ReferenceAnalysisSchema,
  ),
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
      /**
       * **结论一行**（§3.2 证据卡的第一栏，§9.1 ④）。
       *
       * ⚠ 它由服务端从**印证最多、层级最高**的那一条压出来，⛔ 不另烧一次 LLM：
       * 设置弹层那条「同一份输入两次给出不同示例」的论据在这里同样成立 ——
       * 卡上那句话必须与下面列出来的来源对得上，而一次自由生成对不上。
       * ⚠ 一条证据都没有时缺席：⛔ 不写「未找到」当结论（那不是结论，是状态）。
       */
      conclusion: z
        .string()
        .max(RESEARCH_LIMITS.maxEvidenceSnippetChars)
        .optional(),
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
  /**
   * 翻证据本（§7.3）。⛔ 永远是 readStep：它读的是**库里已经落下的**那几条，
   * 一个外部源都不打、表单一个字都不改。
   *
   * ⚠ 结果里 `missing` 与 `items` **并存**：三个号里有一个翻不到时，把翻到的两条
   * 给出去比整条拒掉有用得多 —— 一个都没翻到才是 `unknownEvidenceRef`。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.recallEvidence,
    z.object({
      refs: z
        .array(AssistantOperatorEvidenceRefSchema)
        .max(EVIDENCE_RECALL_LIMITS.maxRefsPerCall),
    }),
    z.object({
      items: z
        .array(AssistantOperatorRecalledEvidenceSchema)
        .max(EVIDENCE_RECALL_LIMITS.maxRefsPerCall),
      missing: z
        .array(AssistantOperatorEvidenceRefSchema)
        .max(EVIDENCE_RECALL_LIMITS.maxRefsPerCall),
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
    z.object({
      aspectRatio: ParamValueSchema,
      resolution: ParamValueSchema,
      quality: AdvancedParamsSchema.shape.quality,
      preview: AdvancedParamsSchema.shape.preview,
      background: AdvancedParamsSchema.shape.background,
    }),
    z.object({
      aspectRatio: ParamValueSchema.nullable(),
      resolution: ParamValueSchema.nullable(),
      quality: AdvancedParamsSchema.shape.quality.nullable(),
      preview: AdvancedParamsSchema.shape.preview.nullable(),
      background: AdvancedParamsSchema.shape.background.nullable(),
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
   * 专属 chip 那一格（进度表 21）。
   *
   * ⚠ `inverse.value` **允许 `null`** —— 判据与 `set_sound` 逐字同源：用户很可能
   * 一次都没设过这一格，撤销必须回得到「没设过」。把它收窄成非空，撤销之后那一格
   * 会从「跟着模型缺省走」变成「用户明确选了这个值」，而两者发给 provider 的东西
   * 不同（缺省那一档根本不发这个字段）。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setCapability,
    z.object({
      key: ParamValueSchema,
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
      key: ParamValueSchema,
      value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
    }),
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
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setLoraParameters,
    AssistantLoraParametersSchema,
    AssistantLoraParametersSchema,
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
   * 摆一张 LoRA 推荐卡（lora-assistant §10.2.2）—— 与 `propose_context_card`
   * 同一种形状：**这条路上通常不出 step**，它的产出是一帧 `confirm(loraPick)`
   * 加停流。契约照旧写在这里，因为「每条工具都有一份合法 step」是这份判别联合的
   * 完备性要求。
   * ⚠ 归读类：服务端一行库都没写、一把都没挂，⛔ 撤无可撤（挂载那几条 step 是
   * 下一轮各自独立的 `mount_lora`，撤销撤在它们身上）。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.planLoraPick,
    z.object({
      question: z.string().trim().min(1).max(PLAN_LIMITS.maxQuestionChars),
      candidateIds: z.array(IdSchema).max(LIMITS.maxLoraResults),
    }),
    z.object({ offered: z.boolean() }),
  ),
  /**
   * 提议一张卡（§8.1）—— 与 `request_generation` 同一种形状：**这条路上通常不出
   * step**，它的产出是一帧 `confirm(contextCard)` 加停流。契约照旧写在这里，
   * 因为「每条工具都有一份合法 step」是这份判别联合的完备性要求。
   * ⚠ 归读类：`result` 里没有 id，也没有 `inverse` —— 服务端一行库都没写，
   * ⛔ 撤无可撤。
   */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.proposeContextCard,
    AssistantOperatorContextCardDraftSchema,
    z.object({ offered: z.boolean() }),
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
  /**
   * **素材库四条**（v2 §10）—— 与 `add_project_rule` / `set_review_state` 同一档：
   * 后果落在服务端，所以 `inverse` 里放的是**服务端刚读到 / 刚写下的那些原值**，
   * ⛔ 不是客户端要反查的对照表。
   *
   * ⚠ 每一条的 `inverse` 都是**逐条**的（§10 那条 ⚠ 的结构表达）：
   *  · 打标签 → 这一步**真的新加上去**的那几个（本来就有的不动）；
   *  · 收藏   → 每张的**原收藏态**（⛔ 不是取反）；
   *  · 建夹子 → 刚建那个的 id（删它时服务端还要再确认一次它是空的）；
   *  · 移动   → 每张的**原文件夹**（`null` = 原来没归档）。
   * ⚠ 载荷里带 `count` / `name` 这类给人看的字段：日志条要写得出「它替你动了
   * 几张、放进了哪个夹子」，而客户端此刻未必手上有这几条素材。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.tagAsset,
    z.object({
      tags: z.array(AssetTagSchema).max(ASSET_WRITE_LIMITS.maxTagsPerWrite),
      /** 真的被动到的那几件（跳过的不算）。 */
      assetIds: z.array(IdSchema).max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
    }),
    z.object({
      entries: z
        .array(AssetTagEntrySchema)
        .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
    }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset,
    z.object({
      value: z.boolean(),
      assetIds: z.array(IdSchema).max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
    }),
    z.object({
      entries: z
        .array(AssetFavoriteEntrySchema)
        .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
    }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.createFolder,
    z.object({
      folderId: IdSchema,
      name: LabelSchema,
      parentId: IdSchema.nullable(),
    }),
    z.object({ folderId: IdSchema }),
  ),
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.moveAssets,
    z.object({
      targetFolderId: IdSchema,
      targetFolderName: LabelSchema,
      assetIds: z.array(IdSchema).max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
    }),
    z.object({
      entries: z
        .array(AssetFolderEntrySchema)
        .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
    }),
  ),
  /**
   * 画布那一条（进度表 22）。
   *
   * ⚠ `payload` 就是**那条 v4 op 本身** —— 客户端把它原样交给
   * `applyNodeAssistantOpV4`，中间一个字段都不翻译。翻译层是分叉的温床：
   * v4 词表加一格而翻译层漏了的表现是「助手说改好了，画布上没动」。
   * ⚠ `inverse` 只是一张**指路条**（这条 op 的逆是哪条 op + 动的是哪个节点）。
   *   真正的撤销载荷**服务端手上没有**：删一个节点的逆要整份 data 快照 + 边表 +
   *   各槽版本，那些只在客户端的图里。执行器在应用那一刻把它算出来并扣着，
   *   撤销时按 `nodeRef` 取回 —— 形态与 `mount_lora` 的 `candidateId` 逐字同源。
   */
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.canvasApply,
    CanvasApplyOpSchema,
    z.object({
      /** 这条 op 的逆是哪条 op（读 `NODE_ASSISTANT_OP_V4_SPECS[op].inverse`）。 */
      op: z.enum(NODE_ASSISTANT_OPS_V4),
      /** 被动到的那个节点 —— 客户端按它取回自己扣着的那份撤销载荷。 */
      nodeRef: z.string().trim().min(1).max(LIMITS.maxTitleChars),
    }),
  ),
  /** 画布：下游名单。⚠ 读类 —— 没有 `inverse`，日志条上不该出现撤销。 */
  readStep(
    ASSISTANT_OPERATOR_TOOL_IDS.canvasPlanRerun,
    NodeAssistantPlanRerunDownstreamOpSchema.omit({ op: true }),
    z.object({
      /** 要重跑的那几个（图算出来的，⛔ 不是模型列的）。 */
      nodeIds: z
        .array(z.string().trim().min(1))
        .max(ASSISTANT_OPERATOR_CANVAS_LIMITS.maxRerunNodes),
    }),
  ),
  /**
   * 画布那一枪（花钱档）。⛔ 没有 `inverse`：出来的东西删不掉、钱退不回，
   * 回头路是画布上那张卡自己的版本表，不是日志条上的撤销钮。
   */
  spendStep(
    ASSISTANT_OPERATOR_TOOL_IDS.canvasGenerate,
    NodeAssistantGenerateV4OpSchema.omit({ op: true }),
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

/**
 * **这一轮打算分几步**（v2 §3.1：`plan` 与计划请求帧合并）。
 *
 * ⚠ 只剩阶段列表：待定项整体搬去了 `ask`（问题卡），预估随决策 8 删掉，
 * 服务端观察到的「出卡理由」也一起没了。多步确认要不要出，v2 §3.3 交给模型判
 * （`AssistantOperatorTurnSchema.confirmPlan`），⛔ 不再有步数死阈值。
 * ⚠ 步骤带 `id` 而不是裸字符串：多步确认卡与续跑记录都要按格指认某一步，
 * 而序号会随重规划变。
 */
export const AssistantOperatorPlanEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.plan),
  steps: z
    .array(
      z.object({
        id: IdSchema,
        label: z.string().trim().min(1).max(LIMITS.maxPlanItemChars),
      }),
    )
    .min(1)
    .max(LIMITS.maxPlanItems),
})

export const AssistantOperatorStepEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.step),
  step: AssistantOperatorStepSchema,
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
  /**
   * 收尾轮边生成边显示：同一条气泡按 id 覆盖，`partial: true` 时仍算在写。
   * 缺席或 false = 定稿，客户端把 `streaming` 降下来。
   */
  partial: z.boolean().optional(),
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
 * **列几个选项等用户点一个**（v2 §3.1：覆盖三选 + 候选单选并帧）。
 *
 * ⚠ 一帧**只问一道题**（§3.4「一次只问一个」）：模型想问两件事就分两轮。
 * ⚠ 题的形状复用 `AssistantOperatorPlanQuestion` —— 计划里的待定项搬进这一帧
 * 之后，两处问的本来就是同一种东西（一句问句 + 2–4 个带说明的选项，选项可以
 * 带 `assetUrl` 当缩略图，那就是旧的候选单选卡）。⛔ 别为「图片选项」
 * 另立一帧：那正是 v1 里覆盖三选与候选单选分家的老路。
 * ⚠ `overwrite` 是**覆盖手写那一支的回执路由**：三选（追加在后 / 覆盖 / 保留）
 * 答完之后要按 `field` 原样带回服务端（`confirmations`），而问句本身说不出
 * 「改的是哪一格」。缺席 = 这道题不是覆盖三选。
 * ⚠ 它之后这条流结束（`awaiting_confirm`）——服务端没有挂起态，续跑靠客户端
 * 带答复重发，与打断复用同一条机制。
 */
export const AssistantOperatorAskEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.ask),
  question: AssistantOperatorPlanQuestionSchema,
  /** 「为什么问这一句」—— 一行小字，缺席就不画。 */
  why: z.string().trim().min(1).max(LIMITS.maxMessageChars).optional(),
  overwrite: z
    .object({
      field: AssistantOperatorConfirmFieldSchema,
      /** 用户当前文本。 */
      have: z.string().max(LIMITS.maxPromptChars),
      /** 助手建议的完整文本。 */
      proposed: z.string().max(LIMITS.maxPromptChars),
      /**
       * **这段字的料从哪儿来**（LoRA §7.2）—— 逐段一行「主体 — 来自《XX》的
       * 作者推荐」/「画风 — 家族骨架（Illustrious）」，最后可以多一行方言纠错。
       *
       * ⚠ 缺席 = 这道题不是 LoRA 域的取材（图片 / 视频域一行都不给）。⛔ 别写成
       * 必填：覆盖三选在三个域里是同一张卡，必填会让另外两个域去编一句出处。
       */
      sourceNotes: z
        .array(z.string().trim().min(1).max(LIMITS.maxSourceNoteChars))
        .max(LIMITS.maxSourceNotes)
        .optional(),
      /**
       * 这一次要往负面框**补**的词（§7.3）。
       *
       * ⚠ 它是**增量**不是整段：用户已经写下的负面词一个都不动（去重口径沿用
       * `mergeNegativePrompt`）。没有要补的就整格缺席，⛔ 不给一个空数组。
       */
      negativeDiff: z
        .array(z.string().trim().min(1).max(LIMITS.maxLabelChars))
        .max(LIMITS.maxNegativeDiffTags)
        .optional(),
    })
    .optional(),
})

/**
 * **推荐卡那一帧的载荷**（lora-assistant §10.1）—— 一把一行，勾了才挂。
 *
 * ⭐ **候选本体跟着帧走**（含 `importPayload` 对应的那几格）：`candidateId → 候选`
 * 的索引只活一轮，而「挂载所选」那一下发生在流结束之后。⛔ 不许「确认时按 id 再
 * 搜一次」，见 `AssistantOperatorLoraCandidateSchema` 头注 ①。
 * ⚠ 装不上的候选（`compatible:false` / `importable:false`）**照样在 `candidates`
 * 里**（策略 C）：行变灰、不可勾、理由写在行里。⛔ 别在服务端滤掉 —— 滤掉之后
 * 用户看到的是「没搜到」，而真相是「搜到了但要换底模」。
 */
export const AssistantOperatorLoraPickConfirmSchema = z
  .object({
    /** 题面一句，模型写。 */
    question: z.string().trim().min(1).max(PLAN_LIMITS.maxQuestionChars),
    /**
     * 当前底模那一行（卡头右侧的 mono），**服务端填**。
     * ⚠ `null` = 底模未定 —— 卡上那一格不画，预算也跟着缺席。
     */
    baseFamilyLabel: LabelSchema.nullable(),
    /**
     * 当前挂载栈的总权重与阈值（§5.1）。
     * ⚠ `null` = 底模未定，算不出分母 —— ⛔ 别回落成一个写死的阈值。
     * ⚠ 超了只在卡上标红**只提醒不动手**（§5.2）：按钮照旧可点。
     */
    budget: z
      .object({
        total: z.number().nonnegative(),
        limit: z.number().positive(),
      })
      .nullable(),
    /**
     * 模型给的题材分组 —— 组间一条细线 + 小标题。
     * ⚠ 不分组时给**一个无 `title` 的组**，⛔ 不是空数组：卡上永远按组画。
     */
    groups: z
      .array(
        z.object({
          title: LabelSchema.optional(),
          candidateIds: z.array(IdSchema).min(1).max(LIMITS.maxLoraResults),
        }),
      )
      .min(1)
      .max(LIMITS.maxLoraResults),
    /**
     * ⚠ 上限沿用 `search_loras` 一轮能回的条数，⛔ 不另立一个。
     * ⚠ 用的是**收紧过的那一支**（`importPayload` 必填）：卡上这几条正是「下一
     * 刻要挂的那几把」，载荷缺席就得回头再搜一次。
     */
    candidates: z
      .array(AssistantOperatorLoraPickCandidateSchema)
      .min(1)
      .max(LIMITS.maxLoraResults),
  })
  .superRefine((value, ctx) => {
    const known = new Set(value.candidates.map((one) => one.candidateId))
    value.groups.forEach((group, groupIndex) => {
      group.candidateIds.forEach((candidateId, idIndex) => {
        if (known.has(candidateId)) return
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['groups', groupIndex, 'candidateIds', idIndex],
          message: `Unknown candidateId in group: ${candidateId}`,
        })
      })
    })
  })

export type AssistantOperatorLoraPickConfirm = z.infer<
  typeof AssistantOperatorLoraPickConfirmSchema
>

/**
 * **等你拍板才往下走**（v2 §3.3 + §8.1 + lora-assistant §10.1）—— 一帧四支。
 *
 * ⚠ 支放在 `confirm` 这一格里（按 `kind` 判别）而不是摊平到帧上：各支的必填字段
 * 互不相容（多步要 `steps`，生成要 `request`，推荐卡要 `candidates`），摊平就得把
 * 每一边都改成可选，而那等于让确认卡去处理「既没有步也没有载荷的确认」。
 * ⭐ 四支共用的判据仍然是那一条：**有一件事等你拍板才算数**。⛔ 别把支数读成
 * 上限（它从两支长到四支了），也⛔ 别拿它当「花费确认」的回魂通道：那一支随决策 8
 * 删了，覆盖手写降级成 `ask`。
 * ⚠ 每一支之后这条流都结束（`awaiting_confirm`），扳机由客户端扣（§5）——
 * 服务端到这里为止一行库都没写，钱闸不动。
 */
export const AssistantOperatorConfirmEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.confirm),
  confirm: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal(ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.multistep),
      steps: AssistantOperatorPlanEventSchema.shape.steps,
    }),
    z.object({
      kind: z.literal(ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.generate),
      request: AssistantOperatorGenerationRequestSchema,
    }),
    /**
     * **助手提议记一张上下文卡**（v2 §8.1）。
     *
     * ⚠ 它与生成那一支同构：服务端到这一帧为止**一行库都没写**，入库那一跳
     * 由用户在卡上点「存这张卡」时走既有的 `/api/context-cards`。
     * ⛔ 别把它做成 `ask` 的选项题：卡上要摆的是一张卡的预览（档 / 名字 /
     * 一句话 / 正文），而不是 2–4 个带说明的选项。
     */
    z.object({
      kind: z.literal(ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.contextCard),
      card: AssistantOperatorContextCardDraftSchema,
    }),
    /**
     * **助手把本轮 LoRA 候选摆出来等创作者勾**（lora-assistant §10.1）。
     *
     * ⚠ 它是**多选 + 一颗提交键**，这正是它不做成 `ask` 的理由：`ask` 一次只问
     * 一个、点一项就是提交。
     * ⚠ 服务端到这一帧为止一把都没挂：挂载发生在带 `loraPicks` 的下一轮，逐把过
     * `planMountLora` 的全部闸。
     */
    z.object({
      kind: z.literal(ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick),
      pick: AssistantOperatorLoraPickConfirmSchema,
    }),
  ]),
})

/**
 * 这一轮到此为止。
 *
 * ⚠ `roundSummary` 是**本轮结账**（§7.2 / §7.5 ④）：服务端在发这一帧之前把本轮
 * 压成一条结论记录，随帧下发，客户端**直接渲染，不再请求一次**。
 * ⚠ **缺席是正常形态**，⛔ 别写成必填：这一轮什么都没产出（只说了句话）、
 * 或者压缩那一跳失败了，都该照常收尾 —— 结账失败不许阻塞 `done`（§7.5）。
 */
export const AssistantOperatorDoneEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.done),
  roundSummary: AssistantOperatorRoundSummarySchema.optional(),
})

export const AssistantOperatorStoppedEventSchema = z.object({
  type: z.literal(ASSISTANT_OPERATOR_EVENTS.stopped),
  reason: AssistantOperatorStopReasonSchema,
  /**
   * **以确认卡 / 问题卡结束的那一轮也结账**（2026-09-12 实测第 2 组）。
   *
   * ⭐ 由来：`request_generation` 出确认卡之后这条流以 `stopped` 结束，而用户点
   * 「确认生成」⛔ 不再新开一轮（扳机在客户端，§5）—— 于是整个生成轮次一条结论
   * 记录都没有。判据与 `done` 那一帧逐字相同：本轮跑过步就结账，随帧下发，客户端
   * 直接渲染。
   * ⚠ **缺席仍是常态**：本轮一步没跑（纯问句 / 纯说话）、或压缩那一跳失败，都
   * 照常收尾。⛔ 一轮只写一条：同一次运行里不会结两次账。
   */
  roundSummary: AssistantOperatorRoundSummarySchema.optional(),
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
  AssistantOperatorAskEventSchema,
  AssistantOperatorConfirmEventSchema,
  AssistantOperatorMessageEventSchema,
  AssistantOperatorRuleHitEventSchema,
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
/** 计划帧（§3.1）—— 多步确认卡与续跑记录读的是同一份阶段列表。 */
export type AssistantOperatorPlanEvent = z.infer<
  typeof AssistantOperatorPlanEventSchema
>
/** 问题卡（§3.2）收的那一帧。 */
export type AssistantOperatorAskEvent = z.infer<
  typeof AssistantOperatorAskEventSchema
>
/** 确认卡（§3.3 两种来源）收的那一帧。 */
export type AssistantOperatorConfirmEvent = z.infer<
  typeof AssistantOperatorConfirmEventSchema
>
/** 规则薄卡（§2.21 / §4.2）收的那一帧。 */
export type AssistantOperatorRuleHitEvent = z.infer<
  typeof AssistantOperatorRuleHitEventSchema
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

// ─── 素材库写操作的撤销载荷（v2 §10）──────────────────────────────

/**
 * **撤销一条素材库写操作**的请求体（`POST /api/assistant/asset-writes/revert`）。
 *
 * ⭐ 为什么撤销要走一条路由，而其余改动型工具不用：那些改的是**工作台上的旋钮**
 * （客户端 state 里的一格），撤销就是往回 dispatch 一次；这四条的后果**在库里**，
 * 客户端手上没有任何东西可以往回改。形状与 `add_project_rule` 的撤销逐字同源
 * （那条走 `deleteProjectRuleAPI`），只是这里四条共用一个入口 —— 判据是它们撤销时
 * 都只需要「把那份 `inverse` 原样交回服务端」，四条路由只会把同一件事抄四遍。
 *
 * ⚠ 它收的**就是 step 上那份 `inverse`**（加一个 `tool` 判别键），⛔ 别让客户端
 * 在这里重新算一份：算第二遍就会有第二份判据，而撤销与应用必须是同一份判据的两侧。
 */
export const AssistantAssetWriteRevertSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal(ASSISTANT_OPERATOR_TOOL_IDS.tagAsset),
    entries: z
      .array(AssistantOperatorAssetTagEntrySchema)
      .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
  }),
  z.object({
    tool: z.literal(ASSISTANT_OPERATOR_TOOL_IDS.favoriteAsset),
    entries: z
      .array(AssistantOperatorAssetFavoriteEntrySchema)
      .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
  }),
  z.object({
    tool: z.literal(ASSISTANT_OPERATOR_TOOL_IDS.createFolder),
    folderId: z.string().trim().min(1).max(LIMITS.maxIdChars),
  }),
  z.object({
    tool: z.literal(ASSISTANT_OPERATOR_TOOL_IDS.moveAssets),
    entries: z
      .array(AssistantOperatorAssetFolderEntrySchema)
      .max(ASSET_WRITE_LIMITS.maxAssetsPerWrite),
  }),
])

export type AssistantAssetWriteRevert = z.infer<
  typeof AssistantAssetWriteRevertSchema
>

/**
 * 撤销的回执。
 *
 * ⚠ `revertedCount` 与 `skipped` 分开：「文件夹里后来被放进了东西所以没删」
 * 与「删掉了」是两句不同的话，而用户回头要读的正是前者（§10 的 `inverse` 那条
 * ⚠：撤销只撤得掉它自己做过的事）。
 */
export interface AssistantAssetWriteRevertResult {
  revertedCount: number
  skipped: number
}

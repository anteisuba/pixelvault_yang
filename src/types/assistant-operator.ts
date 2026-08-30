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
import { PromptAssistantResponseLanguageSchema } from '@/types'
import type { OutputTypeValue } from '@/types'

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
   * 能选什么。⛔ 空表不等于「随便填」—— 空表时 `set_specs` 一律按 `unknownValue`
   * 拒，与画布 `set_params` 同一条：不给可选列表，模型只会编一个。
   */
  aspectRatioOptions: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions),
  resolutionOptions: z.array(ParamValueSchema).max(LIMITS.maxSpecOptions),
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
  count: AssistantOperatorSnapshotCountSchema.optional(),
  references: AssistantOperatorSnapshotReferencesSchema.optional(),
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
  [ASSISTANT_OPERATOR_TOOL_IDS.setCount]: z.object({ count: z.number() }),
  [ASSISTANT_OPERATOR_TOOL_IDS.primeGenerate]: z.object({}),
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
  mutatingStep(
    ASSISTANT_OPERATOR_TOOL_IDS.setCount,
    z.object({ count: z.number().int().positive() }),
    z.object({ count: z.number().int().positive() }),
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
  field: AssistantOperatorConfirmFieldSchema,
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

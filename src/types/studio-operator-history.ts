import { z } from 'zod'
import { ReferenceAnalysisSchema } from '@/types/assistant-reference-analysis'
import { StudioOperatorCheckpointSchema } from '@/types/studio-operator-checkpoint'

import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_LIMITS as LIMITS,
} from '@/constants/assistant-operator'
import {
  AssistantOperatorPlanAnswerSchema,
  AssistantOperatorVerdictSeveritySchema,
} from '@/types/assistant-operator'
import { STUDIO_OPERATOR_SYSTEM_CODES } from '@/constants/studio-assistant-operator'

/**
 * 历史里允许出现的地址 —— **只有 http(s)**。
 *
 * ⭐ 这一行就是「⛔ 库里零 base64」那条验收在类型上的落点：`z.string().url()`
 * 单独用是**放行 `data:` 的**（`new URL('data:image/png;base64,…')` 合法），
 * 所以必须补协议闸。`blob:` 同理 —— 那是本地对象地址，存进去下次加载必然是死链。
 */
const HistoryUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.maxUserUrlChars)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: 'history url must be http(s)',
  })

const HistoryIdSchema = z.string().trim().min(1).max(LIMITS.maxIdChars)
const HistoryTextSchema = z.string().max(LIMITS.maxMessageChars)

/**
 * 历史里的附件 —— 只留「叫什么、是什么、在哪儿」。
 *
 * ⚠ 没有 `id` 以外的任何句柄，也没有在飞上传态（`StudioOperatorUpload` 整个不
 * 进历史）：一件几天前传到一半的东西，重新加载后既不该显示进度条，也不该可以
 * 重试 —— 那次上传的 `File` 早就不在内存里了。
 */
export const StudioOperatorHistoryAttachmentSchema = z.object({
  id: HistoryIdSchema,
  label: z.string().trim().min(1).max(LIMITS.maxLabelChars),
  kind: z.enum(['image', 'video', 'audio', 'model3d']),
  url: HistoryUrlSchema,
  thumbnailUrl: HistoryUrlSchema.optional(),
})

/**
 * 评价卡在历史里剩下什么（拍板 6：证据长在结论里）。
 *
 * ⭐ 「文字 + 图 URL」就是全部 —— ⛔ 没有 `runKey`，因此历史里的评价卡**画不出
 * 「还原这轮」那颗钮**：那颗钮撤的是登记簿里那一轮的改动，而登记簿是内存态，
 * 刷新之后压根不存在。没有 runKey = 那颗钮在类型上无从渲染。
 */
export const StudioOperatorHistoryCritiqueSchema = z.object({
  imageUrl: HistoryUrlSchema,
  thumbnailUrl: HistoryUrlSchema.optional(),
  modelLabel: z.string().trim().min(1).max(LIMITS.maxLabelChars).optional(),
  findings: z
    .array(
      z.object({
        /** 与在线契约同一张表（`fail` / `warn` / `pass`）—— ⛔ 不在历史里另存一套。 */
        severity: AssistantOperatorVerdictSeveritySchema,
        text: z.string().trim().min(1).max(LIMITS.maxCritiqueFindingChars),
      }),
    )
    .max(LIMITS.maxCritiqueFindings),
  advice: z.string().trim().max(LIMITS.maxCritiqueAdviceChars).optional(),
})

/**
 * 一条日志在历史里剩下什么：**标题 / 工具名 / 理由 / 结果摘要**。
 *
 * ⚠ `tool` 是**自由字符串不是工具枚举**：一条半年前存下的线程可能引用着今天
 * 已经改名的工具，收窄成 enum 的下场是整条消息校验失败、用户的历史凭空少一段。
 * 渲染那一侧按 id 查图标、查不到就给个通用图标 —— 一条读不出图标的历史仍然是
 * 一条读得懂的历史。
 * ⚠ 没有 `running` 这一档：没跑完的那一帧不是历史，它只是当时的一个瞬间。
 */
export const StudioOperatorHistoryStepSchema = z.object({
  kind: z.literal('step'),
  id: HistoryIdSchema,
  tool: HistoryIdSchema,
  title: z.string().trim().min(1).max(LIMITS.maxTitleChars),
  reason: z.string().trim().max(LIMITS.maxReasonChars).optional(),
  status: z.enum(['done', 'error']),
  /** 用户当时撤销过它 —— 划线是历史事实（但没有可点的撤销钮）。 */
  undone: z.boolean(),
  /** 结果摘要（查询词 / 命中数 / 写进去的值……）。与日志条展开后那一行同源。 */
  detail: z.string().trim().max(LIMITS.maxPromptChars).optional(),
  /** 被拒那一支的理由 id（`StudioOperator.reject.*`）。 */
  rejectReason: z.string().trim().max(LIMITS.maxIdChars).optional(),
  critique: StudioOperatorHistoryCritiqueSchema.optional(),
  checkpoint: StudioOperatorCheckpointSchema.optional().catch(undefined),
  referenceAnalysis: ReferenceAnalysisSchema.optional(),
})

export const StudioOperatorHistoryEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    id: HistoryIdSchema,
    text: HistoryTextSchema,
    attachments: z
      .array(StudioOperatorHistoryAttachmentSchema)
      .max(LIMITS.maxSnapshotReferences),
  }),
  z.object({
    kind: z.literal('message'),
    id: HistoryIdSchema,
    text: HistoryTextSchema,
  }),
  z.object({
    kind: z.literal('plan'),
    id: HistoryIdSchema,
    steps: z
      .array(z.string().trim().min(1).max(LIMITS.maxPlanItemChars))
      .max(LIMITS.maxPlanItems),
  }),
  StudioOperatorHistoryStepSchema,
  z.object({
    kind: z.literal('system'),
    id: HistoryIdSchema,
    code: z.enum(STUDIO_OPERATOR_SYSTEM_CODES),
    subject: z.string().trim().max(LIMITS.maxTitleChars).optional(),
    count: z.number().int().nonnegative().optional(),
    /**
     * ⭐ **答题那一行同时是一条 user 消息**（v2 §3.4 落账规则，2026-09-12）。
     *
     * 落库的理由与 `domainMark` 同一条：刷新之后这句话如果不在，模型又会把
     * 用户两轮前就答过的题重问一遍。渲染仍是那一行系统行 —— 这一格只在
     * 「进不进下一轮对话」那条线上被读到（`historyToOperatorMessages`）。
     */
    userText: HistoryTextSchema.optional(),
    /** 同一件事的结构化那一半（服务端合并历史答案与本轮 `planAnswers`）。 */
    answered: AssistantOperatorPlanAnswerSchema.optional(),
  }),
  /**
   * 切域标记（拍板 8）—— **跨域线程在库里唯一的痕迹**。
   *
   * ⭐ `AssistantConversation.surface` 是单值，只记得住线程**起始**的那个域；
   * 一条线程后来切到哪儿去了，答案只在这些条目里。所以它必须落库：不存的话，
   * 刷新之后一条「图片档聊到一半转去视频档」的线程会读成一段莫名其妙的对话。
   */
  z.object({
    kind: z.literal('domainMark'),
    id: HistoryIdSchema,
    domain: z.enum(ASSISTANT_OPERATOR_DOMAINS),
  }),
])

export type StudioOperatorHistoryEntry = z.infer<
  typeof StudioOperatorHistoryEntrySchema
>

export type StudioOperatorHistoryStep = z.infer<
  typeof StudioOperatorHistoryStepSchema
>

export type StudioOperatorHistoryAttachment = z.infer<
  typeof StudioOperatorHistoryAttachmentSchema
>

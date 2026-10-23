import { z } from 'zod'

import {
  ASSISTANT_TURN_RECORD_GAPS,
  ASSISTANT_TURN_RECORD_OUTCOMES,
} from '@/constants/assistant-turn-record'
import {
  AssistantOperatorDomainSchema,
  AssistantOperatorRequestSchema,
  AssistantOperatorSnapshotSchema,
  AssistantOperatorVideoClipSchema,
} from '@/types/assistant-operator'
import { AssistantV3TranscriptSchema } from '@/types/assistant-v3'

/**
 * 每轮的过程记录（`AssistantTurnRecord`，owner 2026-10-15「建表」）里那几段 JSON 的形状。
 *
 * ⭐ 都是现成 schema 的子集：快照就是请求里的 `snapshot`，本轮记录就是 v3 的 transcript，
 *   `input` 是请求里回放要用的那几样 —— 存进去的与线上跑的是同一份东西，回放才对得上。
 * ⚠ 存之前摘掉 data: 地址（换成 `data:,omitted`）与视频帧（只记帧数）：一帧几十 KB，回放用不上。
 */

export const AssistantTurnRecordOutcomeSchema = z.enum(
  ASSISTANT_TURN_RECORD_OUTCOMES,
)
export type AssistantTurnRecordOutcome = z.infer<
  typeof AssistantTurnRecordOutcomeSchema
>

export const AssistantTurnRecordGapSchema = z.enum(ASSISTANT_TURN_RECORD_GAPS)
export type AssistantTurnRecordGap = z.infer<
  typeof AssistantTurnRecordGapSchema
>

/** 一段片子：地址、称呼、片长与帧数。⛔ 帧本身不存。 */
export const AssistantTurnRecordClipSchema =
  AssistantOperatorVideoClipSchema.omit({ frames: true }).extend({
    frameCount: z.number().int().min(0),
  })
export type AssistantTurnRecordClip = z.infer<
  typeof AssistantTurnRecordClipSchema
>

/**
 * 请求里回放要用的那几样。⚠ 对话只存到这一轮创作者那一句为止（v3 发给模型的也就是这些），
 * 最多 `ASSISTANT_TURN_RECORD_LIMITS.maxMessages` 条。
 * `priorFinds` = 开轮那一跳冻进板子的上一轮找到的东西（`#n`，与模型看到的同一份，最多
 * `ASSISTANT_WEB_FIND_LIMITS.maxCarried` 条）：回放题照它带回去，「用 #2」才认得出是哪一张。
 */
export const AssistantTurnRecordInputSchema =
  AssistantOperatorRequestSchema.pick({
    messages: true,
    responseLanguage: true,
    mentions: true,
    mentionedAssets: true,
    mediaAttachments: true,
    priorSteps: true,
    confirmations: true,
    planAnswers: true,
    planApproved: true,
    authoredByAssistant: true,
    autoGenerate: true,
    searchWithGrok: true,
    stepBudget: true,
    priorFinds: true,
  }).extend({
    videoClips: z.array(AssistantTurnRecordClipSchema).optional(),
  })
export type AssistantTurnRecordInput = z.infer<
  typeof AssistantTurnRecordInputSchema
>

/**
 * 读回来的一行（排查时人工导出的那一行 `row_to_json`）。
 * ⚠ 宽进：从库里导出的一行（`row_to_json`）多带的列照收照丢，时间是字符串。
 */
export const AssistantTurnRecordSchema = z.object({
  id: z.string().optional(),
  turnId: z.string().min(1),
  hops: z.number().int().min(1),
  outcome: AssistantTurnRecordOutcomeSchema,
  errorCode: z.string().nullable(),
  workspaceKey: z.string().min(1),
  domain: AssistantOperatorDomainSchema,
  projectId: z.string().nullable(),
  conversationId: z.string().nullable(),
  adapterType: z.string().min(1),
  modelId: z.string().min(1),
  routeModel: z.string().nullable(),
  apiKeyId: z.string().nullable(),
  systemPromptHash: z.string().min(1),
  promptVersion: z.string().min(1),
  input: AssistantTurnRecordInputSchema,
  snapshot: AssistantOperatorSnapshotSchema.nullable(),
  transcript: AssistantV3TranscriptSchema,
  sizeBytes: z.number().int().min(0),
  truncated: z.array(AssistantTurnRecordGapSchema),
  createdAt: z.union([z.string(), z.date()]).optional(),
})
export type AssistantTurnRecord = z.infer<typeof AssistantTurnRecordSchema>

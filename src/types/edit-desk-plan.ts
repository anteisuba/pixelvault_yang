import { z } from 'zod'

import {
  EDIT_TRANSITIONS_TUPLE,
  TIMELINE_PLAN_COST_FREE,
  TIMELINE_PLAN_LIMITS,
  TIMELINE_PLAN_MUSIC_FADE_OUT_MAX_SEC,
  TIMELINE_PLAN_ORDERS_TUPLE,
  TIMELINE_PLAN_TAKES_TUPLE,
  TIMELINE_PLAN_TAKE_MAX_SEC,
  TIMELINE_PLAN_TAKE_MIN_SEC,
} from '@/constants/edit-desk'
import { EditProjectSchema } from '@/types/node-workflow'

/**
 * 一句话排片（S10 · spec §6）的**两份契约**：模型吐什么、剪辑台收什么。
 *
 * ── 为什么是两份而不是一份 ──────────────────────────────────────────────
 * 模型只产出**意图**（顺序从哪儿来、每段取哪一截、转场、语音对齐哪一段、配乐），
 * 「取中间 5 秒」这类算术由 `lib/timeline-plan.ts` 的纯函数做完。让模型直接吐一份
 * `EditProject` 的版本在纸面上更短，代价是它会编入点出点、编时长、编一个不存在的
 * 节点 id —— 与「⛔ 不让模型编积分」（`node-rerun-downstream.ts` 头注）是同一条
 * 纪律的另一面：**能算的绝不让它猜**。
 */

/* ─── ① 模型的输出 ─────────────────────────────────────────────────────── */

export const TimelinePlanIntentSchema = z.object({
  /** 顺序来源。⚠ 排序本身在服务端做，这里只说「按什么排」。 */
  order: z.enum(TIMELINE_PLAN_ORDERS_TUPLE),
  /**
   * 要摆进 V 轨的视频卡（模型转述用户点名的那几张）。
   *
   * ⚠ 空数组 = 「画布上所有有产物的视频卡」。⛔ 不认里面的陌生 id：不在画布上的
   * 一律丢，宁可少一段也不摆一段指向幻觉的幽灵。
   */
  videoNodeIds: z
    .array(z.string().trim().min(1).max(160))
    .max(TIMELINE_PLAN_LIMITS.maxClips)
    .default([]),
  /** 每段取哪一截。 */
  take: z.enum(TIMELINE_PLAN_TAKES_TUPLE),
  /** 取几秒（`full` 时无意义）。缺席 = `TIMELINE_PLAN_TAKE_DEFAULT_SEC`。 */
  takeSeconds: z
    .number()
    .min(TIMELINE_PLAN_TAKE_MIN_SEC)
    .max(TIMELINE_PLAN_TAKE_MAX_SEC)
    .optional(),
  /** 段尾转场（全片同一种；逐段改是右栏的事）。 */
  transition: z.enum(EDIT_TRANSITIONS_TUPLE),
  /** 语音：哪张音频卡、从第几段开始（0 基）。 */
  voice: z
    .object({
      nodeId: z.string().trim().min(1).max(160),
      alignToIndex: z.number().int().min(0).max(TIMELINE_PLAN_LIMITS.maxClips),
    })
    .optional(),
  /** 配乐：哪张音频卡、尾部淡出几秒。 */
  music: z
    .object({
      nodeId: z.string().trim().min(1).max(160),
      fadeOutSec: z
        .number()
        .min(0)
        .max(TIMELINE_PLAN_MUSIC_FADE_OUT_MAX_SEC)
        .optional(),
    })
    .optional(),
  /** 一句话摘要（提案卡上那行）。 */
  summary: z.string().trim().min(1).max(TIMELINE_PLAN_LIMITS.maxSummaryLength),
  /** 逐段理由。⚠ 按**节点 id** 给 —— 段 id 是服务端现铸的，模型不知道。 */
  reasons: z
    .array(
      z.object({
        nodeId: z.string().trim().min(1).max(160),
        reason: z
          .string()
          .trim()
          .min(1)
          .max(TIMELINE_PLAN_LIMITS.maxReasonLength),
      }),
    )
    .max(TIMELINE_PLAN_LIMITS.maxClips)
    .default([]),
})

export type TimelinePlanIntent = z.infer<typeof TimelinePlanIntentSchema>

/* ─── ② 剪辑台收到的提案 ───────────────────────────────────────────────── */

/**
 * 一段的「为什么」。
 *
 * ⚠ 这里存的是**事实**（取了哪一截、原素材多长、模型补的一句话），⛔ 不存已经
 * 拼好的中文：文案是三语的，拼在服务端等于把 i18n 搬进了服务层。「取 1.0s–6.0s
 * （画面最稳的 5 秒）」由右栏用这些数字现拼。
 */
export const TimelineProposalRationaleSchema = z.object({
  clipId: z.string().trim().min(1).max(160),
  nodeId: z.string().trim().min(1).max(160),
  take: z.enum(TIMELINE_PLAN_TAKES_TUPLE),
  inSec: z.number().min(0),
  outSec: z.number().min(0),
  /** 原素材总长 —— 「从 7 秒里取 5 秒」这句话要它。 */
  sourceDurationSec: z.number().min(0),
  /** 模型补的那一句。缺席 = 只有算术。 */
  reason: z
    .string()
    .trim()
    .max(TIMELINE_PLAN_LIMITS.maxReasonLength)
    .optional(),
})

export type TimelineProposalRationale = z.infer<
  typeof TimelineProposalRationaleSchema
>

export const TimelineProposalSchema = z.object({
  /** 采用后要落进 `state.edit` 的那一份 —— 整表替换，一批一个撤销条目。 */
  project: EditProjectSchema,
  rationale: z
    .array(TimelineProposalRationaleSchema)
    .max(TIMELINE_PLAN_LIMITS.maxClips),
  summary: z.string().trim().min(1).max(TIMELINE_PLAN_LIMITS.maxSummaryLength),
  counts: z.object({
    /** 提案里 V 轨有几段（卡上「改了 N 段」）。 */
    clipsChanged: z.number().int().min(0),
    /** 提案新摆了几条轨（A / M，卡上「加 N 轨」）。 */
    tracksAdded: z.number().int().min(0),
  }),
  /** ⚠ 只有一个值。排片**永远**不花积分 —— 它一个生成都不发。 */
  cost: z.literal(TIMELINE_PLAN_COST_FREE),
})

export type TimelineProposal = z.infer<typeof TimelineProposalSchema>

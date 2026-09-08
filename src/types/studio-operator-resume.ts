/**
 * **断点续跑记录**的形状（第三期 · 客户端侧）。
 *
 * ── 它与协议侧的 `AssistantOperatorResumeFrom` 是两件东西 ─────────────
 * 协议那份是「发上去的那一截」：只有 planId 与已完成步。这一份是**存在浏览器里
 * 的整份计划**：还没做的、失败的、失败原因、这份计划属于哪台工作台哪条会话。
 * 合成一个的下场是要么协议里多出一堆服务端永远不读的字段（每一轮都要过一次
 * zod 与网络），要么本地记不下「第 4 步为什么挂了」——而那句话正是续跑按钮旁边
 * 唯一有用的信息。
 *
 * ⚠ **Zod 而不是 interface**：它从 `localStorage` 读回来，那是一段用户能手改、
 * 也可能是上一个版本写下的字符串。没有 schema 的下场是一份形状不对的旧值让整个
 * 面板在挂载时抛（`readOperatorResume` 解不出来就整条丢掉，见其头注）。
 */

import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_RESUME_LIMITS,
  ASSISTANT_OPERATOR_RESUME_STEP_STATES,
} from '@/constants/assistant-operator'

const IdSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_OPERATOR_LIMITS.maxIdChars)

export const StudioOperatorResumeStepSchema = z.object({
  id: IdSchema,
  label: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_OPERATOR_LIMITS.maxPlanItemChars),
  state: z.enum(ASSISTANT_OPERATOR_RESUME_STEP_STATES),
  /** `done` 才有意义 —— 这一步落下来的产物 id。 */
  artifactIds: z
    .array(IdSchema)
    .max(ASSISTANT_OPERATOR_RESUME_LIMITS.maxArtifactsPerStep)
    .optional(),
  /**
   * `failed` 才有 —— 一句给人看的原因，续跑按钮旁边写的就是它。
   * ⚠ 存的是**已经翻译过的那句话**：i18n key 存下来，换语言之后读回一句
   * 「Errors.generation.xxx」比没有还糟。
   */
  reason: z
    .string()
    .trim()
    .max(ASSISTANT_OPERATOR_LIMITS.maxReasonChars)
    .optional(),
})

export const StudioOperatorResumePlanSchema = z.object({
  planId: IdSchema,
  /**
   * 这份计划是在哪台工作台上批的。
   *
   * ⚠ 续跑入口**只在同域露脸**：图片档批的六步计划，在视频档上问「要继续吗」——
   * 而那六步里的每一条改的都是图片表单上的旋钮。
   */
  domain: z.enum(ASSISTANT_OPERATOR_DOMAINS),
  /**
   * 起这份计划的那条会话（`null` = 当时还没落库）。
   *
   * ⚠ 只作**显示与归属**用，⛔ 不作闸：会话可以在续跑之前才第一次落库，拿它当
   * 硬匹配条件的下场是刚失败的那份计划立刻就续不了了。
   */
  sessionId: z.string().nullable(),
  /** ISO 串 —— 保质期（`STUDIO_OPERATOR_RESUME_TTL_MS`）按它算。 */
  updatedAt: z.string(),
  steps: z
    .array(StudioOperatorResumeStepSchema)
    .min(1)
    .max(ASSISTANT_OPERATOR_RESUME_LIMITS.maxSteps),
})

export type StudioOperatorResumeStep = z.infer<
  typeof StudioOperatorResumeStepSchema
>

export type StudioOperatorResumePlan = z.infer<
  typeof StudioOperatorResumePlanSchema
>

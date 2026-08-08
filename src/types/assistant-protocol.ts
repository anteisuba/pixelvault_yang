import { z } from 'zod'

import { ASSISTANT_CLARIFY_LIMITS } from '@/constants/assistant-protocol'

/**
 * 助手对话协议的载荷形状（A2）。
 *
 * ⚠ **反问卡的 schema 不是新造的** —— 它逐字是画布剧本线用了一个多月的
 * `ScriptDocClarifyingQuestionSchema`（question + options + multiSelect +
 * allowCustom + allowSkip，五个字段一个不差）。A2 要把反问从「只有 ScriptDoc
 * 起草时才有」推广到四个域，所以定义搬到这里，`types/script-doc.ts` 改为引用。
 *
 * 新造一份的代价很具体：用户会在同一个助手里看到两种长相不同、行为不同的问题卡。
 */

const ClarifyIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_CLARIFY_LIMITS.idMaxLength)

const ClarifyTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_CLARIFY_LIMITS.textMaxLength)

export const AssistantClarifyingOptionSchema = z.object({
  id: ClarifyIdSchema,
  label: ClarifyTextSchema,
})

export const AssistantClarifyingQuestionSchema = z.object({
  id: ClarifyIdSchema,
  question: ClarifyTextSchema,
  options: z
    .array(AssistantClarifyingOptionSchema)
    .min(1)
    .max(ASSISTANT_CLARIFY_LIMITS.maxOptions),
  multiSelect: z.boolean().default(false),
  allowCustom: z.boolean().default(true),
  allowSkip: z.boolean().default(true),
})

/** `[[ask]]` 块的载荷。 */
export const AssistantAskBlockSchema = z.object({
  questions: z
    .array(AssistantClarifyingQuestionSchema)
    .min(1)
    .max(ASSISTANT_CLARIFY_LIMITS.maxQuestions),
})

/**
 * `[[next]]` 块的载荷 —— 每轮结尾的收敛选项。
 *
 * 两个字段都是**具体的下一步文案**，不是「是/否」。点 `satisfied` 就是收敛信号：
 * 这是「机器怎么知道讨论结束了」的答案，来自 LibTV 实拍而不是设计推演。
 *
 * `adjust` 允许缺省 —— 模型偶尔只写 satisfied，那时用本地化兜底文案比整块判 invalid
 * 好：判 invalid 会让整轮回复退化成没有收敛入口的散文，正是这条协议要消灭的形态。
 */
export const AssistantNextStepSchema = z.object({
  satisfied: ClarifyTextSchema,
  adjust: ClarifyTextSchema.optional(),
})

/**
 * 一条已回答的问答对（A2c 的「已询问」折叠块）。
 *
 * ⚠ **它是结构化随消息带过来的，不是从答复文本反解出来的。** 反解意味着按
 * 「问题 — 答案」这种本地化分隔符去 split 一段用户消息 —— 换个语言就散架，而且
 * 用户手打一个破折号就能把它骗过去。控件本来就手里有结构，直接带走。
 */
export interface AssistantAskedPair {
  question: string
  answer: string
}

export type AssistantClarifyingOption = z.infer<
  typeof AssistantClarifyingOptionSchema
>
export type AssistantClarifyingQuestion = z.infer<
  typeof AssistantClarifyingQuestionSchema
>
export type AssistantAskBlock = z.infer<typeof AssistantAskBlockSchema>
export type AssistantNextStep = z.infer<typeof AssistantNextStepSchema>

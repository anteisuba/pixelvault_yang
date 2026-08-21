import { z } from 'zod'

import {
  ASSISTANT_CLARIFY_FALLBACK_ID_PREFIXES,
  ASSISTANT_CLARIFY_LIMITS,
  ASSISTANT_LORA_PICK_LIMITS,
} from '@/constants/assistant-protocol'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 一组条目里只要有一个缺 id，**整组**按位置重编号。
 *
 * 只补缺的那个是错的：模型写的 id 恰好是 `o-2`、而我们给它旁边那个也补出 `o-2`
 * 时，两个 chip 共用一个键 —— 点一个亮两个。整组重编号让唯一性由构造保证，
 * 不靠运气。
 */
function withPositionalIds(items: unknown[], prefix: string): unknown[] {
  const complete = items.every(
    (item) => isRecord(item) && typeof item.id === 'string' && item.id.trim(),
  )
  if (complete) return items
  return items.map((item, index) =>
    isRecord(item) ? { ...item, id: `${prefix}${index + 1}` } : item,
  )
}

/**
 * `[[ask]]` 载荷送进 schema 前的**无损归一化** —— 2026-08-21 真机事故的第二个症状。
 *
 * 那轮回复里 `[[setup]]` 解析成功、`[[ask]]` 降级成一行「读不出来」。抽取器的块
 * 边界经复现验证是对的（两块共存的用例本来就绿），差的是载荷形状：`[[setup]]` 的
 * schema 两个字段全可选，而反问块要求**每个问题、每个选项都自带 id**——协议里最
 * 没信息量的字段，卡掉了最有信息量的内容。
 *
 * 只归一化「读法唯一」的三种形状，全都不猜语义：
 *   ① 根写成裸数组（漏了 `questions` 外壳）；
 *   ② 选项写成纯字符串（`["战斗服","私服"]`）；
 *   ③ 缺 id（按位置补）。
 * ⛔ 不做同义词猜测（`text`→`label` 这类），也不放宽到 `unknown` 直通：真读不出来
 * 的载荷照旧走 `malformed`，那条体面降级路径是这套协议「不静默吞」的底线。
 */
function normalizeAskPayload(raw: unknown): unknown {
  const questions = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.questions)
      ? raw.questions
      : null
  // 连问题数组都找不到 —— 读法不唯一，原样交回去让 schema 判 invalid。
  if (!questions) return raw

  const withOptions = questions.map((question) => {
    if (!isRecord(question) || !Array.isArray(question.options)) return question
    const options = question.options.map((option) =>
      typeof option === 'string' ? { label: option } : option,
    )
    return {
      ...question,
      options: withPositionalIds(
        options,
        ASSISTANT_CLARIFY_FALLBACK_ID_PREFIXES.option,
      ),
    }
  })

  return {
    questions: withPositionalIds(
      withOptions,
      ASSISTANT_CLARIFY_FALLBACK_ID_PREFIXES.question,
    ),
  }
}

/** `[[ask]]` 块的载荷。 */
export const AssistantAskBlockSchema = z.preprocess(
  normalizeAskPayload,
  z.object({
    questions: z
      .array(AssistantClarifyingQuestionSchema)
      .min(1)
      .max(ASSISTANT_CLARIFY_LIMITS.maxQuestions),
  }),
)

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
 * `[[prompt]]` 块的载荷 —— 档 3 真正要回填的东西。
 *
 * **每个字段对应界面上一个不同的落点**，这正是它必须结构化、不能靠「取第一个代码
 * 块」的原因：`positive` → 正面框，`negative` → **负面框**，`aspectRatio` → 规格
 * 表单位。以前三者混在一段消息里被整体灌进正面框（owner 2026-08-18 截图），
 * 负面提示词和「宽高比 16:9」就这么变成了正面提示词的一部分。
 *
 * `positive` 是唯一必填：没有正面提示词就谈不上「交付了一版提示词」，那种回复
 * 本来就不该出现回填按钮。其余两个缺省即「这次没建议」，不是「清空它」——
 * 回填时只动模型明确给了的那一项。
 */
export const AssistantPromptBlockSchema = z.object({
  positive: z.string().trim().min(1),
  negative: z.string().trim().min(1).optional(),
  aspectRatio: z.string().trim().min(1).optional(),
})
export type AssistantPromptBlock = z.infer<typeof AssistantPromptBlockSchema>

/**
 * `[[setup]]` 块 —— 对**工作台配置**的提案，与提示词分开的一个块。
 *
 * **为什么不并进 `[[prompt]]`**：`[[prompt]]` 是档 3 专属（有成品提示词才有它），
 * 而「这个动画质感该换 Illustrious」在**档 2 讨论时就成立**。并进去只有两种结局：
 * 要么逼助手提前交付提示词，要么这个提案根本没地方放。
 *
 * ⚠ **两个字段都不做花钱的事**。选模型和改张数都只写表单，真正花钱的是「生成」
 * 那一下，而生成按钮上方常驻着预估费用——既有的确认门没被绕过。
 *
 * 收窄一律在客户端做，且**复用表单已有的取值范围**（模型查 `modelOptions`、
 * 张数查 `IMAGE_BATCH_COUNTS`），chip 层不再写第二份校验。收窄不过 = 不出 chip。
 */
export const AssistantSetupBlockSchema = z
  .object({
    /** 模型 id，取自状态块里那张「现在能选的模型」表。 */
    model: z.string().trim().min(1).optional(),
    /** 每个模型出几张。⚠ 它是**请求数**，不是「一次出几张」，见 `IMAGE_BATCH_COUNTS`。 */
    batchCount: z.number().int().positive().optional(),
  })
  // 空块没有意义：一个字段都没有的提案不该产出任何 chip，当场判 undefined 比
  // 让下游每个消费点各写一次「都空就别渲染」干净。
  .refine((value) => Boolean(value.model || value.batchCount))
export type AssistantSetupBlock = z.infer<typeof AssistantSetupBlockSchema>

/**
 * `[[lora]]` 块 —— LoRA 推荐（切片 3「一次确认链」）。
 *
 * ⭐ **载荷里只有 `candidateId` + 理由 + 建议权重，一个事实字段都没有。**
 * 名字/作者/许可/下载链接来自服务端检索回来的候选对象；模型写它们只有两种
 * 结局：与卡面数据不一致，或者干脆是编的。`[[setup]]` 那批已经实证过一次
 * （模型编了一个工作区里不存在的模型 id），LoRA 这条链后面接着的是「一次确认
 * → 自动下载导入挂载」，编出来的链接会一路走到用户的库里。
 *
 * **收窄不在这张 schema 上做**：`candidateId` 命不命中本轮候选列表，这里判断
 * 不了（schema 不知道本轮注入了什么）。判断在
 * `narrowLoraPicksToCandidates`，与 `[[setup]]` 的模型 id 查表同一条路数 ——
 * 命不中就不出 chip。这里只挡形状。
 */
export const AssistantLoraPickSchema = z.object({
  candidateId: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_LORA_PICK_LIMITS.candidateIdMaxLength),
  /** 为什么推荐这一把 —— 候选数据里唯一没有的东西，也是这个块存在的理由。 */
  reason: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_LORA_PICK_LIMITS.reasonMaxLength),
  suggestedWeight: z
    .number()
    .min(ASSISTANT_LORA_PICK_LIMITS.minWeight)
    .max(ASSISTANT_LORA_PICK_LIMITS.maxWeight)
    .optional(),
})
export type AssistantLoraPick = z.infer<typeof AssistantLoraPickSchema>

export const AssistantLoraBlockSchema = z.object({
  picks: z
    .array(AssistantLoraPickSchema)
    .min(1)
    .max(ASSISTANT_LORA_PICK_LIMITS.maxPicks),
})
export type AssistantLoraBlock = z.infer<typeof AssistantLoraBlockSchema>

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

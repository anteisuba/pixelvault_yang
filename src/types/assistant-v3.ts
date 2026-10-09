import { z } from 'zod'

import { ASSISTANT_OPERATOR_SEARCH_KINDS } from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_CARD_TYPES,
  ASSISTANT_V3_EDIT_OP_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TOOLS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
  ASSISTANT_V3_WRITE_FIELDS,
  ASSISTANT_V3_WRITE_MODES,
} from '@/constants/assistant-v3'
import { NODE_SCRIPT_PROJECTION_MODES } from '@/constants/node-script'
import { NODE_SLOT_TEXT_ROLES, NODE_SLOTS } from '@/constants/node-slots'

/* ─────────────────────────────────────────────────────────────────────────
 * ① 八个工具的入参 —— 给 provider 看的那一份。
 *
 * ⚠ 只写形状，⛔ 不写长度 / 个数上限：OpenAI 严格模式不认那几个关键字，写了整个
 *   请求被拒。上限由执行器在落地前校验（`ASSISTANT_V3_LIMITS`），超了作为工具
 *   结果退回给模型。
 * ⚠ 可选字段一律 `nullable`、不写 `optional`：严格模式要求每个字段都列在
 *   required 里。联合用 `z.union`（转出来是 anyOf），⛔ 别换成判别联合（oneOf）。
 * ───────────────────────────────────────────────────────────────────────── */

const one = <const T extends string>(value: T) => z.enum([value])

const CardHandleSchema = z
  .string()
  .describe(
    'A card handle from the board, e.g. "img-6db120", or a "ref" you declared earlier in the same edit batch.',
  )

export const AssistantV3ParamsInputSchema = z.object({
  aspectRatio: z.string().nullable(),
  resolution: z.string().nullable(),
  quality: z.string().nullable(),
  duration: z.string().nullable(),
  count: z.number().int().nullable(),
  generateAudio: z.boolean().nullable(),
  storyboardGrid: z.boolean().nullable(),
})

export const AssistantV3EditOpInputSchema = z.union([
  z.object({
    op: one(ASSISTANT_V3_EDIT_OP_IDS.add),
    ref: z
      .string()
      .describe(
        'A short temporary name ("new1") that later ops in this batch use for this card.',
      ),
    type: z
      .enum(ASSISTANT_V3_CARD_TYPES)
      .describe(
        'Card type as kind/subtype, written the way the board prints it. image/reference only holds a picture put there by hand: it takes no inputs and never generates. A new picture to generate is image/character, image/background or image/shot.',
      ),
    name: z.string(),
    model: z.string().nullable(),
    params: AssistantV3ParamsInputSchema.nullable(),
    /** 新卡的提示词（文本卡是正文）—— 建卡与写词一批落，不必等接力。 */
    text: z.string().nullable(),
    shot: z.number().int().nullable(),
  }),
  z.object({
    op: one(ASSISTANT_V3_EDIT_OP_IDS.set),
    card: CardHandleSchema,
    name: z.string().nullable(),
    model: z.string().nullable(),
    params: AssistantV3ParamsInputSchema.nullable(),
  }),
  z.object({
    op: one(ASSISTANT_V3_EDIT_OP_IDS.connect),
    from: CardHandleSchema,
    to: CardHandleSchema,
    slot: z.enum(NODE_SLOTS),
    role: z.enum(NODE_SLOT_TEXT_ROLES).nullable(),
  }),
  z.object({
    op: one(ASSISTANT_V3_EDIT_OP_IDS.disconnect),
    from: CardHandleSchema,
    to: CardHandleSchema,
    slot: z.enum(NODE_SLOTS).nullable(),
  }),
  z.object({
    op: one(ASSISTANT_V3_EDIT_OP_IDS.delete),
    card: CardHandleSchema,
  }),
  z
    .object({
      op: one(ASSISTANT_V3_EDIT_OP_IDS.moveToShot),
      card: CardHandleSchema,
      shot: z.number().int().nullable(),
    })
    .describe(
      'Move ONE card into another existing LANE (null takes it out of every lane). It does not change the order of shots, and a lane number that does not exist leaves a gap.',
    ),
  z
    .object({
      op: one(ASSISTANT_V3_EDIT_OP_IDS.reorderShot),
      from: z.number().int(),
      to: z.number().int(),
    })
    .describe(
      'Change the order of shots: the whole LANE numbered from moves to position to and the lanes in between shift by one. Use this to move a shot earlier, later or to the end.',
    ),
  z.object({
    op: one(ASSISTANT_V3_EDIT_OP_IDS.projectScript),
    script: CardHandleSchema,
    mode: z.enum(NODE_SCRIPT_PROJECTION_MODES),
  }),
])

export type AssistantV3EditOpInput = z.infer<
  typeof AssistantV3EditOpInputSchema
>
export type AssistantV3ParamsInput = z.infer<
  typeof AssistantV3ParamsInputSchema
>

export const AssistantV3EditInputSchema = z.object({
  ops: z.array(AssistantV3EditOpInputSchema),
})

export const AssistantV3WriteEntrySchema = z.object({
  card: CardHandleSchema,
  field: z.enum(ASSISTANT_V3_WRITE_FIELDS),
  mode: z.enum(ASSISTANT_V3_WRITE_MODES),
  text: z.string().nullable(),
  edits: z
    .array(z.object({ find: z.string(), replace: z.string() }))
    .nullable(),
})

/** 一次写几张卡（T07：两张镜头卡换同一个词）—— 一批落，一次接力。 */
export const AssistantV3WriteInputSchema = z.object({
  writes: z.array(AssistantV3WriteEntrySchema),
})

export type AssistantV3WriteEntry = z.infer<typeof AssistantV3WriteEntrySchema>
export type AssistantV3WriteInput = z.infer<typeof AssistantV3WriteInputSchema>

export const AssistantV3ReadInputSchema = z.object({
  cards: z.array(CardHandleSchema),
})

export const AssistantV3LookInputSchema = z.object({
  cards: z.array(CardHandleSchema),
  question: z.string(),
})

export const AssistantV3GenerateInputSchema = z.object({
  cards: z.array(CardHandleSchema),
})

export const AssistantV3SearchWebInputSchema = z.object({
  goal: z.string(),
  entities: z.array(z.string()),
  onlySources: z.array(z.string()).nullable(),
})

export const AssistantV3SearchLibraryInputSchema = z.object({
  query: z.string(),
  kind: z.enum(ASSISTANT_OPERATOR_SEARCH_KINDS).nullable(),
})

export const AssistantV3AskInputSchema = z.object({
  questions: z.array(
    z.object({
      header: z.string(),
      question: z.string(),
      multiSelect: z.boolean(),
      allowOther: z.boolean(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string(),
          recommended: z.boolean(),
        }),
      ),
    }),
  ),
})

export type AssistantV3AskInput = z.infer<typeof AssistantV3AskInputSchema>

/* ─────────────────────────────────────────────────────────────────────────
 * ② 本轮记录（transcript）—— 前端原样带回，服务端还原成消息。
 *
 * ⭐ 为什么由服务端写、前端只是搬运：提示要「只追加」才吃得到缓存，而画布改动
 *   要等前端落完再接力（新卡的 id 在前端生成）。接力那一跳服务端手里只有最新
 *   快照 —— 拿它重画板子，前缀就和上一跳不一样了。所以开轮时的板子、每次调用
 *   与结果都冻结在这份记录里，接力时逐字还原。
 * ⚠ `input` 存 JSON 文本而不是对象：原样回放，provider 看到的字节不变。
 * ───────────────────────────────────────────────────────────────────────── */

const TranscriptIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_V3_LIMITS.maxCallIdChars)

export const AssistantV3TranscriptBoardEntrySchema = z.object({
  type: z.literal(ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.board),
  text: z.string().max(ASSISTANT_V3_LIMITS.maxBoardChars),
  images: z
    .array(
      z.object({
        url: z.string().url().max(4_000),
        label: z.string().max(ASSISTANT_V3_LIMITS.maxNameChars * 2),
      }),
    )
    .max(ASSISTANT_V3_LIMITS.maxLookCards * 2),
})

export const AssistantV3TranscriptCallSchema = z.object({
  id: TranscriptIdSchema,
  tool: z.enum(ASSISTANT_V3_TOOLS),
  input: z.string().max(ASSISTANT_V3_LIMITS.maxEntryChars),
  /**
   * 这一批落地前板子上已有的节点 id —— 只有带 `add` 的 edit 才记。接力时拿最新
   * 快照减掉它，就知道哪几张是这一批新建的，临时名才对得上真 id。
   */
  knownIds: z.array(TranscriptIdSchema).max(1_000).optional(),
})

export const AssistantV3TranscriptAssistantEntrySchema = z.object({
  type: z.literal(ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.assistant),
  text: z.string().max(ASSISTANT_V3_LIMITS.maxEntryChars),
  calls: z
    .array(AssistantV3TranscriptCallSchema)
    .max(ASSISTANT_V3_LIMITS.maxCallsPerMessage),
})

export const AssistantV3TranscriptResultEntrySchema = z.object({
  type: z.literal(ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS.result),
  id: TranscriptIdSchema,
  tool: z.enum(ASSISTANT_V3_TOOLS),
  output: z.string().max(ASSISTANT_V3_LIMITS.maxEntryChars),
  error: z.boolean(),
})

export const AssistantV3TranscriptEntrySchema = z.discriminatedUnion('type', [
  AssistantV3TranscriptBoardEntrySchema,
  AssistantV3TranscriptAssistantEntrySchema,
  AssistantV3TranscriptResultEntrySchema,
])

export const AssistantV3TranscriptSchema = z
  .array(AssistantV3TranscriptEntrySchema)
  .max(ASSISTANT_V3_LIMITS.maxTranscriptEntries)

export type AssistantV3TranscriptEntry = z.infer<
  typeof AssistantV3TranscriptEntrySchema
>
export type AssistantV3Transcript = z.infer<typeof AssistantV3TranscriptSchema>
export type AssistantV3TranscriptCall = z.infer<
  typeof AssistantV3TranscriptCallSchema
>

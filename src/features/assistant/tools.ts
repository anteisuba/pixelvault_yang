import { jsonSchema, tool } from 'ai'
import { z } from 'zod'

import { NOVELAI_SCENE_TEXT_KINDS } from '@/constants/novelai'
import {
  ASSISTANT_NEXT_EDIT_OPS,
  ASSISTANT_NEXT_LIMITS,
  ASSISTANT_NEXT_TOOL_IDS,
  ASSISTANT_NEXT_WRITE_MODES,
} from '@/features/assistant/constants'

/**
 * 四个工具的入参。
 *
 * ── 校验只修不拒（总设计第二节）──────────────────────────────────
 * 基线里 7 次「write 参数不对」全是 Claude 等非严格模型省略了可空字段：OpenAI 严格模式要求
 * 每个字段都写出来，别家不写。这里：
 *  · 给模型看的 JSON schema 照严格模式写（每个字段必填、可空的写成 `X | null`），OpenAI 官方能开 strict；
 *  · 交给 SDK 的是 `jsonSchema()`、⛔ 不带校验 —— 少写字段的调用不会被 SDK 判成 invalid；
 *  · 真正的解析在这里自己做：可空的缺了当 null，单个对象当成一条的数组、数字写成字符串也认。
 * 真做不了的（缺了必需的那一格）才回错，并说清是哪一格。
 */

const ValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const LookInputSchema = z.object({
  pictures: z
    .array(z.string().trim().min(1))
    .max(ASSISTANT_NEXT_LIMITS.maxLookPictures)
    .nullish()
    .describe(
      'Pictures to put in front of you, by name: "ref-1", "result-1", "sample", or the name of a picture attached to the message. null = only read the bench.',
    ),
  question: z
    .string()
    .nullish()
    .describe('What you want to find out by looking. Optional.'),
})
export type LookInput = z.infer<typeof LookInputSchema>

export const FindReplaceSchema = z.object({
  find: z.string(),
  replace: z.string(),
})

const PersonSchema = z.object({
  prompt: z
    .string()
    .describe(
      'This one person in tags: identity, look, clothes, pose, expression.',
    ),
  negative: z.string().nullish(),
  x: z.number().nullish(),
  y: z.number().nullish(),
  interactions: z
    .array(
      z.object({
        tag: z.string(),
        target: z
          .number()
          .int()
          .describe('The other person, by number in this list (1-based).'),
        mutual: z.boolean().nullish(),
      }),
    )
    .nullish(),
  dialogue: z
    .string()
    .nullish()
    .describe(
      'The line this person says, in the language it should appear in.',
    ),
})

const SceneTextSchema = z.object({
  kind: z.enum(NOVELAI_SCENE_TEXT_KINDS),
  text: z.string(),
})

export const EditChangeSchema = z.object({
  op: z.enum(ASSISTANT_NEXT_EDIT_OPS),
  mode: z
    .enum(ASSISTANT_NEXT_WRITE_MODES)
    .nullish()
    .describe(
      'prompt / negative: "edit" replaces exact {find, replace} pairs and keeps everything else; "replace" writes the whole field; "append" adds to the end.',
    ),
  text: z
    .string()
    .nullish()
    .describe('prompt / negative with mode "replace" or "append".'),
  edits: z
    .array(FindReplaceSchema)
    .max(ASSISTANT_NEXT_LIMITS.maxFindReplace)
    .nullish()
    .describe('prompt / negative with mode "edit".'),
  model: z.string().nullish().describe('model: a model id or label.'),
  channel: z.string().nullish().describe('model: a channel id or label.'),
  aspectRatio: z.string().nullish().describe('specs'),
  resolution: z.string().nullish().describe('specs'),
  quality: z.string().nullish().describe('specs'),
  background: z.string().nullish().describe('specs'),
  count: z.number().nullish().describe('count: pictures per run.'),
  key: z
    .string()
    .nullish()
    .describe('option: the option key; lora_param: the parameter.'),
  value: ValueSchema.nullish().describe('option / lora_param: the new value.'),
  picture: z
    .string()
    .nullish()
    .describe(
      'add_reference: a picture name (attached picture or "result-N"); remove_reference: "ref-N".',
    ),
  url: z
    .string()
    .nullish()
    .describe('import_url: the link the creator gave you.'),
  positioning: z
    .enum(['auto', 'manual'])
    .nullish()
    .describe('people (tag bench): where the people stand.'),
  people: z
    .array(PersonSchema)
    .nullish()
    .describe(
      'people (tag bench): the full list of people, each with their own prompt; [] removes the layout.',
    ),
  items: z
    .array(SceneTextSchema)
    .nullish()
    .describe(
      'scene_texts (tag bench): the full list of text drawn in the picture that nobody says; [] removes them.',
    ),
  lora: z
    .string()
    .nullish()
    .describe(
      'lora_weight / remove_lora: the mounted LoRA, by handle or name.',
    ),
  weight: z.number().nullish().describe('lora_weight'),
})
export type EditChange = z.infer<typeof EditChangeSchema>

export const EditInputSchema = z.object({
  changes: z
    .array(EditChangeSchema)
    .min(1)
    .max(ASSISTANT_NEXT_LIMITS.maxEditOps),
})

export const AskOptionSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().nullish(),
  recommended: z.boolean().nullish(),
  picture: z
    .string()
    .nullish()
    .describe('A picture name when the choice is between pictures.'),
})

export const AskInputSchema = z.object({
  question: z.string().trim().min(1),
  header: z
    .string()
    .nullish()
    .describe('A two-to-four word label for the question.'),
  multiSelect: z.boolean().nullish(),
  allowOther: z
    .boolean()
    .nullish()
    .describe(
      'false only for a closed set; otherwise they can type their own answer.',
    ),
  options: z.array(AskOptionSchema).min(2).max(6),
})
export type AskInput = z.infer<typeof AskInputSchema>

export const GenerateInputSchema = z.object({
  say: z
    .string()
    .nullish()
    .describe('One line shown above the confirm card. Optional.'),
  label: z
    .string()
    .nullish()
    .describe('A short name for this run (a few words). Optional.'),
})
export type GenerateInput = z.infer<typeof GenerateInputSchema>

type JsonObject = { [key: string]: JsonValue }
type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 严格模式的形状：每个对象的每个字段都必填、不收别的字段。可空的已经是 `X | null`。 */
function strictify(node: JsonValue): JsonValue {
  if (Array.isArray(node)) return node.map(strictify)
  if (!isJsonObject(node)) return node
  const out: JsonObject = {}
  for (const [key, value] of Object.entries(node)) out[key] = strictify(value)
  if (out.type === 'object' && isJsonObject(out.properties)) {
    out.required = Object.keys(out.properties)
    out.additionalProperties = false
  }
  delete out.$schema
  return out
}

export function toModelJsonSchema(schema: z.ZodType): JsonObject {
  const raw = z.toJSONSchema(schema, { io: 'input' }) as JsonValue
  return strictify(raw) as JsonObject
}

const NUMBER_FIELDS = ['count', 'weight'] as const

/** 模型常见的几种写偏：整串 JSON、单个对象当数组、数字写成字符串、可空字段缺席。 */
function loosen(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return loosen(JSON.parse(raw) as unknown)
    } catch {
      return raw
    }
  }
  return raw
}

function asArray(value: unknown): unknown {
  if (value === undefined || value === null) return value
  return Array.isArray(value) ? value : [value]
}

function loosenChange(change: unknown): unknown {
  if (!isJsonObject(change)) return change
  const out: JsonObject = { ...change }
  for (const field of NUMBER_FIELDS) {
    const value = out[field]
    if (
      typeof value === 'string' &&
      value.trim() &&
      !Number.isNaN(Number(value))
    )
      out[field] = Number(value)
  }
  if (out.edits !== undefined) out.edits = asArray(out.edits) as JsonValue
  if (typeof out.op === 'string') out.op = out.op.trim().toLowerCase()
  if (typeof out.mode === 'string') out.mode = out.mode.trim().toLowerCase()
  return out
}

export type ParsedInput<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

/** 解析失败时那一句：哪一格、怎么了，只说前三处。 */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(input)'}: ${issue.message}`)
    .join('; ')
}

export function parseToolInput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  name: string,
): ParsedInput<T> {
  let input = loosen(raw)
  if (name === ASSISTANT_NEXT_TOOL_IDS.edit && isJsonObject(input)) {
    const changes = asArray(input.changes ?? input.change)
    input = {
      changes: Array.isArray(changes) ? changes.map(loosenChange) : changes,
    } as JsonValue
  }
  if (input === undefined || input === null) input = {}
  const parsed = schema.safeParse(input)
  if (parsed.success) return { ok: true, value: parsed.data }
  return {
    ok: false,
    error: `The ${name} call could not be read — ${describeIssues(parsed.error)}. Fix only that part and call ${name} again.`,
  }
}

const DESCRIPTIONS = {
  look: 'Read the bench as it is right now (prompt, negative, model, specs, options, references, LoRAs, latest results), and optionally put pictures in front of you for your next response.',
  edit: 'Change the bench. All changes for one request go in ONE call, applied in order; each lands on the bench at once. For the prompt prefer mode "edit" with exact {find, replace} pairs so everything else stays as it is.',
  ask: 'Ask the creator when you cannot go on without their choice. Puts a card with options in front of them and ends this turn until they answer.',
  generate:
    'Put a generation confirm card in front of the creator for what is on the bench now. Nothing is spent until they press it. Ends this turn.',
} as const

/** 交给 `streamText` 的那一份：只有描述与 JSON schema，⛔ 没有 execute（循环自己执行）。 */
export function assistantNextTools(strict: boolean) {
  const define = (name: keyof typeof DESCRIPTIONS, schema: z.ZodType) =>
    tool({
      description: DESCRIPTIONS[name],
      inputSchema: jsonSchema(toModelJsonSchema(schema)),
      strict,
    })
  return {
    [ASSISTANT_NEXT_TOOL_IDS.look]: define('look', LookInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.edit]: define('edit', EditInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.ask]: define('ask', AskInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.generate]: define('generate', GenerateInputSchema),
  }
}

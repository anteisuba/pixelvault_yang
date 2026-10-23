import { jsonSchema, tool } from 'ai'
import { z } from 'zod'

import {
  ASSISTANT_SETTINGS_WRITE_KEYS,
  GENERATION_REVIEW_STATES,
} from '@/constants/assistant-operator'
import { NOVELAI_SCENE_TEXT_KINDS } from '@/constants/novelai'
import {
  ASSISTANT_V3_CARDS_PROFILE_PARTS,
  ASSISTANT_V3_VIDEO_REFERENCE_SLOTS,
} from '@/constants/assistant-v3'
import {
  ASSISTANT_NEXT_EDIT_OPS,
  ASSISTANT_NEXT_FIND_KINDS,
  ASSISTANT_NEXT_RECIPE_PARTS,
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
 *  · 给模型看的 JSON schema：OpenAI 官方开 strict 时照严格模式写（每个字段必填、可空的写成 `X | null`），
 *    别家照自然形状（只有真必需的必填）；
 *  · 交给 SDK 的是 `jsonSchema()`、⛔ 不带校验 —— 少写字段的调用不会被 SDK 判成 invalid；
 *  · 真正的解析在这里自己做：可空的缺了当 null，单个对象当成一条的数组、数字写成字符串也认。
 * 真做不了的（缺了必需的那一格）才回错，并说清是哪一格。
 */

const ValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const LookInputSchema = z.object({
  names: z
    .array(z.string().trim().min(1))
    .max(ASSISTANT_NEXT_LIMITS.maxLookPictures)
    .nullish()
    .describe(
      'What to open, by number or name: a picture number ("图_1624"), a bench name ("ref-1", "result-1", "sample", or a picture attached to the message), "角色·<name>" (optionally "角色·<name>/<look>"), "LoRA·<name>", "提示词·<name>", "对话·<id>", or "设置". Pictures are put in front of you with their full recipe. null = only read the bench.',
    ),
  question: z
    .string()
    .nullish()
    .describe('What you want to find out by looking. Optional.'),
})
export type LookInput = z.infer<typeof LookInputSchema>

export const FindInputSchema = z.object({
  query: z
    .string()
    .nullish()
    .describe(
      'Words to look for (in prompts, names, tags, past messages), or a picture number like "图_1624". Empty = the most recent ones.',
    ),
  kinds: z
    .array(z.enum(ASSISTANT_NEXT_FIND_KINDS))
    .nullish()
    .describe(
      "Which kinds to search: pictures (the creator's generations), characters (with their looks), loras (their LoRA library), prompts (their saved prompts), conversations (earlier conversations on every bench), memories (what you remember about the creator). null = all of them.",
    ),
})
export type FindInput = z.infer<typeof FindInputSchema>

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
    .describe(
      'prompt / negative with mode "replace" or "append". remember: the one line to keep (new, or the new wording of memory).',
    ),
  memory: z
    .string()
    .nullish()
    .describe(
      'remember: the memory to change or forget, by its number ("记忆·3f9a1c2b"); null = remember a new one.',
    ),
  edits: z
    .array(FindReplaceSchema)
    .max(ASSISTANT_NEXT_LIMITS.maxFindReplace)
    .nullish()
    .describe('prompt / negative with mode "edit".'),
  model: z.string().nullish().describe('model: a model id or label.'),
  channel: z
    .string()
    .nullish()
    .describe(
      'model: a channel id or label. model_channel: the channel, by its name.',
    ),
  duration: z.number().nullish().describe('specs (video): seconds.'),
  aspectRatio: z.string().nullish().describe('specs'),
  resolution: z.string().nullish().describe('specs'),
  quality: z.string().nullish().describe('specs'),
  background: z.string().nullish().describe('specs'),
  count: z.number().nullish().describe('count: pictures per run.'),
  key: z
    .string()
    .nullish()
    .describe(
      `option: the option key; lora_param: the parameter; assistant_setting: one of ${ASSISTANT_SETTINGS_WRITE_KEYS.join(', ')}.`,
    ),
  value: ValueSchema.nullish().describe(
    'option / lora_param / assistant_setting: the new value. favorite_pictures / favorite_lora: true to favourite, false to take it out. model_channel: true on, false off (null = leave). search_source: false takes the site off its list. remember: false forgets memory.',
  ),
  picture: z
    .string()
    .nullish()
    .describe(
      'add_reference / apply_recipe / verdict / lora_cover: a picture number ("图_1624") or name (attached picture, "result-N"); remove_reference: "ref-N" (video: also "first" / "last").',
    ),
  slot: z
    .enum(ASSISTANT_V3_VIDEO_REFERENCE_SLOTS)
    .nullish()
    .describe(
      'add_reference (video): "first" / "last" frame, or "reference" (default).',
    ),
  parts: z
    .array(z.enum(ASSISTANT_NEXT_RECIPE_PARTS))
    .nullish()
    .describe(
      "apply_recipe: which parts of that picture's recipe to put on the bench. null = every part this bench has.",
    ),
  audio: z
    .string()
    .nullish()
    .describe(
      'add_audio (video): a voice clip attached to the message, by name.',
    ),
  owner: z
    .string()
    .nullish()
    .describe('add_audio: the character this voice belongs to.'),
  enabled: z
    .boolean()
    .nullish()
    .describe("sound (video): the clip's own soundtrack on or off."),
  url: z
    .string()
    .nullish()
    .describe(
      'import_url: the link the creator gave you. search_source: the site (a domain like pinterest.com).',
    ),
  list: z
    .enum(['allow', 'block'])
    .nullish()
    .describe(
      'search_source: "block" never searches that site, "allow" searches only allowed sites.',
    ),
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
      'lora_weight / remove_lora: the mounted LoRA, by handle or name. add_lora / lora_to_character / favorite_lora / lora_cover: a LoRA by name ("LoRA·<name>" or its title).',
    ),
  weight: z
    .number()
    .nullish()
    .describe('lora_weight / add_lora (null = its recommended weight).'),
  character: z
    .string()
    .nullish()
    .describe(
      'propose_profile / propose_images / hand_off: the character, by its handle on the page ("char-b27ce8") or "角色·<name>". character_profile / lora_to_character / new_character_look: "角色·<name>" (lora_to_character may add "/<look>"). character_look: "角色·<name>/<look>" (no look = the default one). remember: the character this memory belongs to; null = about the creator (used everywhere).',
    ),
  say: z
    .string()
    .nullish()
    .describe(
      'propose_* / hand_off: one or two sentences shown right above the card. The turn ends on the card.',
    ),
  fields: z
    .array(
      z.object({
        field: z.enum(ASSISTANT_V3_CARDS_PROFILE_PARTS),
        text: z.string(),
        source: z
          .string()
          .nullish()
          .describe('Where it comes from, in a few words.'),
        sourceUrl: z.string().nullish(),
        added: z
          .array(z.string())
          .nullish()
          .describe('Phrases you added to what the creator sketched.'),
      }),
    )
    .nullish()
    .describe(
      'propose_profile: the profile parts you drafted. character_profile / new_character: the parts to write ("look" is the appearance of the default look).',
    ),
  images: z
    .array(
      z.object({
        picture: z.string().nullish().describe('A picture number ("图_1624").'),
        find: z
          .string()
          .nullish()
          .describe('A web picture find by its number ("#3").'),
        reason: z.string().nullish().describe('Which view it gives.'),
      }),
    )
    .nullish()
    .describe('propose_images: pictures to attach to the character.'),
  request: z
    .string()
    .nullish()
    .describe('hand_off: the one message the image assistant should get.'),
  pictures: z
    .array(z.string())
    .nullish()
    .describe(
      'tag_pictures / favorite_pictures / put_in_folder: the creator\'s pictures by number ("图_1624"), up to 20. character_look / new_character_look: pictures to add to that look.',
    ),
  tags: z
    .array(z.string())
    .nullish()
    .describe(
      "tag_pictures: short tags in the creator's words (up to 5). character_profile / new_character: the character's tags. character_look / new_character_look: the look's tags (the full new list).",
    ),
  name: z
    .string()
    .nullish()
    .describe(
      'new_folder / new_character / save_prompt: the name. character_profile / update_prompt / model_channel: a new name, or null to keep it.',
    ),
  folder: z
    .string()
    .nullish()
    .describe(
      'put_in_folder: the folder, by name. new_folder: the folder to put it inside, or null for the top level.',
    ),
  state: z
    .enum(GENERATION_REVIEW_STATES)
    .nullish()
    .describe(
      'verdict: "approved" (they settled on it) or "blocked" (it did not work; it will not be offered again).',
    ),
  reason: z
    .string()
    .nullish()
    .describe('verdict: why, in a few of their words.'),
  label: z
    .string()
    .nullish()
    .describe(
      "new_character_look: the look's name. character_look: a new name, or null to keep it.",
    ),
  saved: z
    .string()
    .nullish()
    .describe('update_prompt: the saved prompt ("提示词·<name>").'),
  negativeText: z
    .string()
    .nullish()
    .describe(
      'save_prompt / update_prompt: the negative prompt (save_prompt: null = the one on the bench).',
    ),
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

/**
 * 严格模式（OpenAI 官方开 strict）才写成「每格必填、可空写 null」；别家照自然形状给：只有
 * 真必需的那几格必填。⚠ 评测里 Claude 面对二十格必填的 edit，把 prompt 的 text 也填成了 null。
 */
export function toModelJsonSchema(
  schema: z.ZodType,
  strict = true,
): JsonObject {
  const raw = z.toJSONSchema(schema, { io: 'input' }) as JsonObject
  if (strict) return strictify(raw) as JsonObject
  delete raw.$schema
  return raw
}

const NUMBER_FIELDS = ['count', 'weight', 'duration'] as const

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
  for (const field of [
    'edits',
    'parts',
    'fields',
    'images',
    'pictures',
    'tags',
  ] as const)
    if (out[field] !== undefined) out[field] = asArray(out[field]) as JsonValue
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
  // look 的旧叫法 `pictures`（第 2 步）照认。
  if (
    name === ASSISTANT_NEXT_TOOL_IDS.look &&
    isJsonObject(input) &&
    input.names === undefined &&
    input.pictures !== undefined
  ) {
    const { pictures, ...rest } = input
    input = { ...rest, names: pictures }
  }
  if (typeof input === 'string')
    return {
      ok: false,
      error: `The ${name} call's arguments were not a valid JSON object (usually an unescaped quote inside a text, or a call cut off). Send the same ${name} call again as one JSON object.`,
    }
  const parsed = schema.safeParse(input)
  if (parsed.success) return { ok: true, value: parsed.data }
  return {
    ok: false,
    error: `The ${name} call could not be read — ${describeIssues(parsed.error)}. Fix only that part and call ${name} again.`,
  }
}

const DESCRIPTIONS = {
  find: "Search the creator's workspace: their pictures, characters and looks, LoRA library, saved prompts, earlier conversations on every bench, and what you remember about them. Returns numbered lines; open any of them with look.",
  look: 'Read the bench as it is right now, and optionally open things by number or name: pictures (with their full recipe), characters, LoRAs, saved prompts, earlier conversations, settings. Pictures you open stay in front of you.',
  edit: 'Change the bench, the creator\'s library (pictures, folders, characters and looks, LoRAs, saved prompts), their settings (model channels, assistant settings, search source lists), or what you remember (remember). All changes for one request go in ONE call, applied in order; each lands at once and can be undone. For the prompt prefer mode "edit" with exact {find, replace} pairs so everything else stays as it is.',
  ask: 'Ask the creator when you cannot go on without their choice. Puts a card with options in front of them and ends this turn until they answer.',
  generate:
    'Generate one batch of what is on the bench now: starts at once when LET AI GENERATE is on, otherwise a confirm card the creator presses. Ends this turn.',
} as const

/** 交给 `streamText` 的那一份：只有描述与 JSON schema，⛔ 没有 execute（循环自己执行）。 */
export function assistantNextTools(strict: boolean) {
  const define = (name: keyof typeof DESCRIPTIONS, schema: z.ZodType) =>
    tool({
      description: DESCRIPTIONS[name],
      inputSchema: jsonSchema(toModelJsonSchema(schema, strict)),
      strict,
    })
  return {
    [ASSISTANT_NEXT_TOOL_IDS.find]: define('find', FindInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.look]: define('look', LookInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.edit]: define('edit', EditInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.ask]: define('ask', AskInputSchema),
    [ASSISTANT_NEXT_TOOL_IDS.generate]: define('generate', GenerateInputSchema),
  }
}

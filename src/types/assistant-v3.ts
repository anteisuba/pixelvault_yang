import { z } from 'zod'

import { ASSISTANT_OPERATOR_SEARCH_KINDS } from '@/constants/assistant-operator'
import {
  ASSISTANT_V3_CARD_TYPES,
  ASSISTANT_V3_CARDS_EDIT_OP_IDS,
  ASSISTANT_V3_CARDS_PROFILE_PARTS,
  ASSISTANT_V3_EDIT_OP_IDS,
  ASSISTANT_V3_IMAGE_EDIT_OP_IDS,
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_LORA_EDIT_OP_IDS,
  ASSISTANT_V3_LORA_SEARCH_KIND,
  ASSISTANT_V3_LORA_WRITE_FIELDS,
  ASSISTANT_V3_TOOLS,
  ASSISTANT_V3_TRANSCRIPT_ENTRY_IDS,
  ASSISTANT_V3_VIDEO_REFERENCE_SLOTS,
  ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND,
  ASSISTANT_V3_WRITE_FIELDS,
  ASSISTANT_V3_WRITE_MODES,
} from '@/constants/assistant-v3'
import { NODE_SCRIPT_PROJECTION_MODES } from '@/constants/node-script'
import { NOVELAI_SCENE_TEXT_KINDS } from '@/constants/novelai'
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
 * ①b LoRA 台那张脸的入参（S6）。工具名与画布同一套，动的是一张表单。
 * ⚠ 规矩同 ①：只写形状，可选字段一律 `nullable`。
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * 停在卡上那一轮给创作者的那一两句（2026-10-10 五家实测：Luna / Gemini / DeepSeek
 * 出卡时一个字都不说）。写进入参就是必填 —— 提示词里要求它说，它不说。
 */
const CardSaySchema = z
  .string()
  .describe(
    'One or two sentences shown to the creator right above the card, in their language: what you propose and why. The turn ends on the card, so this is all they read.',
  )

const LoraHandleSchema = z
  .string()
  .describe('A LoRA handle from the board, e.g. "lora-cmg1ab".')

export const AssistantV3LoraEditOpInputSchema = z.union([
  z.object({
    op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.setModel),
    model: z.string().describe('A base model id or name from the board.'),
  }),
  z
    .object({
      op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.setParams),
      steps: z.number().int().nullable(),
      cfg: z.number().nullable(),
      seed: z
        .string()
        .nullable()
        .describe('Digits only. null leaves the seed as it is.'),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
      sampler: z
        .string()
        .nullable()
        .describe(
          'Either a sampler from the board or a Civitai name like "Euler a".',
        ),
      scheduler: z.string().nullable(),
    })
    .describe('Set sampling parameters. null leaves a field as it is.'),
  z.object({
    op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.setWeight),
    lora: LoraHandleSchema,
    weight: z.number(),
  }),
  z.object({
    op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.unmount),
    lora: LoraHandleSchema,
  }),
  z.object({
    op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.unmountReference),
    ref: z.string().describe('A reference from the board, e.g. "ref-2".'),
  }),
  z
    .object({
      op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.proposeSetup),
      question: z.string(),
      say: CardSaySchema,
      mounts: z.array(
        z.object({
          candidate: z
            .string()
            .describe('A candidateId from a LoRA search this turn.'),
          weight: z.number().nullable(),
        }),
      ),
      unmounts: z.array(LoraHandleSchema),
      weights: z.array(
        z.object({ lora: LoraHandleSchema, weight: z.number() }),
      ),
    })
    .describe(
      'Put a setup card in front of the creator: LoRAs to mount (from a search this turn), to unmount and weights to change. Nothing changes until they press apply. Mounting a new LoRA only ever happens this way.',
    ),
  z
    .object({
      op: one(ASSISTANT_V3_LORA_EDIT_OP_IDS.showPicks),
      candidates: z.array(z.string()),
    })
    .describe(
      'Ring LoRAs found this turn in the library page so the creator can look and mount them there.',
    ),
])

export type AssistantV3LoraEditOpInput = z.infer<
  typeof AssistantV3LoraEditOpInputSchema
>

export const AssistantV3LoraEditInputSchema = z.object({
  ops: z.array(AssistantV3LoraEditOpInputSchema),
})

export const AssistantV3LoraWriteEntrySchema = z.object({
  field: z.enum(ASSISTANT_V3_LORA_WRITE_FIELDS),
  mode: z.enum(ASSISTANT_V3_WRITE_MODES),
  text: z.string().nullable(),
  edits: z
    .array(z.object({ find: z.string(), replace: z.string() }))
    .nullable(),
})

export const AssistantV3LoraWriteInputSchema = z.object({
  writes: z.array(AssistantV3LoraWriteEntrySchema),
})

export type AssistantV3LoraWriteEntry = z.infer<
  typeof AssistantV3LoraWriteEntrySchema
>

const LoraItemSchema = z
  .string()
  .describe(
    '"prompt", "negative", "sample" (the example open on the left), a LoRA handle, or a reference like "ref-1".',
  )

export const AssistantV3LoraReadInputSchema = z.object({
  items: z.array(LoraItemSchema),
})

export const AssistantV3LoraLookInputSchema = z.object({
  images: z
    .array(z.string())
    .describe(
      'Pictures to look at: the name of a picture attached to the message, "sample", or a reference like "ref-1".',
    ),
  question: z.string(),
})

export const AssistantV3LoraGenerateInputSchema = z.object({
  label: z.string().nullable(),
  say: CardSaySchema,
})

export const AssistantV3LoraSearchLibraryInputSchema = z.object({
  query: z.string(),
  kind: z.enum([
    ASSISTANT_V3_LORA_SEARCH_KIND,
    ...ASSISTANT_OPERATOR_SEARCH_KINDS,
  ]),
})

/* ─────────────────────────────────────────────────────────────────────────
 * ①c 图片台那张脸的入参（S6 第二张脸）。write / generate / ask 与 LoRA 台同一份。
 * ───────────────────────────────────────────────────────────────────────── */

const ReferenceNameSchema = z
  .string()
  .describe('A reference from the board, e.g. "ref-2".')

export const AssistantV3ImageEditOpInputSchema = z.union([
  z.object({
    op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setModel),
    model: z.string().describe('A model id or name from the board.'),
    channel: z
      .string()
      .nullable()
      .describe(
        'Only for a model the board lists with channels: the channel id the creator named. null otherwise.',
      ),
  }),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs),
      aspectRatio: z.string().nullable(),
      resolution: z.string().nullable(),
      quality: z.string().nullable(),
      background: z.string().nullable(),
    })
    .describe(
      "Aspect ratio, resolution, quality, background — values from the board's options. null keeps a field as it is.",
    ),
  z.object({
    op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setCount),
    count: z.number().int(),
  }),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setOption),
      key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })
    .describe('One of the model options the board lists, by its key.'),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountReference),
      asset: z
        .string()
        .describe(
          'The name of a picture attached to the message, or an asset id from a search_library result this turn.',
        ),
    })
    .describe('Mount a picture as the next reference (ref-N = @ImageN).'),
  z.object({
    op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.unmountReference),
    ref: ReferenceNameSchema,
  }),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.importUrl),
      url: z.string(),
    })
    .describe(
      'File a link the creator gave you (an image address or a web page) into their library and mount it.',
    ),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setPeople),
      positioning: z.enum(['auto', 'manual']),
      people: z.array(
        z.object({
          prompt: z
            .string()
            .describe(
              'This one person in English Danbooru tags: identity, look, clothes, pose, expression.',
            ),
          negative: z.string().nullable(),
          x: z.number().nullable(),
          y: z.number().nullable(),
          interactions: z
            .array(
              z.object({
                tag: z.string(),
                target: z
                  .number()
                  .int()
                  .describe(
                    'The other person, by number in this list (1-based).',
                  ),
                mutual: z.boolean(),
              }),
            )
            .nullable(),
          dialogue: z
            .string()
            .nullable()
            .describe(
              'The line this person says, in the language it should appear in.',
            ),
        }),
      ),
    })
    .describe(
      'Tag workbench only: the full list of people, each with their own prompt. The base prompt keeps the scene, style and head count (2girls …). null keeps that part of a slot as it is; an empty list removes the layout.',
    ),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSceneTexts),
      items: z.array(
        z.object({ kind: z.enum(NOVELAI_SCENE_TEXT_KINDS), text: z.string() }),
      ),
    })
    .describe(
      'Tag workbench only: the full list of text drawn in the picture that nobody says (a sign, a title, cover text), exactly as it should appear. An empty list removes them.',
    ),
])

export type AssistantV3ImageEditOpInput = z.infer<
  typeof AssistantV3ImageEditOpInputSchema
>

export const AssistantV3ImageEditInputSchema = z.object({
  ops: z.array(AssistantV3ImageEditOpInputSchema),
})

/**
 * 视频台的 edit（S6 最后一张脸）：与图片台同名的几种改法，规格多一格时长、参考图分
 * 首帧 / 尾帧 / 普通参考，另加参考声音与原声开关。
 */
export const AssistantV3VideoEditOpInputSchema = z.union([
  z.object({
    op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setModel),
    model: z.string().describe('A model id or name from the board.'),
    channel: z.string().nullable(),
  }),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSpecs),
      duration: z.number().int().nullable().describe('Seconds.'),
      aspectRatio: z.string().nullable(),
      resolution: z.string().nullable(),
    })
    .describe(
      "Clip length, aspect ratio, resolution — values from the board's options. null keeps a field as it is.",
    ),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setOption),
      key: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    })
    .describe('One of the model options the board lists, by its key.'),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountReference),
      asset: z
        .string()
        .describe(
          'The name of a picture attached to the message, or an asset id from a search_library result this turn.',
        ),
      slot: z
        .enum(ASSISTANT_V3_VIDEO_REFERENCE_SLOTS)
        .nullable()
        .describe(
          '"first" / "last" frame on the keyframe mode; "reference" (or null) for a reference picture.',
        ),
    })
    .describe('Mount a picture as a frame or a reference.'),
  z.object({
    op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.unmountReference),
    ref: z
      .string()
      .describe('A reference from the board ("ref-2"), or "first" / "last".'),
  }),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.mountAudio),
      asset: z
        .string()
        .describe(
          'An audio asset id from a search_library kind "audio" this turn.',
        ),
      owner: z
        .string()
        .nullable()
        .describe('The character this voice belongs to.'),
    })
    .describe("Mount a voice clip from the creator's own audio library."),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.setSound),
      enabled: z.boolean(),
    })
    .describe(
      "Turn the clip's own soundtrack on or off. Only when the creator asked for sound or for silence.",
    ),
  z
    .object({
      op: one(ASSISTANT_V3_IMAGE_EDIT_OP_IDS.importUrl),
      url: z.string(),
    })
    .describe(
      'File a link the creator gave you into their library and mount it.',
    ),
])

export type AssistantV3VideoEditOpInput = z.infer<
  typeof AssistantV3VideoEditOpInputSchema
>

export const AssistantV3VideoEditInputSchema = z.object({
  ops: z.array(AssistantV3VideoEditOpInputSchema),
})

export const AssistantV3ImageReadInputSchema = z.object({
  items: z
    .array(z.string())
    .describe('"prompt", "negative", or a reference like "ref-1".'),
})

export const AssistantV3ImageLookInputSchema = z.object({
  images: z
    .array(z.string())
    .describe(
      'Pictures to look at: the name of a picture attached to the message, or a reference like "ref-1".',
    ),
  question: z.string(),
})

export const AssistantV3ImageSearchLibraryInputSchema = z.object({
  query: z.string(),
  kind: z.enum([
    ASSISTANT_V3_WEB_IMAGES_SEARCH_KIND,
    ...ASSISTANT_OPERATOR_SEARCH_KINDS,
  ]),
  subject: z
    .string()
    .nullable()
    .describe(
      'web_images only: the work and character name, so the search also runs in their own languages. null otherwise.',
    ),
})

/* ─────────────────────────────────────────────────────────────────────────
 * ①d 卡片台那张脸的入参（S6 第三张脸）。三种提议都出卡、停下等创作者勾选。
 * ───────────────────────────────────────────────────────────────────────── */

const CharacterHandleSchema = z
  .string()
  .describe('A character handle from the board, e.g. "char-b27ce8".')

export const AssistantV3CardsEditOpInputSchema = z.union([
  z
    .object({
      op: one(ASSISTANT_V3_CARDS_EDIT_OP_IDS.proposeProfile),
      character: CharacterHandleSchema,
      say: CardSaySchema,
      fields: z.array(
        z.object({
          field: z.enum(ASSISTANT_V3_CARDS_PROFILE_PARTS),
          text: z.string(),
          source: z
            .string()
            .describe(
              'Where it comes from, in a few words: the page you read, or "你写的 + 我补的".',
            ),
          sourceUrl: z.string().nullable(),
          added: z
            .array(z.string())
            .nullable()
            .describe(
              'For a history the creator sketched: the phrases you added, copied exactly from text.',
            ),
        }),
      ),
    })
    .describe(
      'Offer profile fields for the creator to tick: one per part you actually drafted, each with its source.',
    ),
  z
    .object({
      op: one(ASSISTANT_V3_CARDS_EDIT_OP_IDS.proposeImages),
      character: CharacterHandleSchema,
      say: CardSaySchema,
      images: z.array(
        z.object({
          asset: z
            .string()
            .nullable()
            .describe('An asset id from a library search this turn.'),
          imageUrl: z
            .string()
            .nullable()
            .describe('An image URL from a web_images search this turn.'),
          reason: z
            .string()
            .describe('Which view it gives: face, full body, back …'),
        }),
      ),
    })
    .describe(
      'Offer pictures found this turn for the creator to tick and attach to the character.',
    ),
  z
    .object({
      op: one(ASSISTANT_V3_CARDS_EDIT_OP_IDS.handOff),
      character: CharacterHandleSchema,
      say: CardSaySchema,
      request: z
        .string()
        .describe('The one message the image assistant should get.'),
    })
    .describe(
      'When neither the library nor the web has the picture the character needs: offer to hand it to the image assistant.',
    ),
])

export type AssistantV3CardsEditOpInput = z.infer<
  typeof AssistantV3CardsEditOpInputSchema
>

export const AssistantV3CardsEditInputSchema = z.object({
  ops: z.array(AssistantV3CardsEditOpInputSchema),
})

export const AssistantV3CardsReadInputSchema = z.object({
  items: z
    .array(z.string())
    .describe(
      'A profile part of the open character ("look", "identity", "behavior", "speech", "backstory", "tags"), or a web page URL to read in full.',
    ),
})

export const AssistantV3CardsLookInputSchema = z.object({
  images: z
    .array(z.string())
    .describe(
      '"card" checks the open character\'s pictures against their profile; or the name of a picture attached to the message.',
    ),
  question: z.string(),
})

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
  /** Gemini 3 的思考签名：回放时原样交回（见 `ASSISTANT_V3_LIMITS.maxSignatureChars`）。 */
  signature: z.string().max(ASSISTANT_V3_LIMITS.maxSignatureChars).optional(),
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

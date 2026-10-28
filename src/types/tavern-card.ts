import { z } from 'zod'

import { TAVERN_CARD } from '@/constants/cards/tavern-card'

/**
 * 酒馆卡上的字段（V1 平铺 / V2、V3 的 `data`）。别人做的卡缺格、类型不对是常态 ——
 * 每格 `.catch` 成空值，⛔ 不因一格坏了整卡拒收；只有名字是必须的（导入那一步判）。
 */
export const TavernCardFieldsSchema = z.object({
  name: z.string().catch(''),
  description: z.string().catch(''),
  personality: z.string().catch(''),
  scenario: z.string().catch(''),
  first_mes: z.string().catch(''),
  mes_example: z.string().catch(''),
  creator_notes: z.string().catch(''),
  system_prompt: z.string().catch(''),
  post_history_instructions: z.string().catch(''),
  alternate_greetings: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
  creator: z.string().catch(''),
  character_version: z.string().catch(''),
  /** 世界书（V2 起）：原样存，等我们自己的世界书做好再转。 */
  character_book: z.unknown().optional(),
})

export type TavernCardFields = z.infer<typeof TavernCardFieldsSchema>

/**
 * 角色卡上 `extensions['st.card']` 里原样存的那一份（导入时我们没有对应格子的几样）。
 * 角色详情读它显示、改了按整键写回；认不出的键（世界书、来源……）原样带着走。
 */
export const TavernCardKeptSchema = z.looseObject({
  spec: z.string().optional().catch(undefined),
  creator: z.string().optional().catch(undefined),
  characterVersion: z.string().optional().catch(undefined),
  systemPrompt: z.string().optional().catch(undefined),
  postHistoryInstructions: z.string().optional().catch(undefined),
  alternateGreetings: z.array(z.string()).optional().catch(undefined),
  characterBook: z.unknown().optional(),
  /** 经历一格装不下时的酒馆 description 全文（旧卡上限 6000 时导入的也在这）。 */
  description: z.string().optional().catch(undefined),
})

export type TavernCardKept = z.infer<typeof TavernCardKeptSchema>

/**
 * 世界书的一条（V2 `character_book.entries[]`；SillyTavern 导出的世界书里是 `key` + `disable`，
 * 一起认）。读不懂的格子当没写，⛔ 不让一条坏的连累整本。
 */
export const TavernWorldEntrySchema = z.looseObject({
  keys: z.array(z.string()).optional().catch(undefined),
  key: z.array(z.string()).optional().catch(undefined),
  content: z.string().catch(''),
  enabled: z.boolean().optional().catch(undefined),
  disable: z.boolean().optional().catch(undefined),
  constant: z.boolean().optional().catch(undefined),
  insertion_order: z.number().optional().catch(undefined),
  order: z.number().optional().catch(undefined),
})

/** 整本世界书：`entries` 是数组（卡规范）或以 id 为键的对象（SillyTavern 导出）。 */
export const TavernWorldBookSchema = z.looseObject({
  entries: z
    .union([z.array(z.unknown()), z.record(z.string(), z.unknown())])
    .catch([]),
})

/** V2 / V3 的外壳：`spec` 认得才拆 `data`，否则按 V1 平铺读。 */
export const TavernCardEnvelopeSchema = z.object({
  spec: z.enum([TAVERN_CARD.SPEC_V2, TAVERN_CARD.SPEC_V3]),
  data: z.record(z.string(), z.unknown()),
})

/**
 * 文件导入第一步 POST `/api/character-cards/import/uploads`：要一个直传 R2 的地址。
 * 只报名字、类型和大小，文件本身 ⛔ 经过 Vercel。
 */
export const PrepareTavernCardUploadSchema = z.object({
  fileName: z.string().trim().max(TAVERN_CARD.FILE_NAME_MAX_LENGTH),
  mimeType: z.enum(TAVERN_CARD.UPLOAD_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(TAVERN_CARD.UPLOAD_MAX_BYTES),
})

export type PrepareTavernCardUploadRequest = z.infer<
  typeof PrepareTavernCardUploadSchema
>

/** 第一步的回答：浏览器拿它把文件 PUT 到 R2。 */
export interface TavernCardUploadTarget {
  uploadUrl: string
  storageKey: string
  headers: Record<string, string>
}

/**
 * 文件导入第二步 POST `/api/character-cards/import`：文件已经传到 R2 的哪儿。
 * 服务端认 `storageKey` 是不是这个人的，读回来拆卡，读完删掉。
 */
export const ImportTavernCardSchema = z.object({
  fileName: z.string().trim().max(TAVERN_CARD.FILE_NAME_MAX_LENGTH),
  storageKey: z.string().trim().min(1).max(300),
})

export type ImportTavernCardRequest = z.infer<typeof ImportTavernCardSchema>

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

/** V2 / V3 的外壳：`spec` 认得才拆 `data`，否则按 V1 平铺读。 */
export const TavernCardEnvelopeSchema = z.object({
  spec: z.enum([TAVERN_CARD.SPEC_V2, TAVERN_CARD.SPEC_V3]),
  data: z.record(z.string(), z.unknown()),
})

/**
 * POST `/api/character-cards/import` 的载荷：一个文件，PNG 卡或 JSON 卡，base64
 * 数据地址（与角色卡上传图同一种形状）。
 */
export const ImportTavernCardSchema = z.object({
  fileName: z.string().trim().max(TAVERN_CARD.FILE_NAME_MAX_LENGTH),
  data: z
    .string()
    .regex(
      /^data:(image\/png|application\/json);base64,[A-Za-z0-9+/=]+$/,
      'Expected a PNG or JSON character card',
    )
    // base64 膨胀 4/3，再给前缀留点余量。
    .max(Math.ceil((TAVERN_CARD.MAX_FILE_BYTES * 4) / 3) + 64),
})

export type ImportTavernCardRequest = z.infer<typeof ImportTavernCardSchema>

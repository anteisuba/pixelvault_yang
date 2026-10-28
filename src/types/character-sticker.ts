import { z } from 'zod'

import { CHARACTER_STICKERS } from '@/constants/character-browse'

/** 她的一张表情包（4d）：角色页那一格、聊天里发的都是它。 */
export const CharacterStickerRecordSchema = z.object({
  id: z.string(),
  url: z.string(),
  sourceUrl: z.string().nullable(),
  whenToUse: z.string(),
  isBlocked: z.boolean(),
  /** 你喂给她的（上传）还是她逛来的。 */
  fromCreator: z.boolean(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
})

export type CharacterStickerRecord = z.infer<
  typeof CharacterStickerRecordSchema
>

/** 拉黑 / 取消拉黑（拉黑了她不再发）。 */
export const UpdateCharacterStickerSchema = z.object({
  isBlocked: z.boolean(),
})

export type UpdateCharacterStickerRequest = z.infer<
  typeof UpdateCharacterStickerSchema
>

/** 上传时那一句「什么时候发」（可空，空就写一句默认的）。 */
export const CharacterStickerWhenSchema = z
  .string()
  .trim()
  .max(CHARACTER_STICKERS.whenChars)

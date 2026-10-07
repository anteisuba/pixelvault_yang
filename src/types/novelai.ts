import { z } from 'zod'

import {
  NOVELAI_INTERACTION_TAG_MAX_CHARS,
  NOVELAI_MAX_INTERACTIONS_PER_CHARACTER,
  NOVELAI_MAX_SCENE_TEXTS,
  NOVELAI_SCENE_TEXT_KINDS,
  NOVELAI_TEXT_MAX_CHARS,
  NOVELAI_V5_MAX_CHARACTERS,
} from '../constants/novelai'

/**
 * 一条互动：这位角色对 `target`（同一名单里的下标）做 `tag` 这个动作。
 * `mutual` = 两边都在做。发送时拼成 `source#` / `target#` / `mutual#`
 * （`src/lib/novelai-compose.ts`）。
 */
export const NovelAiInteractionSchema = z
  .object({
    tag: z.string().trim().min(1).max(NOVELAI_INTERACTION_TAG_MAX_CHARS),
    target: z
      .number()
      .int()
      .min(0)
      .max(NOVELAI_V5_MAX_CHARACTERS - 1),
    mutual: z.boolean().optional(),
  })
  .strict()

export type NovelAiInteraction = z.infer<typeof NovelAiInteractionSchema>

const characterShape = {
  enabled: z.boolean().optional(),
  prompt: z.string().trim().min(1),
  negativePrompt: z.string(),
  position: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  interactions: z
    .array(NovelAiInteractionSchema)
    .max(NOVELAI_MAX_INTERACTIONS_PER_CHARACTER)
    .optional(),
  /** 这个人说的一句话（台词）。发送时按站位称呼写进整体，再进 `Text:`。 */
  dialogue: z.string().max(NOVELAI_TEXT_MAX_CHARS).optional(),
}

/** 互动只能指向同一名单里的**另一个人**。 */
function checkInteractionTargets(
  layout: { characters: { interactions?: NovelAiInteraction[] }[] },
  ctx: z.core.$RefinementCtx,
) {
  layout.characters.forEach((character, index) => {
    character.interactions?.forEach((interaction, slot) => {
      if (
        interaction.target === index ||
        interaction.target >= layout.characters.length
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['characters', index, 'interactions', slot, 'target'],
          message: 'Interaction target must be another character',
        })
      }
    })
  })
}

export const NovelAiCharacterLayoutSchema = z
  .object({
    positioning: z.enum(['auto', 'manual']),
    characters: z
      .array(z.object(characterShape))
      .min(1)
      .max(NOVELAI_V5_MAX_CHARACTERS),
  })
  .strict()
  .superRefine(checkInteractionTargets)

export type NovelAiCharacterLayout = z.infer<
  typeof NovelAiCharacterLayoutSchema
>
export type NovelAiCharacter = NovelAiCharacterLayout['characters'][number]

/** 草稿：用户刚点「加人」时那一位的标签还是空的。 */
export const NovelAiCharacterDraftSchema = z
  .object({
    positioning: z.enum(['auto', 'manual']),
    characters: z
      .array(z.object({ ...characterShape, prompt: z.string() }))
      .min(1)
      .max(NOVELAI_V5_MAX_CHARACTERS),
  })
  .strict()
  .superRefine(checkInteractionTargets)

/**
 * 画面文字：不属于任何人的字（招牌 / 标题 / 封面 / 其他）。发送时翻成一句
 * 自然语言写进整体，内容并入 `Text:`。
 */
export const NovelAiSceneTextSchema = z
  .object({
    kind: z.enum(NOVELAI_SCENE_TEXT_KINDS),
    text: z.string().trim().min(1).max(NOVELAI_TEXT_MAX_CHARS),
  })
  .strict()

export type NovelAiSceneText = z.infer<typeof NovelAiSceneTextSchema>

export const NovelAiSceneTextsSchema = z
  .array(NovelAiSceneTextSchema)
  .max(NOVELAI_MAX_SCENE_TEXTS)

/** 草稿：「＋加一条」刚加出来、还没写字的那一行是空串。 */
export const NovelAiSceneTextDraftsSchema = z
  .array(NovelAiSceneTextSchema.extend({ text: z.string() }))
  .max(NOVELAI_MAX_SCENE_TEXTS)

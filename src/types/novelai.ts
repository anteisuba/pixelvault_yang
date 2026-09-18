import { z } from 'zod'

import { NOVELAI_V5_MAX_CHARACTERS } from '../constants/novelai'

export const NovelAiCharacterLayoutSchema = z
  .object({
    positioning: z.enum(['auto', 'manual']),
    characters: z
      .array(
        z.object({
          prompt: z.string().trim().min(1),
          negativePrompt: z.string(),
          position: z.object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          }),
        }),
      )
      .min(1)
      .max(NOVELAI_V5_MAX_CHARACTERS),
  })
  .strict()

export type NovelAiCharacterLayout = z.infer<
  typeof NovelAiCharacterLayoutSchema
>

import { z } from 'zod'

import { isAspectRatio, type AspectRatio } from '@/constants/config'
import { VIDEO_NODE_MODES } from '@/constants/video-node-modes'
import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { AdvancedParamsSchema, LoraSchema, RecipeUsageSchema } from '@/types'

const url = z
  .string()
  .url()
  .max(ASSISTANT_OPERATOR_LIMITS.maxUserUrlChars)
  .refine((value) => /^https?:\/\//i.test(value))

export const StudioOperatorCheckpointSchema = z.object({
  version: z.literal(1),
  domain: z.enum(['image', 'video']),
  form: z.object({
    recipeUsage: RecipeUsageSchema.nullable(),
    prompt: z.string().max(ASSISTANT_OPERATOR_LIMITS.maxPromptChars),
    selectedOptionId: z.string().nullable(),
    extraModelOptionIds: z.array(z.string()),
    aspectRatio: z.custom<AspectRatio>(
      (value) => typeof value === 'string' && isAspectRatio(value),
    ),
    advancedParams: AdvancedParamsSchema.extend({
      loras: z.array(LoraSchema.extend({ url })).max(5).optional(),
      runnerLoras: z.never().optional(),
      runnerCheckpoint: z.never().optional(),
    }),
    imageBatchCount: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    stylePresetId: z.string(),
    videoMode: z.enum(VIDEO_NODE_MODES),
    videoDuration: z.number().positive(),
    videoResolution: z.string().nullable(),
    videoAudioRefs: z.array(
      z.object({
        id: z.string(),
        url,
        fileName: z.string(),
        ownerName: z.string().optional(),
      }),
    ),
    videoFrameSlots: z.object({
      first: url.nullable(),
      last: url.nullable(),
    }),
    videoReferenceVideos: z.array(url),
    videoGenerateAudio: z.boolean().nullable(),
    longVideoMode: z.boolean(),
    longVideoTargetDuration: z.number().positive(),
  }),
  referenceImages: z
    .array(url)
    .max(ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences),
})

export type StudioOperatorCheckpoint = z.infer<
  typeof StudioOperatorCheckpointSchema
>

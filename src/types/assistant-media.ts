import { z } from 'zod'

import { ASSISTANT_MEDIA_LIMITS } from '@/constants/assistant'

export const AssistantMediaReferenceSchema = z.object({
  id: z.string().trim().min(1).max(160),
  nodeId: z.string().trim().min(1).max(160).optional(),
  source: z.enum(['canvas', 'upload', 'gallery']).optional(),
  kind: z.enum(['image', 'video']),
  url: z.string().trim().url().max(ASSISTANT_MEDIA_LIMITS.maxUrlLength),
  thumbnailUrl: z
    .string()
    .trim()
    .url()
    .max(ASSISTANT_MEDIA_LIMITS.maxUrlLength)
    .optional(),
  label: z.string().trim().min(1).max(ASSISTANT_MEDIA_LIMITS.maxLabelLength),
})

export type AssistantMediaReference = z.infer<
  typeof AssistantMediaReferenceSchema
>

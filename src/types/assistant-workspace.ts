import { z } from 'zod'

import { ASSISTANT_WORKSPACES } from '@/constants/assistant-protocol'

export const AssistantWorkspaceSchema = z.enum(ASSISTANT_WORKSPACES)
export type AssistantWorkspace = z.infer<typeof AssistantWorkspaceSchema>

export const AssistantWorkspaceKeySchema = z
  .string()
  .max(167)
  .refine(
    (value) =>
      (value.startsWith('canvas:') && value.slice(7).trim().length > 0) ||
      (value !== 'canvas' && AssistantWorkspaceSchema.safeParse(value).success),
    'Invalid assistant workspace key',
  )

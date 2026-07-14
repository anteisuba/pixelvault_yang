import { z } from 'zod'

export const ASSISTANT_SURFACES = ['STUDIO', 'NODE_CANVAS'] as const
export type AssistantSurfaceId = (typeof ASSISTANT_SURFACES)[number]

export const AssistantSurfaceSchema = z.enum(ASSISTANT_SURFACES)

/**
 * Canvas / studio assistant persistence. Conversation is not product-capped —
 * values below are hard DoS guards only (must stay ≥ node-assistant request
 * limits so a successful turn never fails on the next upsert).
 */
export const ASSISTANT_CONVERSATION_LIMITS = {
  maxMessages: 500,
  maxContentLength: 100_000,
  titleMaxLength: 80,
  /** Soft window for non-canvas surfaces that still replay a short history. */
  replayWindow: 12,
} as const

export const AssistantConversationMessageSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  role: z.enum(['user', 'assistant']),
  content: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_CONVERSATION_LIMITS.maxContentLength),
  createdAt: z.string().datetime().optional(),
})

export type AssistantConversationMessageStored = z.infer<
  typeof AssistantConversationMessageSchema
>

export const UpsertAssistantConversationRequestSchema = z.object({
  id: z.string().uuid().optional(),
  surface: AssistantSurfaceSchema,
  projectId: z.string().trim().min(1).max(160).optional().nullable(),
  messages: z
    .array(AssistantConversationMessageSchema)
    .max(ASSISTANT_CONVERSATION_LIMITS.maxMessages),
})

export type UpsertAssistantConversationRequest = z.infer<
  typeof UpsertAssistantConversationRequestSchema
>

export const ListAssistantConversationsQuerySchema = z.object({
  surface: AssistantSurfaceSchema,
  projectId: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export type ListAssistantConversationsQuery = z.infer<
  typeof ListAssistantConversationsQuerySchema
>

export const GetAssistantConversationQuerySchema = z.object({
  id: z.string().uuid().optional(),
  surface: AssistantSurfaceSchema.optional(),
  projectId: z.string().trim().min(1).max(160).optional(),
})

export type GetAssistantConversationQuery = z.infer<
  typeof GetAssistantConversationQuerySchema
>

export interface AssistantConversationRecord {
  id: string
  surface: AssistantSurfaceId
  projectId: string | null
  title: string | null
  messages: AssistantConversationMessageStored[]
  createdAt: string
  updatedAt: string
}

export interface AssistantConversationSummary {
  id: string
  surface: AssistantSurfaceId
  projectId: string | null
  title: string | null
  updatedAt: string
  messageCount: number
}

export interface AssistantConversationShare {
  token: string
  expiresAt: string
}

export interface SharedAssistantConversationRecord {
  id: string
  surface: AssistantSurfaceId
  title: string | null
  messages: AssistantConversationMessageStored[]
  createdAt: string
  updatedAt: string
}

import { z } from 'zod'

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_MESSAGE_ROLES,
} from '@/constants/node-studio'
import {
  NodeStatusSchema,
  NodeWorkflowNodeTypeSchema,
} from '@/types/node-workflow'
import { LOCALES } from '@/i18n/routing'

export const NodeAssistantMessageRoleSchema = z.enum(
  NODE_STUDIO_ASSISTANT_MESSAGE_ROLES,
)

export const NodeAssistantMessageSchema = z.object({
  role: NodeAssistantMessageRoleSchema,
  content: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxMessageLength),
})

export const NodeAssistantNodeContextSchema = z.object({
  id: z.string().trim().min(1).max(160),
  type: NodeWorkflowNodeTypeSchema,
  status: NodeStatusSchema,
  title: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodeLabelLength),
  summary: z
    .string()
    .trim()
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodeSummaryLength)
    .optional(),
})

export const NodeAssistantRequestSchema = z.object({
  messages: z
    .array(NodeAssistantMessageSchema)
    .min(1)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxMessages),
  nodes: z
    .array(NodeAssistantNodeContextSchema)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxNodes),
  selectedNodeIds: z
    .array(z.string().trim().min(1).max(160))
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes)
    .default([]),
  locale: z.enum(LOCALES),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
  /**
   * Reference-research turn: study an existing film/anime/short and return
   * structural analysis + original script suggestions + prompt seeds. Routed
   * through a grounding-capable provider (Gemini/OpenAI) when one is available,
   * otherwise degrades to the model's own knowledge.
   */
  research: z.boolean().optional(),
})

export type NodeAssistantMessageRole = z.infer<
  typeof NodeAssistantMessageRoleSchema
>
export type NodeAssistantMessage = z.infer<typeof NodeAssistantMessageSchema>
export type NodeAssistantNodeContext = z.infer<
  typeof NodeAssistantNodeContextSchema
>
export type NodeAssistantRequest = z.infer<typeof NodeAssistantRequestSchema>

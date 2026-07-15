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

/**
 * Media that is already present on the canvas and can be attached to an
 * assistant turn. URLs are deliberately persisted as references, never as
 * data URLs, so the assistant request stays bounded and share/history rows do
 * not accidentally contain binary payloads.
 */
export const NodeAssistantMediaReferenceSchema = z.object({
  id: z.string().trim().min(1).max(160),
  /** Present for references selected from an existing canvas node. */
  nodeId: z.string().trim().min(1).max(160).optional(),
  source: z.enum(['canvas', 'upload', 'gallery']).optional(),
  kind: z.enum(['image', 'video']),
  url: z.string().trim().url().max(4000),
  thumbnailUrl: z.string().trim().url().max(4000).optional(),
  label: z.string().trim().min(1).max(160),
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
  references: z
    .array(NodeAssistantMediaReferenceSchema)
    .max(NODE_STUDIO_ASSISTANT_LIMITS.maxReferences)
    .optional(),
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
export type NodeAssistantMediaReference = z.infer<
  typeof NodeAssistantMediaReferenceSchema
>
export type NodeAssistantRequest = z.infer<typeof NodeAssistantRequestSchema>

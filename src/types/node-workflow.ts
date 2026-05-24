import type { Edge, Node } from '@xyflow/react'
import { z } from 'zod'

import {
  AI_ADAPTER_TYPE_OPTIONS,
  type ProviderConfig,
} from '@/constants/providers'
import {
  NODE_GENERATION_STATUSES,
  NODE_STATUSES,
  NODE_TYPES,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { SCRIPT_PLANNER_PROVIDERS } from '@/constants/script-breakdown'
import {
  ScriptBreakdownPlannerSchema,
  ScriptBreakdownResultSchema,
} from '@/types/script-breakdown'

export const NodeStatusSchema = z.enum(NODE_STATUSES)

export const NodeWorkflowNodeTypeSchema = z.enum(NODE_TYPES)

export const NodeWorkflowGenerationStatusSchema = z.enum(
  NODE_GENERATION_STATUSES,
)

export const NodeWorkflowModelSelectionSchema = z.object({
  optionId: z.string().trim().min(1).max(240),
  modelId: z.string().trim().min(1).max(200),
  adapterType: z.enum(AI_ADAPTER_TYPE_OPTIONS),
  providerConfig: z.object({
    label: z.string().trim().min(1).max(120),
    baseUrl: z.string().trim().min(1).max(500),
  }),
  apiKeyId: z.string().trim().min(1).max(160).optional(),
})

export const NodeWorkflowCharacterReferenceSchema = z.object({
  characterId: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  visualSeed: z.string().trim().min(1).max(2000),
})

export const NodeWorkflowNodeDataSchema = z
  .object({
    prompt: z.string(),
    status: NodeStatusSchema.default('idle'),
    breakdown: ScriptBreakdownResultSchema.optional(),
    plannerProvider: z.enum(SCRIPT_PLANNER_PROVIDERS).optional(),
    plannerApiKeyId: z.string().trim().min(1).max(160).optional(),
    plannerRouteOptionId: z.string().trim().min(1).max(240).optional(),
    plannerLabel: z.string().optional(),
    plannerModelId: z.string().optional(),
    planner: ScriptBreakdownPlannerSchema.optional(),
    model: NodeWorkflowModelSelectionSchema.optional(),
    imageUrl: z.string().trim().min(1).optional(),
    generationStatus: NodeWorkflowGenerationStatusSchema.optional(),
    generationError: z.string().optional(),
    generationId: z.string().trim().min(1).optional(),
    character: NodeWorkflowCharacterReferenceSchema.optional(),
  })
  .passthrough()

export const NodeWorkflowPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})

export const NodeWorkflowNodeSchema = z
  .object({
    id: z.string().min(1),
    type: NodeWorkflowNodeTypeSchema,
    position: NodeWorkflowPositionSchema,
    data: NodeWorkflowNodeDataSchema,
    selected: z.boolean().optional(),
    dragging: z.boolean().optional(),
  })
  .passthrough()

export const NodeWorkflowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
  })
  .passthrough()

export const NodeWorkflowStateSchema = z.object({
  version: z.literal(1),
  nodes: z.array(NodeWorkflowNodeSchema),
  edges: z.array(NodeWorkflowEdgeSchema),
})

export type NodeWorkflowStatus = z.infer<typeof NodeStatusSchema>
export type NodeWorkflowGenerationStatus = z.infer<
  typeof NodeWorkflowGenerationStatusSchema
>
export type NodeWorkflowModelSelection = z.infer<
  typeof NodeWorkflowModelSelectionSchema
>
export type NodeWorkflowCharacterReference = z.infer<
  typeof NodeWorkflowCharacterReferenceSchema
>
export interface NodeWorkflowModelOption extends NodeWorkflowModelSelection {
  requestCount: number
  sourceType: 'workspace' | 'saved'
  freeTier?: boolean
  keyLabel?: string
  maskedKey?: string
}
export type NodeWorkflowModelOptionsByType = Partial<
  Record<NodeWorkflowNodeType, NodeWorkflowModelOption[]>
>
export type NodeWorkflowModelProviderConfig = ProviderConfig
export type NodeWorkflowNodeData = z.infer<typeof NodeWorkflowNodeDataSchema> &
  Record<string, unknown>
export type NodeWorkflowStateSnapshot = z.infer<typeof NodeWorkflowStateSchema>
export type NodeWorkflowState = Omit<NodeWorkflowStateSnapshot, 'version'>
export type NodeWorkflowNode = Node<NodeWorkflowNodeData, NodeWorkflowNodeType>
export type NodeWorkflowEdge = Edge<Record<string, unknown>>

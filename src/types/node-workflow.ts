import type { Edge, Node } from '@xyflow/react'
import { z } from 'zod'

import {
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
    generationError: z.string().optional(),
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
export type NodeWorkflowNodeData = z.infer<typeof NodeWorkflowNodeDataSchema> &
  Record<string, unknown>
export type NodeWorkflowStateSnapshot = z.infer<typeof NodeWorkflowStateSchema>
export type NodeWorkflowState = Omit<NodeWorkflowStateSnapshot, 'version'>
export type NodeWorkflowNode = Node<NodeWorkflowNodeData, NodeWorkflowNodeType>
export type NodeWorkflowEdge = Edge<Record<string, unknown>>

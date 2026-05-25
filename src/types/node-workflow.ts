import type { Edge, Node } from '@xyflow/react'
import { z } from 'zod'

import {
  AI_ADAPTER_TYPE_OPTIONS,
  type ProviderConfig,
} from '@/constants/providers'
import {
  NODE_STUDIO_CHARACTER_IMAGE_LORAS,
  NODE_STUDIO_CHARACTER_IMAGE_MODES,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_PROJECTS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCES,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_SOURCES,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUSES,
  NODE_MEDIA_KINDS,
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

export const NodeWorkflowMediaKindSchema = z.enum(NODE_MEDIA_KINDS)

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

export const NodeWorkflowReferenceRoleSchema = z.enum(
  NODE_STUDIO_REFERENCE_ROLES,
)

export const NodeWorkflowReferenceSourceSchema = z.enum(
  NODE_STUDIO_REFERENCE_SOURCES,
)

export const NodeWorkflowImageOutputSourceSchema = z.enum(
  NODE_STUDIO_IMAGE_OUTPUT_SOURCES,
)

export const NodeWorkflowCharacterImageModeSchema = z.enum(
  NODE_STUDIO_CHARACTER_IMAGE_MODES,
)

export const NodeWorkflowReferenceAssetSchema = z.object({
  id: z.string().trim().min(1).max(160),
  url: z.string().trim().min(1).max(4000),
  role: NodeWorkflowReferenceRoleSchema.default(
    NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
  ),
  weight: z
    .number()
    .min(NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.minWeight)
    .max(NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxWeight)
    .default(NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight),
  source: NodeWorkflowReferenceSourceSchema,
  sourceId: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(160).optional(),
})

export const NodeWorkflowLoraSelectionSchema = z.object({
  assetId: z.string().trim().min(1).max(160),
  styleCode: z.string().trim().max(160).optional(),
  name: z.string().trim().min(1).max(160),
  loraUrl: z.string().trim().url().max(500),
  triggerWord: z.string().trim().max(4000).optional(),
  type: z.enum(['subject', 'style']),
  baseModelFamily: z.string().trim().min(1).max(120),
  scale: z
    .number()
    .min(NODE_STUDIO_CHARACTER_IMAGE_LORAS.minScale)
    .max(NODE_STUDIO_CHARACTER_IMAGE_LORAS.maxScale)
    .default(NODE_STUDIO_CHARACTER_IMAGE_LORAS.defaultScale),
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
    imageMode: NodeWorkflowCharacterImageModeSchema.optional(),
    imageSource: NodeWorkflowImageOutputSourceSchema.optional(),
    imageUrl: z.string().trim().min(1).optional(),
    mediaKind: NodeWorkflowMediaKindSchema.optional(),
    mediaUrl: z.string().trim().min(1).optional(),
    mediaJobId: z.string().trim().min(1).max(200).optional(),
    mediaLabel: z.string().trim().min(1).max(160).optional(),
    generationStatus: NodeWorkflowGenerationStatusSchema.optional(),
    generationError: z.string().optional(),
    generationId: z.string().trim().min(1).optional(),
    sourceGenerationId: z.string().trim().min(1).max(160).optional(),
    sourceLabel: z.string().trim().min(1).max(160).optional(),
    characterName: z.string().trim().min(1).max(160).optional(),
    character: NodeWorkflowCharacterReferenceSchema.optional(),
    referenceAssets: z.array(NodeWorkflowReferenceAssetSchema).optional(),
    loras: z.array(NodeWorkflowLoraSelectionSchema).optional(),
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

export const NodeWorkflowStateDataSchema = z.object({
  nodes: z.array(NodeWorkflowNodeSchema),
  edges: z.array(NodeWorkflowEdgeSchema),
})

export const NodeWorkflowStateSchema = NodeWorkflowStateDataSchema.extend({
  version: z.literal(NODE_STUDIO_WORKFLOW_STORAGE.legacyVersion),
})

export const NodeWorkflowProjectSchema = z.object({
  id: z.string().trim().min(1).max(NODE_STUDIO_PROJECTS.idMaxLength),
  name: z.string().trim().min(1).max(NODE_STUDIO_PROJECTS.nameMaxLength),
  createdAt: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_PROJECTS.timestampMaxLength),
  updatedAt: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_PROJECTS.timestampMaxLength),
  state: NodeWorkflowStateDataSchema,
})

export const NodeWorkflowStorageSchema = z
  .object({
    version: z.literal(NODE_STUDIO_WORKFLOW_STORAGE.version),
    currentProjectId: z
      .string()
      .trim()
      .min(1)
      .max(NODE_STUDIO_PROJECTS.idMaxLength),
    projects: z.array(NodeWorkflowProjectSchema).min(1),
  })
  .superRefine((storage, context) => {
    const hasCurrentProject = storage.projects.some(
      (project) => project.id === storage.currentProjectId,
    )

    if (!hasCurrentProject) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current project is missing from storage projects.',
        path: ['currentProjectId'],
      })
    }
  })

export type NodeWorkflowStatus = z.infer<typeof NodeStatusSchema>
export type NodeWorkflowGenerationStatus = z.infer<
  typeof NodeWorkflowGenerationStatusSchema
>
export type NodeWorkflowMediaKind = z.infer<typeof NodeWorkflowMediaKindSchema>
export type NodeWorkflowModelSelection = z.infer<
  typeof NodeWorkflowModelSelectionSchema
>
export type NodeWorkflowCharacterImageMode = z.infer<
  typeof NodeWorkflowCharacterImageModeSchema
>
export type NodeWorkflowCharacterReference = z.infer<
  typeof NodeWorkflowCharacterReferenceSchema
>
export type NodeWorkflowReferenceRole = z.infer<
  typeof NodeWorkflowReferenceRoleSchema
>
export type NodeWorkflowReferenceSource = z.infer<
  typeof NodeWorkflowReferenceSourceSchema
>
export type NodeWorkflowImageOutputSource = z.infer<
  typeof NodeWorkflowImageOutputSourceSchema
>
export type NodeWorkflowReferenceAsset = z.infer<
  typeof NodeWorkflowReferenceAssetSchema
>
export type NodeWorkflowLoraSelection = z.infer<
  typeof NodeWorkflowLoraSelectionSchema
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
export type NodeWorkflowState = z.infer<typeof NodeWorkflowStateDataSchema>
export type NodeWorkflowProject = z.infer<typeof NodeWorkflowProjectSchema>
export type NodeWorkflowStorageSnapshot = z.infer<
  typeof NodeWorkflowStorageSchema
>
export interface NodeWorkflowProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  nodeCount: number
}
export type NodeWorkflowNode = Node<NodeWorkflowNodeData, NodeWorkflowNodeType>
export type NodeWorkflowEdge = Edge<Record<string, unknown>>

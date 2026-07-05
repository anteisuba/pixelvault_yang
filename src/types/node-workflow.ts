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
  NODE_STUDIO_AGENT_MODES,
  NODE_STUDIO_PROJECTS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCES,
  NODE_STUDIO_REFERENCE_ROLES,
  NODE_STUDIO_REFERENCE_SOURCES,
  NODE_STUDIO_VOICE_PROFILE_SOURCES,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import { IMAGE_SIZES } from '@/constants/config'
import {
  NODE_GENERATION_STATUSES,
  NODE_IMAGE_ROLES,
  NODE_WORKFLOW_FIELDS,
  NODE_MEDIA_KINDS,
  NODE_STATUSES,
  NODE_TYPES,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { VIDEO_RESOLUTIONS } from '@/constants/video-options'
import { VIDEO_VARIANTS } from '@/constants/video-brands'
import { SCRIPT_PLANNER_PROVIDERS } from '@/constants/script-breakdown'
import { SCRIPT_DOC_DEPTHS, SCRIPT_DOC_STAGES } from '@/constants/script-doc'
import {
  ScriptBreakdownPlannerSchema,
  ScriptBreakdownResultSchema,
} from '@/types/script-breakdown'
import {
  SeedancePromptPlanResultSchema,
  SeedancePromptTimelineItemSchema,
} from '@/types/seedance-prompt-plan'
import { ScriptDocSchema, ScriptRefSchema } from '@/types/script-doc'

export const NodeStatusSchema = z.enum(NODE_STATUSES)

export const NodeWorkflowNodeTypeSchema = z.enum(NODE_TYPES)

export const NodeWorkflowGenerationStatusSchema = z.enum(
  NODE_GENERATION_STATUSES,
)

export const NodeWorkflowMediaKindSchema = z.enum(NODE_MEDIA_KINDS)

export const NodeWorkflowFieldSchema = z.enum(NODE_WORKFLOW_FIELDS)

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
    scene: z.string().optional(),
    action: z.string().optional(),
    camera: z.string().optional(),
    composition: z.string().optional(),
    location: z.string().optional(),
    mood: z.string().optional(),
    lighting: z.string().optional(),
    frameIntent: z.string().optional(),
    dialogue: z.string().optional(),
    voiceName: z.string().optional(),
    voiceProvider: z.string().optional(),
    voiceId: z.string().optional(),
    voiceCoverImage: z.string().trim().min(1).optional(),
    // Cover for the "my voice" (reference audio) source, kept separate from the
    // system-voice `voiceCoverImage` so switching sources doesn't clobber the
    // other's cover. Follows the picked audio asset's cover (set in the library).
    voiceReferenceCoverImage: z.string().trim().min(1).optional(),
    voiceSampleUrl: z.string().trim().min(1).optional(),
    voiceStyle: z.string().optional(),
    voiceEmotion: z.string().optional(),
    voiceSpeed: z.number().min(0.5).max(2).optional(),
    voiceVolume: z.number().min(-20).max(20).optional(),
    voiceSource: z.enum(NODE_STUDIO_VOICE_PROFILE_SOURCES).optional(),
    voiceReferenceAudioUrl: z.string().trim().min(1).optional(),
    voiceReferenceAudioName: z.string().trim().min(1).max(160).optional(),
    voiceReferenceAudioMimeType: z.string().trim().min(1).max(120).optional(),
    motion: z.string().optional(),
    duration: z.string().optional(),
    // videoMerge node: per-upstream-clip trim overrides. The Inspector keys
    // these by upstream URL so reconnection order doesn't lose user edits.
    // startSec / endSec are seconds within the source clip. When neither
    // is set the clip plays in full; presence of any override switches the
    // backend route from `merge-videos` to `compose` (which supports
    // keyframe timestamp + duration). See video-merge.service.ts.
    mergeSettings: z
      .object({
        clips: z
          .array(
            z.object({
              url: z.string().trim().min(1),
              startSec: z.number().min(0).max(600).optional(),
              endSec: z.number().min(0).max(600).optional(),
            }),
          )
          .max(9)
          .optional(),
      })
      .optional(),
    // Video output controls — mirror Studio's video panel. `passthrough()` on
    // this schema previously masked their absence; declaring them here makes
    // the contract explicit and lets the Inspector + Workbench rely on a real
    // type instead of `unknown`.
    resolution: z.enum(VIDEO_RESOLUTIONS).optional(),
    aspectRatio: z
      .enum(Object.keys(IMAGE_SIZES) as [string, ...string[]])
      .optional(),
    negativePrompt: z.string().trim().min(1).max(1000).optional(),
    /** Reference id → name last inserted as an `@name` token into this video
     *  node's prompt (§7.2 ⑥ 改名漂移). Lets the composer detect when an
     *  upstream node was renamed after its token was already typed into the
     *  prompt text, so it can offer a "replace with the new name" affordance
     *  instead of silently leaving a stale @token in place. */
    insertedReferenceNames: z.record(z.string(), z.string()).optional(),
    generateAudio: z.boolean().optional(),
    seed: z.number().int().min(0).max(2147483647).optional(),
    /** 上次生成实际用的 seed（provider 回写）— 用于展示 +「锁定」回填 seed。 */
    lastSeed: z.number().int().min(0).max(2147483647).optional(),
    audioIntent: z.string().optional(),
    status: NodeStatusSchema.default('idle'),
    breakdown: ScriptBreakdownResultSchema.optional(),
    agentMode: z.enum(NODE_STUDIO_AGENT_MODES).optional(),
    seedancePromptPlan: SeedancePromptPlanResultSchema.optional(),
    // Read-only per-segment beats copied from the upstream agent's plan when
    // applied to this Seedance node, so the breakdown stays visible in the
    // Inspector instead of only living baked into finalPrompt.
    timeline: z.array(SeedancePromptTimelineItemSchema).optional(),
    plannerProvider: z.enum(SCRIPT_PLANNER_PROVIDERS).optional(),
    plannerApiKeyId: z.string().trim().min(1).max(160).optional(),
    plannerRouteOptionId: z.string().trim().min(1).max(240).optional(),
    plannerLabel: z.string().optional(),
    plannerModelId: z.string().optional(),
    planner: ScriptBreakdownPlannerSchema.optional(),
    model: NodeWorkflowModelSelectionSchema.optional(),
    /**
     * Role of a unified `image` node (node-consolidation step 2 / option B):
     * character / background / shot / frame. Drives field set, accent,
     * empty-state, and seedance-harvest treatment. Absent on non-image nodes
     * and on legacy per-type image nodes (until the role migration runs).
     */
    role: z.enum(NODE_IMAGE_ROLES).optional(),
    imageMode: NodeWorkflowCharacterImageModeSchema.optional(),
    imageSource: NodeWorkflowImageOutputSourceSchema.optional(),
    imageUrl: z.string().trim().min(1).optional(),
    mediaKind: NodeWorkflowMediaKindSchema.optional(),
    mediaUrl: z.string().trim().min(1).optional(),
    /** Video poster frame — AI-generated videos get it from `Generation.thumbnailUrl`
     *  (§9.1); manually-uploaded reference videos get it from client-side capture
     *  (§9.2). Optional so nodes saved before this field existed stay valid. */
    videoThumbnailUrl: z.string().trim().min(1).optional(),
    mediaJobId: z.string().trim().min(1).max(200).optional(),
    mediaLabel: z.string().trim().min(1).max(160).optional(),
    generationStatus: NodeWorkflowGenerationStatusSchema.optional(),
    generationError: z.string().optional(),
    generationId: z.string().trim().min(1).optional(),
    sourceGenerationId: z.string().trim().min(1).max(160).optional(),
    sourceLabel: z.string().trim().min(1).max(160).optional(),
    characterName: z.string().trim().min(1).max(160).optional(),
    /** User-given name for a background node — mirrors characterName so the
     *  background can be referenced by name (e.g. @夜晚街道) in video prompts. */
    backgroundName: z.string().trim().min(1).max(160).optional(),
    /** User-given name for a shot node — mirrors character/background names so
     *  the shot can be referenced by name (e.g. @镜头1) in video prompts. */
    shotName: z.string().trim().min(1).max(160).optional(),
    character: NodeWorkflowCharacterReferenceSchema.optional(),
    /**
     * Library card binding — set when the character image node was hydrated
     * from a CharacterCardRecord. Separate from `character.characterId`
     * (which references breakdown drafts) so spawnFullWorkflow can keep
     * the two binding spaces distinct.
     */
    cardId: z.string().trim().min(1).max(160).optional(),
    referenceAssets: z.array(NodeWorkflowReferenceAssetSchema).optional(),
    loras: z.array(NodeWorkflowLoraSelectionSchema).optional(),
    /**
     * Idempotency tag stamped by the ScriptDoc projection
     * (`projectScriptDocToGraph`). Lets a re-projection update this node in
     * place instead of spawning a duplicate. Absent on hand-added nodes.
     */
    scriptRef: ScriptRefSchema.optional(),
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

/**
 * Canvas-default video model (two-tier switcher taxonomy). Persisted per
 * project so new video nodes inherit a consistent cross-shot baseline; the
 * topbar chip reads/sets it and the autospawn effect resolves a concrete model
 * from it. Provider + reference-ness are resolved per node at spawn time.
 */
export const VideoDefaultModelSchema = z.object({
  brand: z.string().trim().min(1).max(40),
  variant: z.enum(VIDEO_VARIANTS),
})
export type VideoDefaultModel = z.infer<typeof VideoDefaultModelSchema>

export const NodeWorkflowStateDataSchema = z.object({
  nodes: z.array(NodeWorkflowNodeSchema),
  edges: z.array(NodeWorkflowEdgeSchema),
  /**
   * The assistant's ScriptDoc fact model, persisted alongside the graph so
   * "chat → outline → spawn" survives reloads. `.catch(undefined)` is a
   * seatbelt: a malformed persisted doc degrades to undefined instead of
   * failing the whole-state parse — which the server's `validateState`
   * coerces to an EMPTY state, wiping the user's nodes/edges.
   */
  scriptDoc: ScriptDocSchema.optional().catch(undefined),
  /**
   * Canvas-default video model. `.catch(undefined)` mirrors scriptDoc's
   * seatbelt so a malformed value never fails the whole-state parse.
   */
  defaultVideoModel: VideoDefaultModelSchema.optional().catch(undefined),
  /**
   * Right-rail workspace UI state — drafting stage, depth preset, and the
   * manual-edit lock keys — persisted so they survive a reload. Each `.catch`
   * to the seatbelt default; a malformed value degrades instead of wiping state.
   */
  scriptDocStage: z.enum(SCRIPT_DOC_STAGES).optional().catch(undefined),
  scriptDocDepth: z.enum(SCRIPT_DOC_DEPTHS).optional().catch(undefined),
  scriptDocLocks: z.array(z.string()).optional().catch(undefined),
})

export const NodeWorkflowStateSchema = NodeWorkflowStateDataSchema.extend({
  version: z.literal(NODE_STUDIO_WORKFLOW_STORAGE.legacyVersion),
})

export const NodeWorkflowLegacyV2StorageSchema = z.object({
  version: z.literal(NODE_STUDIO_WORKFLOW_STORAGE.legacyVersionV2),
  currentProjectId: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_PROJECTS.idMaxLength),
  projects: z.array(
    z.object({
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
    }),
  ),
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
    // Clerk user id of whoever wrote this snapshot. Required so a stale
    // localStorage row from a previous account on the same browser is
    // rejected on read instead of being silently rendered (and worse,
    // migrated up to the new account's server rows). Treat any snapshot
    // whose ownerClerkId doesn't match the current session as untrusted.
    ownerClerkId: z.string().trim().min(1).max(160),
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

// ─── API contracts for the Prisma-backed NodeWorkflowProject ─────────────

/**
 * Server-side record shape — what API routes return to the client.
 * Mirrors the `NodeWorkflowProject` Prisma model 1:1 except `state` is
 * the validated `NodeWorkflowStateDataSchema` shape (JSON in DB → typed
 * here before crossing the network boundary).
 */
export const NodeWorkflowProjectRecordSchema = z.object({
  id: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(NODE_STUDIO_PROJECTS.nameMaxLength),
  state: NodeWorkflowStateDataSchema,
  lastActiveAt: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
})

export const CreateNodeWorkflowProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(NODE_STUDIO_PROJECTS.nameMaxLength),
  state: NodeWorkflowStateDataSchema.optional(),
})

export const UpdateNodeWorkflowProjectRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(NODE_STUDIO_PROJECTS.nameMaxLength)
    .optional(),
  state: NodeWorkflowStateDataSchema.optional(),
})

export type NodeWorkflowProjectRecord = z.infer<
  typeof NodeWorkflowProjectRecordSchema
>
export type CreateNodeWorkflowProjectRequest = z.infer<
  typeof CreateNodeWorkflowProjectRequestSchema
>
export type UpdateNodeWorkflowProjectRequest = z.infer<
  typeof UpdateNodeWorkflowProjectRequestSchema
>

export type NodeWorkflowStatus = z.infer<typeof NodeStatusSchema>
export type NodeWorkflowGenerationStatus = z.infer<
  typeof NodeWorkflowGenerationStatusSchema
>
export type NodeWorkflowMediaKind = z.infer<typeof NodeWorkflowMediaKindSchema>
export type NodeWorkflowField = z.infer<typeof NodeWorkflowFieldSchema>
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

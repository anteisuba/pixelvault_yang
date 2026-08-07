import type { Edge, Node } from '@xyflow/react'
import { z } from 'zod'

import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import {
  NODE_STUDIO_CANVAS_APPEARANCE_FITS,
  NODE_STUDIO_CHARACTER_IMAGE_LORAS,
  NODE_STUDIO_CHARACTER_IMAGE_MODES,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_GENERATE_COMPOSER,
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
  NODE_GENERATION_SOURCES,
  NODE_GENERATION_STATUSES,
  NODE_IMAGE_ROLES,
  NODE_REVIEW_STATES,
  NODE_WORKFLOW_FIELDS,
  NODE_MEDIA_KINDS,
  NODE_STATUSES,
  NODE_TYPES,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { VIDEO_RESOLUTIONS } from '@/constants/video-options'
import { ALL_VIDEO_VARIANTS } from '@/constants/video-brands'
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
import { ReadyCanvasImageEditCapabilityIdSchema } from '@/types/canvas-image-edit'

export const NodeStatusSchema = z.enum(NODE_STATUSES)

export const NodeWorkflowNodeTypeSchema = z.enum(NODE_TYPES)

export const NodeWorkflowGenerationStatusSchema = z.enum(
  NODE_GENERATION_STATUSES,
)

export const NodeWorkflowMediaKindSchema = z.enum(NODE_MEDIA_KINDS)

export const NodeReviewStateSchema = z.enum(NODE_REVIEW_STATES)

export const NodeGenerationSourceSchema = z.enum(NODE_GENERATION_SOURCES)

/**
 * 一张图的审核记录（包 4）。挂在节点的 `mediaReview` 里、**按 URL 键控**。
 *
 * 打回时保留的三样（§5-W3「打回载荷」）：`reason` 是打回理由，`promptPatch` 是
 * 「改词再来」时用户给的增补，`reviewedAt` 是谁什么时候看的时间戳。三样都可选 ——
 * 「通过」不需要理由，只有打回才填。
 */
export const NodeMediaReviewSchema = z.object({
  state: NodeReviewStateSchema,
  reason: z.string().trim().min(1).max(600).optional(),
  promptPatch: z.string().trim().min(1).max(2000).optional(),
  reviewedAt: z.string().trim().min(1).max(40).optional(),
  /**
   * 进入待审队列的时间（包 6 §4.1）—— **审阅推进的排序依据**。
   *
   * 队列要「按投影 / 生成顺序」推进，而那个顺序跨节点无处可取：节点数组顺序是
   * 创建顺序（会被拖动、删除、重排打乱），一个节点内部的 `mediaReview` 插入顺序
   * 又只在该节点内成立。所以顺序记在被排的东西自己身上。
   *
   * 可选：存量记录没有这一项，排序时视为最早（先审老的）。
   */
  markedAt: z.string().trim().min(1).max(40).optional(),
})

export const NodeWorkflowFieldSchema = z.enum(NODE_WORKFLOW_FIELDS)

export const NodeWorkflowModelSelectionSchema = z.object({
  optionId: z.string().trim().min(1).max(240),
  modelId: z.string().trim().min(1).max(200),
  // Any adapter (not the narrower API-key-eligible subset) — canvas nodes
  // can select a RUNNER-backed model exactly like any other, they just
  // never carry a user apiKeyId for it (see apiKeyId below, optional).
  adapterType: z.nativeEnum(AI_ADAPTER_TYPES),
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

export const NodeWorkflowAudioClipRoleSchema = z.enum([
  'speech',
  'voice-profile',
  'sfx',
  'music',
  'ambience',
])

/** Finished, playable audio. Kept separate from Voice Profile donor audio. */
export const NodeWorkflowAudioClipSchema = z.object({
  url: z.string().trim().min(1).max(4000),
  generationId: z.string().trim().min(1).max(160).optional(),
  role: NodeWorkflowAudioClipRoleSchema.default('speech'),
  durationSeconds: z.number().nonnegative().max(3600).optional(),
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
  /**
   * S5d ③ 分类系统 — user-typed label when `role === 'custom'`
   * (`NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID`). Backward-compatible additive
   * field: absent on every pre-S5d saved reference, which keeps its preset
   * `role` untouched.
   */
  customLabel: z.string().trim().min(1).max(80).optional(),
  /**
   * V-2 主图（docs/references/pages/canvas-video-card.md）: marks this entry
   * as the ONE image a character/background card sends to a downstream
   * Seedance video reference (or a shot's own image-to-image harvest) — the
   * card can collect several referenceAssets for organizing/swapping, but
   * only the ★-starred one actually rides `image_urls`. At most one entry
   * per card should carry `true`; `getNodePrimaryMediaUrl`
   * (`lib/node-workflow-graph.ts`) takes the first if more than one somehow
   * does. Additive/optional — absent on every reference saved before V-2,
   * which keeps resolving to the card's `mediaUrl` (unchanged behavior, see
   * `getNodePrimaryMediaUrl`'s fallback chain).
   */
  isPrimary: z.boolean().optional(),
  /**
   * R3-6 出场组（canvas-relationship-v3-2026-07 §3.0a）: marks this entry as
   * ALSO riding a downstream harvest alongside the card's ★ primary — a
   * collector (character/background) can curate several images that all
   * "appear" together (a consistency-preserving multi-angle set), not just
   * the one primary. `getNodeStageMediaUrls` (`lib/node-workflow-graph.ts`)
   * expands `[primary, ...onStage entries]` in array order. Additive/optional
   * and absent on every reference saved before R3-6, which keeps resolving to
   * `[primary]` only — zero behavior change for every existing project.
   */
  onStage: z.boolean().optional(),
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
    /** Finished playable clip; never reuse Voice Profile reference audio here. */
    audioClip: NodeWorkflowAudioClipSchema.optional(),
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
    /**
     * canvas-generate-composer.md §5「比例+清晰度」的清晰度档——image-kind
     * 节点专用，与 `resolution`（VIDEO_RESOLUTIONS：480p/720p/…）是两个不同的
     * 值域，不能共用同一字段。与 `AdvancedParams.resolution`
     * （types/index.ts）同枚举，`handleGenerateMediaNode` 把它折进
     * advancedParams.resolution 再发往 studioGenerateAPI。
     */
    imageResolution: z
      .enum(NODE_STUDIO_GENERATE_COMPOSER.imageResolutionTiers)
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
    /** Intrinsic dimensions of persisted media, when the producing task
     *  reports them. Invalid legacy metadata degrades to undefined instead of
     *  rejecting the whole saved workflow. */
    mediaWidth: z.number().int().positive().optional().catch(undefined),
    mediaHeight: z.number().int().positive().optional().catch(undefined),
    /** Video poster frame — AI-generated videos get it from `Generation.thumbnailUrl`
     *  (§9.1); manually-uploaded reference videos get it from client-side capture
     *  (§9.2). Optional so nodes saved before this field existed stay valid. */
    videoThumbnailUrl: z.string().trim().min(1).optional(),
    mediaJobId: z.string().trim().min(1).max(200).optional(),
    /**
     * 谁发起了 `mediaJobId` 这一次生成（包 6 ①-bis）—— 决定结果**进不进待审
     * 队列**。
     *
     * ⚠ 为什么要**持久化**而不是只当运行时参数：生成超出前台轮询窗口会留在
     * `pending`，由 `use-node-generation-reconcile` 在重新聚焦甚至**刷新之后**
     * 回填。那时内存里的来源早没了，不落盘的话助手生成会静默逃过审核门（查不
     * 到 = 祖父条款 = 直接算通过）。
     *
     * 与 `mediaJobId` 同生共死：派发时一起写，落地（成功/失败）时一起清。
     */
    mediaJobSource: NodeGenerationSourceSchema.optional(),
    mediaLabel: z.string().trim().min(1).max(160).optional(),
    generationStatus: NodeWorkflowGenerationStatusSchema.optional(),
    generationError: z.string().optional(),
    generationId: z.string().trim().min(1).optional(),
    /** Generation-level lineage for composed/merged media outputs. */
    lineage: z
      .object({
        operation: z.enum(['generate', 'merge', 'compose']).optional(),
        sourceUrls: z
          .array(z.string().trim().min(1).max(4000))
          .max(9)
          .optional(),
      })
      .optional()
      .catch(undefined),
    sourceGenerationId: z.string().trim().min(1).max(160).optional(),
    sourceLabel: z.string().trim().min(1).max(160).optional(),
    /** Immediate canvas lineage for a non-destructive image edit result. */
    derivedFromNodeId: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .catch(undefined),
    derivedFromGenerationId: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .catch(undefined),
    /** Operation id shared by a multi-output edit such as layer decomposition. */
    derivedBatchId: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .catch(undefined),
    editCapability:
      ReadyCanvasImageEditCapabilityIdSchema.optional().catch(undefined),
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
    /**
     * @deprecated Compatibility-only parser field for pre-2026-07-30
     * projects. Runtime hydration removes it with
     * `migrateRetireFusedNodes`; current interactions must never write or
     * render from it. It remains parseable for one migration window so old
     * JSON cannot fail the whole workflow-state validation.
     */
    fusedIntoNodeId: z.string().trim().min(1).max(160).optional(),
    /**
     * S5d ③「图片=素材原子」: a LOOSE image node's own classification (set
     * after upload-first landing, §6.0 "图进来后可设 名字 + 分类"). Distinct
     * from a card's nested `referenceAssets[].role` — this is the node's OWN
     * category, carried over into that field's value if/when the node is
     * later fused into a card (`createReferenceAsset` reads it as a seed).
     * Optional/additive — absent on every node that predates S5d, including
     * legacy `frame`-role nodes (their keyframe-ness still comes from
     * `role==='frame'`, not this field — see `isKeyframeNode`).
     */
    imageCategory: NodeWorkflowReferenceRoleSchema.optional(),
    /** Custom label paired with `imageCategory === 'custom'` — mirrors
     *  `NodeWorkflowReferenceAssetSchema.customLabel`. */
    imageCategoryLabel: z.string().trim().min(1).max(80).optional(),
    /**
     * 审核记录（包 4 / §4.2 Q3）—— **URL → 审核态**，一张图一条。
     *
     * ⚠ **缺失即通过（祖父条款）**。这个字段在每一个本包上线之前保存的项目里
     * 都是 undefined，而且即使存在，也只会记录「被显式标过的那几张」。所以
     * `resolveMediaReviewState` 对查不到的 URL 一律返回 `approved` —— 反过来
     * 设计（查不到＝待审）会让**所有存量项目的所有图当场停止喂下游**，是一次
     * 全站回归。只有本包之后**助手**生成的结果才会被显式写成 `awaiting_review`。
     *
     * ⚠ 写不写这里，看的是 `mediaJobSource`（包 6 ①-bis，owner 2026-08-01）：
     * 只有**助手**发起的生成进待审。用户自己点的生成、上传的图、从素材库挑的图
     * 一律不写 —— 你亲手做的选择已经是一次确认了，再拦一道是仪式。
     * 【历史】包 4–5 期间这里对**所有**生成路径无条件写 `awaiting_review`，与本
     * 条注释的意图不符；包 6 片 1 修正，存量假待审不回填（审掉即可）。
     *
     * `.catch(undefined)` 与 `lineage` / `mediaWidth` 同一条安全带：一条记录坏掉
     * 时整个字段降级成 undefined（＝全部按通过），而不是让整份工作流状态解析失败
     * 被 `validateState` 强制清空成空画布。
     */
    mediaReview: z
      .record(z.string(), NodeMediaReviewSchema)
      .optional()
      .catch(undefined),
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

/**
 * R3-6b §3 每镜覆写（canvas-relationship-v3-2026-07 §3.0a/§7 R3-6b）: additive
 * edge-level data. `stageOverrideUrls`, when present, REPLACES the source
 * collector's own `onStage` curation for THIS ONE `收集器→视频` edge — "每镜"
 * because a different edge from the same collector (a different downstream
 * video) keeps resolving its own override, or the card default when it has
 * none. `.catch(undefined)` degrades a malformed persisted value instead of
 * failing the whole-state parse (same seatbelt pattern as `lineage` /
 * `mediaWidth` above). Absent on every edge saved before R3-6b, and on every
 * non-collector-source edge — `getNodeStageMediaUrls` / the harvest functions
 * that read it via `getEdgeStageOverrideUrls` fall back to the card's own
 * onStage set whenever it's missing, so zero drift for existing projects.
 */
export const NodeWorkflowEdgeDataSchema = z
  .object({
    stageOverrideUrls: z
      .array(z.string().trim().min(1).max(4000))
      .max(9)
      .optional(),
  })
  .passthrough()

export const NodeWorkflowEdgeSchema = z
  .object({
    id: z.string().min(1),
    source: z.string().min(1),
    target: z.string().min(1),
    sourceHandle: z.string().nullable().optional(),
    targetHandle: z.string().nullable().optional(),
    data: NodeWorkflowEdgeDataSchema.optional().catch(undefined),
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
  // Seedance speed (standard/fast) or Kling product track (v3/o3).
  variant: z.enum(ALL_VIDEO_VARIANTS),
})
export type VideoDefaultModel = z.infer<typeof VideoDefaultModelSchema>

export const CanvasAppearanceImageSchema = z.object({
  url: z.httpUrl().max(4000),
  sourceGenerationId: z.string().trim().min(1).max(160).optional(),
  fit: z.enum(NODE_STUDIO_CANVAS_APPEARANCE_FITS),
  opacity: z.number().min(0.1).max(1),
})

export const CanvasAppearanceSchema = z.object({
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  image: CanvasAppearanceImageSchema.optional(),
})

export type CanvasAppearance = z.infer<typeof CanvasAppearanceSchema>

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
   * Project-level canvas wallpaper. As with ScriptDoc, malformed appearance
   * data degrades to undefined instead of rejecting and emptying the graph.
   * Untouched projects omit this field and resolve UI defaults at render time.
   */
  canvasAppearance: CanvasAppearanceSchema.optional().catch(undefined),
  /**
   * Right-rail workspace UI state — drafting stage, depth preset, and the
   * manual-edit lock keys — persisted so they survive a reload. Each `.catch`
   * to the seatbelt default; a malformed value degrades instead of wiping state.
   */
  scriptDocStage: z.enum(SCRIPT_DOC_STAGES).optional().catch(undefined),
  scriptDocDepth: z.enum(SCRIPT_DOC_DEPTHS).optional().catch(undefined),
  scriptDocLocks: z.array(z.string()).optional().catch(undefined),
  /**
   * 分镜静帧开关 (包 3 / Q5「默认开 · 项目级可关」). `undefined` = 默认开, so
   * every project that predates this field keeps the default without a
   * migration. Only an explicit `false` stops the projection from spawning new
   * stills — and even then the ones already on the canvas are preserved (see
   * `projectScriptDocToGraph`'s `shotStills` option).
   */
  scriptDocShotStills: z.boolean().optional().catch(undefined),
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
export type NodeMediaReview = z.infer<typeof NodeMediaReviewSchema>
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
export type NodeWorkflowEdgeData = z.infer<typeof NodeWorkflowEdgeDataSchema> &
  Record<string, unknown>
export type NodeWorkflowLoraSelection = z.infer<
  typeof NodeWorkflowLoraSelectionSchema
>
export interface NodeWorkflowModelOption extends NodeWorkflowModelSelection {
  requestCount: number
  sourceType: 'workspace' | 'saved'
  freeTier?: boolean
  keyLabel?: string
  maskedKey?: string
  /**
   * Set when the option's provider already has an active key, so it is runnable
   * without a key row bound to this exact model id. See `withProviderKeyCoverage`.
   */
  providerKeyId?: string
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

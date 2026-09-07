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
  NODE_STUDIO_VOICE_CLIP_SOURCES,
  NODE_STUDIO_VOICE_PROFILE_SOURCES,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import { IMAGE_SIZES } from '@/constants/config'
import {
  NODE_SLOT_OUTPUT_IDS,
  NODE_SLOT_OUTPUTS,
  NODE_SLOT_TEXT_ROLES,
  NODE_SLOTS,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_GENERATION_SOURCES,
  NODE_GENERATION_STATUSES,
  NODE_IMAGE_ROLES,
  NODE_REVIEW_STATES,
  NODE_WORKFLOW_FIELDS,
  NODE_MEDIA_KINDS,
  NODE_STATUSES,
  NODE_TYPES,
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPES,
  NODE_V4_IMAGE_SUBTYPES,
  NODE_V4_SOURCE_TRUST_LEVELS,
  NODE_V4_TEXT_SUBTYPES,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { VIDEO_RESOLUTIONS } from '@/constants/video-options'
import { VIDEO_NODE_MODES } from '@/constants/video-node-modes'
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
    /**
     * 这个节点交付的那段参考语音 —— **唯一产物**。域定义见
     * `docs/references/pages/canvas-voice-card.md` §0.5。
     * 判「发不发得出去」一律走 `readVoiceUrlFromData`，别再自己写取值链。
     */
    voiceClipUrl: z.string().trim().min(1).optional(),
    voiceClipSource: z.enum(NODE_STUDIO_VOICE_CLIP_SOURCES).optional(),
    /**
     * @deprecated 已被 `voiceClipUrl` 取代（2026-08-10 字段收敛）。
     * ⛔ **不许从 schema 删**：水化是先 parse 再 migrate，删了它 parse 阶段就会把
     * 存量项目里的这段音频 strip 掉，迁移再也看不到 —— 用户的声音静默清零。
     * 只有 `node-workflow-migrate-voice-clip.ts` 读它。
     */
    voiceSampleUrl: z.string().trim().min(1).optional(),
    /**
     * 这条音色**属于哪个角色**（台账 X，owner 2026-08-29 拍板）。
     *
     * 只在音色**绕过角色卡、直接挂进视频节点**时才需要：走
     * `voice → character → video` 两跳的那条，角色名由角色卡自己给
     * （`harvestUpstreamAudioBindings` 的 pass 1）。直挂的那条此前没有任何地方
     * 能说「这条属于谁」，于是送出预览里两条音频都写「旁白」，多角色对白片
     * 在 UI 上根本钉不到角色 —— 而这正是 Seedance 2.5 官方推荐的写法
     * （「Images 1-2 are Character 1 and correspond to Audio 1」）。
     *
     * ⛔ **不能复用 `characterName`**：那是显示名优先链的**第一顺位**
     * （`resolveNodeDisplayName`），写在音色节点上会把卡的名字从音色名劫持成
     * 角色名。归属和名字是两件事。
     *
     * 可选且无迁移：存量音色节点没有它 = 无归属，与改动前行为逐字相同。
     */
    audioOwnerName: z.string().trim().min(1).max(160).optional(),
    voiceStyle: z.string().optional(),
    voiceEmotion: z.string().optional(),
    voiceSpeed: z.number().min(0.5).max(2).optional(),
    voiceVolume: z.number().min(-20).max(20).optional(),
    voiceSource: z.enum(NODE_STUDIO_VOICE_PROFILE_SOURCES).optional(),
    /**
     * @deprecated 同上，已被 `voiceClipUrl` 取代。⛔ 同样不许从 schema 删。
     */
    voiceReferenceAudioUrl: z.string().trim().min(1).optional(),
    voiceReferenceAudioName: z.string().trim().min(1).max(160).optional(),
    voiceReferenceAudioMimeType: z.string().trim().min(1).max(120).optional(),
    /** Finished playable clip; never reuse Voice Profile reference audio here. */
    audioClip: NodeWorkflowAudioClipSchema.optional(),
    motion: z.string().optional(),
    duration: z.string().optional(),
    /**
     * 视频节点的**模式**（关键帧 / 多图参考 / 全能参考）。它决定三件事：节点长
     * 什么样、走哪个端点、模型选择器里出现谁。设计见
     * `docs/references/pages/canvas-video-card.md` §6.1–§6.5。
     *
     * ⚠ **可选，且不写 migration**。存量节点没有这个字段，读的时候从它当前的模型
     * 反推（`getNodeModeForModel`）—— 契约里的 `referenceMode` 与模式一一对应，所以
     * 反推是精确的，不是猜。默认成「关键帧」会让存量的 Reference 节点一打开就显示
     * 错档、并按不兼容清掉用户的模型。
     */
    videoMode: z.enum(VIDEO_NODE_MODES).optional(),
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
    /**
     * 容器字段，画布对齐三梁之一——框节点类型随 UI 落地，这里只铺数据层：
     * 这个节点被哪个框节点收纳（框本身也是一个普通 node，id 相同的
     * 命名空间）。纯加法、可选：存量节点没有它 = 未入框，与改动前行为逐字
     * 相同。⚠ 本次不加新 NODE_TYPE_ID，框类型不在这次的范围内。
     */
    parentId: z.string().optional(),
    /** 该节点（多为框节点）当前是否折叠。同上，纯加法、可选。 */
    collapsed: z.boolean().optional(),
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
    /**
     * 具名槽（第三期 · C3a）。**可选**，且只在 v3 上可选。
     *
     * 存量图的边一条都没有槽——「这条边是首帧还是参考」此前只能靠下游收割逻辑按
     * 位置猜。收割层（`harvestSlots`，`lib/node-workflow-graph.ts`）现在一律按槽
     * 读：边上有 `slot` 就用它，没有就用 `inferLegacySlot` 按**旧位置规则**推断一
     * 次，把推断结果当作等价 slot。⛔ 推断结果**不回写库、不做双写** —— 存量图原
     * 样躺着，新建的边才带槽。
     *
     * ⚠ 迁移顺序：C3c 翻转到 v4 之后，v4 边的 `slot` 是**必填**
     * （`NodeWorkflowEdgeV4Schema`），此可选字段随整个 v3 schema 一起删。
     */
    slot: z.enum(NODE_SLOTS).optional(),
    data: NodeWorkflowEdgeDataSchema.optional().catch(undefined),
  })
  .passthrough()

// 2026-08-08：`VideoDefaultModelSchema`（项目级默认视频型号 + 跨镜头漂移徽标）整条
// 删除。管道齐全但**没有写入口** —— `setDefaultVideoModel` 从来不在
// `NodeWorkflowActionsContext` 的类型里，没有任何组件能写它，于是它恒为 undefined、
// 徽标从不点亮、autospawn 永远走硬编码兜底。注释里说的「topbar chip」不存在。
// owner 拍板删（cleanup §9.10）：留着无人消费的管道，正是这一轮清掉的那套 brand
// switcher 的成因 —— 下一个会话会以为它在跑。要做时按新分类重建。

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
  /**
   * 「这个空 state 是用户自己删空的，不是事故」。
   *
   * `state` 是整体替换，没有 merge —— 一份空的 state 上来就会把库里那份好副本
   * 抹平。服务端因此默认拒绝「空覆盖非空」（见 `updateNodeWorkflowProject`），
   * 而**用户真的把画布删空**是合法操作，得有一条显式的放行路径，就是这个字段。
   *
   * 只有 `useNodeWorkflow` 亲眼看见「本项目从有节点变成零节点」时才置 true；
   * 客户端拿不准那份 state 是不是真的（比如服务端 list 失败后回落到
   * localStorage 的那一份）时一律不带这个标记。
   */
  allowEmptyState: z.boolean().optional(),
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
/**
 * v3 边。`slot` 是第三期 C3a 加的**可选**具名槽（见 `NodeWorkflowEdgeSchema`
 * 里那条头注）：新建的边写得上，存量边一条都没有，收割层用 `inferLegacySlot`
 * 按旧位置规则补一次。C3c 翻转到 v4 后随整个 v3 形状一起删。
 */
export type NodeWorkflowEdge = Edge<Record<string, unknown>> & {
  slot?: NodeSlotId
}

/* ═════════════════════════════════════════════════════════════════════════
 * v4 数据模型（第三期 · 画布 C1，`docs/references/pages/node-canvas-v2.md` §9.1）
 *
 * ── 与上面 v3 的关系：并行存在，不是兼容层 ──────────────────────────────
 * v3 的 `NodeWorkflowNodeDataSchema` 是一个扁平 `passthrough()` 大对象，80+ 字段
 * 共存，`voice*` / `merge*` / `image*` 挤在一起，谁属于谁只能靠注释——`passthrough`
 * 正是字段能随手长出来的原因，也是死字段的温床。v4 用 `discriminatedUnion('kind')`
 * 取代它。
 *
 * ⚠ **两份 schema 同时活着是迁移顺序，不是留垫片**（Engineering Principles 1 不冲突）：
 * `NodeWorkflowStateSchema.nodes` 是 `z.array()` **无逐项 `.catch()`**，先删 v3 再迁移
 * = 存量项目整份 parse 失败 → `validateState` 兜成空状态 → 用户看到空画布且静默
 * 无报错 → 下一次防抖写入把空状态持久化，不可恢复。
 * TODO(C3)：`scripts/migrate-node-workflow-v4.ts` 一次性回填跑完并逐项目验证
 * （节点数 / 边数 / legacy type 零残留）之后，删除本文件上半部的 v3 schema、
 * `NODE_TYPES` 12 个 legacy 值与两条读路径垫片，v4 成为唯一形状。
 * ═════════════════════════════════════════════════════════════════════════ */

export const NodeSlotIdSchema = z.enum(NODE_SLOTS)
export const NodeSlotOutputSchema = z.enum(NODE_SLOT_OUTPUTS)

/**
 * 溯源七字段（§1.2）。同时喂候选网格卡的三字段与「能不能继续作生成输入」的判断。
 */
export const NodeV4SourceRefSchema = z.object({
  /** 这条素材说的是谁（角色名 / 主体名）。 */
  subjectName: z.string().trim().min(1).max(160).optional(),
  url: z.string().trim().min(1).max(4000).optional(),
  publisher: z.string().trim().min(1).max(160).optional(),
  /** 原片时间码，自由格式（`00:12:31` / `12m31s`），不解析。 */
  timecode: z.string().trim().min(1).max(40).optional(),
  usage: z.string().trim().min(1).max(400).optional(),
  trustLevel: z.enum(NODE_V4_SOURCE_TRUST_LEVELS).optional(),
  /** 允不允许把它继续当生成输入（版权 / 合规判断的落点）。 */
  reusableAsInput: z.boolean().optional(),
})

/**
 * 槽内一个版本（§1.4）。**每个版本仍然是一条真边**——`versions` 不复制素材，
 * 只记「哪条边在这个槽里排第几」。
 */
export const NodeV4SlotVersionSchema = z.object({
  /** versionId，稳定：改名 / 换序 / 翻版都不变。 */
  id: z.string().trim().min(1).max(160),
  /**
   * 这条文本在这个槽里**当什么用**（C1 契约修正 2）。只对 `text` 槽有意义——
   * 角色是边的属性不是节点身份：同一份文本可以在 A 镜当剧本、在 B 镜当风格约束。
   *
   * 缺席 = `script`（`NODE_SLOT_TEXT_ROLE_FALLBACK`）。⛔ 不给非文本槽编默认值，
   * 那会让「角色只对文本槽有意义」这条事实在两处各写各的。
   */
  role: z.enum(NODE_SLOT_TEXT_ROLES).optional(),
  edgeId: z.string().trim().min(1).max(160),
  sourceNodeId: z.string().trim().min(1).max(160),
  /** 停用：画叉、压暗，且**不可设为当前**。 */
  blocked: z.boolean().default(false),
  /** 例「首帧动作不自然」——直接进拒绝理由与规则薄卡。 */
  blockedReason: z.string().trim().min(1).max(400).optional(),
  addedAt: z.string().trim().min(1).max(40),
})

/**
 * 一个槽的绑定：`{ versions, cur }`（§1.4 owner 拍板「画-1」）。
 *
 * ⚠ **版本是槽的属性，不是节点的身份**：同一张图可以同时是 S02 的首帧第 5 版和
 * S03 的构图参考；版本若写进节点身份，复用就退化成复制，且 N 个候选节点各占一行
 * 快照，24 镜下上下文直接爆掉——轮播只报一行。
 */
export const NodeV4SlotBindingSchema = z.object({
  slot: NodeSlotIdSchema,
  /** 有序，追加在尾。 */
  versions: z.array(NodeV4SlotVersionSchema).max(64),
  /** 当前版 versionId；空槽为 null。⛔ `cur` 为空且该槽必填 → 生成前置校验失败，不静默用第一版。 */
  cur: z.string().trim().min(1).max(160).nullable(),
})

/** 生成档位。与 v3 散在 data 顶层的那五个字段同值域，只是收进一个对象。 */
export const NodeV4GenerationParamsSchema = z.object({
  aspectRatio: z.string().trim().min(1).max(20).optional(),
  resolution: z.string().trim().min(1).max(20).optional(),
  duration: z.string().trim().min(1).max(20).optional(),
  generateAudio: z.boolean().optional(),
  seed: z.number().int().optional(),
})

/**
 * 四类节点共有的部分。
 *
 * ⛔ 这里**没有** `collapsed` / `parentId`：§1.3 选了「视频节点即镜头 + lane 布局」
 * 而不是容器节点，两个零消费者的桩随 v4 删除（§9.3）。镜头带是布局层按 `shotNo`
 * 派生的分组，不是数据。
 */
const NodeV4BaseShape = {
  /**
   * 稳定名（§4.2）。`S02·首帧` 式，**创建即持久化**——任何路径新建节点（手动、
   * 右键、助手 `add_node`、派生）都在同一次状态提交里写它。
   *
   * ⚠ 这条取代 v3 的七字段显示名优先链（`characterName` / `backgroundName` /
   * `shotName` / `voiceName` / `mediaLabel` / `sourceLabel` / `character.name`）与
   * `buildFallbackNodeNames` 的「显示时才编号」——那套的序号按传入列表顺序算，
   * 增删节点就重新编号，于是 `@参考视频2` 会静默指向另一个节点。
   * 改名不改 id：边、op、快照一律用 `id`。
   */
  name: z.string().trim().min(1).max(160),
  status: NodeStatusSchema.default('idle'),
  /** 镜号（1 起）。空 = 未归镜的散节点，落在镜头带下方的自由区。 */
  shotNo: z.number().int().min(1).max(999).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
  createdAt: z.string().trim().min(1).max(40),
  /**
   * 这个节点各具名槽的当前绑定（§1.4）。挂在**目标节点**上：边是事实，binding 是
   * 「这个槽当前用哪条边」的指针。空槽可以不出现在这张表里。
   */
  slots: z.partialRecord(NodeSlotIdSchema, NodeV4SlotBindingSchema).optional(),
}

export const NodeV4TextDataSchema = z.object({
  ...NodeV4BaseShape,
  kind: z.literal(NODE_MEDIA_KIND_IDS.text),
  subtype: z.enum(NODE_V4_TEXT_SUBTYPES),
  /** Markdown 正文（§2.4）。 */
  body: z.string().max(100_000),
  /**
   * 连进 `text` 槽时默认当什么用（C1 契约修正 2）。`script` 子型 → 剧本、
   * `rule` 子型 → 风格约束，两者由 `resolveTextSlotRole` 从子型推出来，这个字段
   * 只在用户/助手要覆盖时才写；连线时显式给的 `role` 仍然优先。
   */
  defaultRole: z.enum(NODE_SLOT_TEXT_ROLES).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  source: z.string().trim().min(1).max(400).optional(),
  recordedAt: z.string().trim().min(1).max(40).optional(),
})

export const NodeV4ImageDataSchema = z.object({
  ...NodeV4BaseShape,
  kind: z.literal(NODE_MEDIA_KIND_IDS.image),
  subtype: z.enum(NODE_V4_IMAGE_SUBTYPES),
  url: z.string().trim().min(1).max(4000).optional(),
  model: NodeWorkflowModelSelectionSchema.optional(),
  prompt: z.string().max(20_000).optional(),
  negativePrompt: z.string().trim().min(1).max(1000).optional(),
  params: NodeV4GenerationParamsSchema.optional(),
  sourceRef: NodeV4SourceRefSchema.optional(),
  /**
   * 该素材已判失败（§3.3 语义门）。连 `firstFrame` 被拒并给理由「该素材已判失败，
   * 不能作首帧」，与「已在槽里的停用版不能设为当前」是同一条规则的两个出口。
   */
  blocked: z.boolean().optional(),
  blockedReason: z.string().trim().min(1).max(400).optional(),
  characterName: z.string().trim().min(1).max(160).optional(),
  /**
   * 硬链到 `ContextCard`（C1 契约修正 3）。只对 `image.character` 有意义：这张角色
   * 图说的是**哪张角色卡**上的那个人。
   *
   * ⚠ 本片只加字段与形状，**不校验这张卡存不存在**——存在性是服务端 ownership 的
   * 事（K1 的表），在数据层查等于让纯 schema 依赖 DB。快照里只带卡名不带 id：id
   * 对模型无意义，还白占 token。
   */
  contextCardId: z.string().trim().min(1).max(160).optional(),
  /** 候选序号（`kf02-v5` 的 5）。⚠ 不是槽内版本——那个住在 `slots[].versions`。 */
  version: z.number().int().min(1).max(999).optional(),
  mediaReview: z.record(z.string(), NodeMediaReviewSchema).optional(),
})

export const NodeV4AudioDataSchema = z.object({
  ...NodeV4BaseShape,
  kind: z.literal(NODE_MEDIA_KIND_IDS.audio),
  subtype: z.enum(NODE_V4_AUDIO_SUBTYPES),
  /**
   * 这个节点交付的那段音频——**唯一产物**。v3 的 `voiceClipUrl` /
   * `voiceSampleUrl` / `voiceReferenceAudioUrl` 三条在迁移里合流到这里。
   */
  url: z.string().trim().min(1).max(4000).optional(),
  model: NodeWorkflowModelSelectionSchema.optional(),
  prompt: z.string().max(20_000).optional(),
  /** 这条音色属于哪个角色（v3 的 `audioOwnerName`）。⛔ 与 `name` 是两件事。 */
  ownerName: z.string().trim().min(1).max(160).optional(),
  voiceProfile: z
    .object({
      provider: z.string().trim().min(1).max(80).optional(),
      voiceId: z.string().trim().min(1).max(160).optional(),
      style: z.string().trim().min(1).max(160).optional(),
      emotion: z.string().trim().min(1).max(160).optional(),
      speed: z.number().min(0.5).max(2).optional(),
      volume: z.number().min(-20).max(20).optional(),
    })
    .optional(),
  sourceRef: NodeV4SourceRefSchema.optional(),
  cleanupMethod: z.string().trim().min(1).max(80).optional(),
  durationSec: z.number().min(0).max(36_000).optional(),
})

/**
 * 镜头标签（C1 契约修正 1）——**稳定名就是它**。
 *
 * ⚠ 换序只动 `shotNo`，⛔ 不重写名字：`shotNo` 是显示序号，`S02` 只是前缀。
 * 在这之前稳定名是 `S02·首帧` 这样一整串，于是把 S02 拖到第 5 位就要重写 `name`，
 * 而 `@` 提及把字面文本存进了提示词——换一次序，用户写下的 `@S02·有人还在` 就
 * 指向了另一个镜头。标签与序号分家之后，换序不动任何名字。
 */
export const NodeV4ShotLabelSchema = z.string().trim().min(1).max(160)

const NodeV4VideoShape = {
  ...NodeV4BaseShape,
  kind: z.literal(NODE_MEDIA_KIND_IDS.video),
  url: z.string().trim().min(1).max(4000).optional(),
  model: NodeWorkflowModelSelectionSchema.optional(),
  prompt: z.string().max(20_000).optional(),
  negativePrompt: z.string().trim().min(1).max(1000).optional(),
  videoMode: z.enum(VIDEO_NODE_MODES).optional(),
  params: NodeV4GenerationParamsSchema.optional(),
  mergeSettings: z
    .object({
      clips: z
        .array(
          z.object({
            url: z.string().trim().min(1).max(4000),
            startSec: z.number().min(0).max(600).optional(),
            endSec: z.number().min(0).max(600).optional(),
          }),
        )
        .max(9)
        .optional(),
    })
    .optional(),
  sourceRef: NodeV4SourceRefSchema.optional(),
  /** 参考片段的用途：接续 or 纯参考（`video.clip`）。 */
  clipRole: z.enum(['continuation', 'reference']).optional(),
  durationSec: z.number().min(0).max(36_000).optional(),
  mediaReview: z.record(z.string(), NodeMediaReviewSchema).optional(),
}

/**
 * 镜头。`label` **必填**——它是稳定名，`@` 名、快照行名、改名对象都是它。
 *
 * 创建时由用户 / 助手给（「有人还在」），缺省从提示词取前 8 字（`deriveShotLabel`）。
 * ⛔ 没有「先建了再补标签」这条路：无名镜头一旦落库，`@` 就只剩序号可指，而序号
 * 会随换序变——正是这条修正要修的洞。
 */
export const NodeV4VideoShotDataSchema = z.object({
  ...NodeV4VideoShape,
  subtype: z.literal(NODE_V4_VIDEO_SUBTYPE_IDS.shot),
  label: NodeV4ShotLabelSchema,
})

/** 参考片段 / 成片。标签可选：它们不进镜头带，`@` 指的是节点名。 */
export const NodeV4VideoAuxDataSchema = z.object({
  ...NodeV4VideoShape,
  subtype: z.enum([
    NODE_V4_VIDEO_SUBTYPE_IDS.clip,
    NODE_V4_VIDEO_SUBTYPE_IDS.merge,
  ]),
  label: NodeV4ShotLabelSchema.optional(),
})

export const NodeV4VideoDataSchema = z.discriminatedUnion('subtype', [
  NodeV4VideoShotDataSchema,
  NodeV4VideoAuxDataSchema,
])

export const NodeV4DataSchema = z.discriminatedUnion('kind', [
  NodeV4TextDataSchema,
  NodeV4ImageDataSchema,
  NodeV4AudioDataSchema,
  NodeV4VideoDataSchema,
])

export const NodeV4Schema = z.object({
  id: z.string().min(1).max(160),
  position: NodeWorkflowPositionSchema,
  data: NodeV4DataSchema,
  selected: z.boolean().optional(),
  dragging: z.boolean().optional(),
})

/**
 * v4 边。与 v3 的关键差异：**必须带 `slot`**。没有槽的边在 v4 里不存在——
 * 「这条边是首帧还是参考」不再靠下游收割逻辑猜。
 */
export const NodeWorkflowEdgeV4Schema = z.object({
  id: z.string().min(1).max(160),
  source: z.string().min(1).max(160),
  /** 出口 handle。`tailFrame` = 接续镜（S02 末帧 → S03 首帧）。默认 `out`。 */
  sourceHandle: NodeSlotOutputSchema.default(NODE_SLOT_OUTPUT_IDS.out),
  target: z.string().min(1).max(160),
  slot: NodeSlotIdSchema,
  data: NodeWorkflowEdgeDataSchema.optional().catch(undefined),
})

/**
 * v4 整图。`version: 4` 是硬门：读到 `version !== 4` **直接抛错并阻止写入**
 * （§9.2 第 4 条），⛔ 不是兜成空状态——静默清空那条路在 v4 里彻底封死。
 *
 * ⚠ `nodes` 逐项**没有** `.catch()`，与 v3 同：一个坏节点应当让整份 parse 失败并
 * 被上游当成错误报出来，而不是悄悄少一个节点。区别在 v4 的读路径不再把 parse
 * 失败翻译成空状态。
 */
export const NodeWorkflowStateV4Schema = z.object({
  version: z.literal(4),
  nodes: z.array(NodeV4Schema),
  edges: z.array(NodeWorkflowEdgeV4Schema),
  scriptDoc: ScriptDocSchema.optional().catch(undefined),
  canvasAppearance: CanvasAppearanceSchema.optional().catch(undefined),
  scriptDocStage: z.enum(SCRIPT_DOC_STAGES).optional().catch(undefined),
  scriptDocDepth: z.enum(SCRIPT_DOC_DEPTHS).optional().catch(undefined),
  scriptDocLocks: z.array(z.string()).optional().catch(undefined),
  scriptDocShotStills: z.boolean().optional().catch(undefined),
})

export type NodeV4SourceRef = z.infer<typeof NodeV4SourceRefSchema>
export type NodeV4SlotVersion = z.infer<typeof NodeV4SlotVersionSchema>
export type NodeV4SlotBinding = z.infer<typeof NodeV4SlotBindingSchema>
export type NodeV4GenerationParams = z.infer<
  typeof NodeV4GenerationParamsSchema
>
export type NodeV4TextData = z.infer<typeof NodeV4TextDataSchema>
export type NodeV4ImageData = z.infer<typeof NodeV4ImageDataSchema>
export type NodeV4AudioData = z.infer<typeof NodeV4AudioDataSchema>
export type NodeV4VideoShotData = z.infer<typeof NodeV4VideoShotDataSchema>
export type NodeV4VideoAuxData = z.infer<typeof NodeV4VideoAuxDataSchema>
export type NodeV4VideoData = z.infer<typeof NodeV4VideoDataSchema>
export type NodeV4Data = z.infer<typeof NodeV4DataSchema>
export type NodeV4 = z.infer<typeof NodeV4Schema>
export type NodeWorkflowEdgeV4 = z.infer<typeof NodeWorkflowEdgeV4Schema>
export type NodeWorkflowStateV4 = z.infer<typeof NodeWorkflowStateV4Schema>

/**
 * v3 备份（node-canvas-v2 §9.2 · owner 拍板「画-3」）。
 *
 * 逐项目惰性升级的顺序纪律：**备份成功才允许写 v4**。备份失败 → 不升级、不写、
 * 报错可见。⛔ 没有「先写了再补备份」这条路。
 */
export const NodeWorkflowV3BackupRequestSchema = z.object({
  /** 幂等提示：同一次升级重试时带上，服务端仍按时间戳新建 key（不覆盖旧备份）。 */
  reason: z.string().trim().min(1).max(200).optional(),
})

export const NodeWorkflowV3BackupResultSchema = z.object({
  key: z.string(),
  url: z.string(),
  /** 备份下来的 v3 图规模——用来和升级后的 v4 对账。 */
  nodeCount: z.number().int().min(0),
  edgeCount: z.number().int().min(0),
})

export type NodeWorkflowV3BackupRequest = z.infer<
  typeof NodeWorkflowV3BackupRequestSchema
>
export type NodeWorkflowV3BackupResult = z.infer<
  typeof NodeWorkflowV3BackupResultSchema
>

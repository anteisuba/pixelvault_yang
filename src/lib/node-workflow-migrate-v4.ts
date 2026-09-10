/**
 * v3 → v4 的**纯迁移函数**（node-canvas-v2 §9.2 / §9.3）。
 *
 * ⚠ 这里住着**唯一**一份 v3→v4 的映射：C2 的逐项目惰性升级（画布加载到
 * `version !== 4` 时在内存里迁移，首次保存即升级）与 C3 的批量回填脚本
 * （`scripts/migrate-node-workflow-v4.ts`）调的是同一个函数，结果必须一致。
 * ⛔ 不许任何一方自己再写一份映射。
 *
 * ── 顺序纪律（⚠ 不能反）──────────────────────────────────────────────────
 * `NodeWorkflowStateSchema.nodes` 是 `z.array()` **无逐项 `.catch()`**：先删 legacy
 * enum 再迁移 = 存量项目整份 parse 失败 → `validateState` 兜成空状态 → 用户看到
 * 空画布且静默无报错 → 下一次防抖写入把空状态持久化，不可恢复。所以
 * **回填跑完并验证之后**才删 v3 schema / enum / 两条读路径垫片。
 *
 * ── 迁移保险 = R2 自动备份（owner 拍板「画-3」）──────────────────────────
 * 对**每一个**项目的第一步就是把 v3 的 `state` 原样传上 R2，**传成功才继续改写**，
 * 失败即中止该项目并计入失败清单。⛔ 不做影子字段 `state_v4`、不做 diff 报告等
 * owner 过目、不做「导出为 v3」按钮——三样都是给一次性脚本加 UI。
 * key 自己拼（`generateStorageKey` 只认四种 outputType，装不下备份 JSON）：
 *   `backups/node-workflow-v3/<projectId>/<ISO8601>.json`，同项目重跑不互相覆盖。
 *
 * ⛔ **本片（C1）只写脚本与 dry-run，不执行、不写库、不跑迁移。**
 */

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELDS_BY_NODE_TYPE,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import {
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  NODE_SLOT_TEXT_ROLE_IDS,
  getNodeV4Slot,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_STUDIO_IMAGE_OUTPUT_SOURCES,
  NODE_STUDIO_KEYFRAME_REFERENCE_ROLES,
  NODE_V4_SUBTYPE_LABELS,
} from '@/constants/node-studio'
import {
  buildShotLabel,
  buildStableNodeName,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import {
  buildOutputsFromLegacy,
  isMediaNodeData,
} from '@/lib/node-output-versions'
import {
  composeShotTextBody,
  getNodeWorkflowFieldValue,
} from '@/lib/node-workflow-prompt'
import {
  NodeWorkflowStateV4Schema,
  type NodeV4,
  type NodeV4Data,
  type NodeWorkflowEdgeV4,
  type NodeWorkflowImageOutputSource,
  type NodeWorkflowNodeData,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

/* ── 输入形状 ───────────────────────────────────────────────────────────
 * ⚠ 故意**不**用 `NodeWorkflowStateDataSchema` 去 parse 输入：存量 state 里正躺着
 * 迁移要处理的那些坏形状，先 parse 一遍等于让 v3 schema 决定哪些数据能被看见。
 * 脚本按 `unknown` 读，自己判。
 */
interface V3Node {
  id: string
  type: string
  position: { x: number; y: number }
  data: Partial<NodeWorkflowNodeData> & Record<string, unknown>
}

interface V3Edge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: Record<string, unknown>
}

export interface V3State {
  nodes?: V3Node[]
  edges?: V3Edge[]
  scriptDoc?: {
    shots?: { id: string; dialogue?: { id: string }[] }[]
  } & Record<string, unknown>
  [key: string]: unknown
}

export interface MigrationStats {
  nodesIn: number
  nodesOut: number
  /** composer / agent —— 整节点剥除（§9.3，等价于现状 planner 垫片的行为）。 */
  droppedRetiredNodes: number
  edgesIn: number
  edgesOut: number
  /** 两端有一端被剥除、或槽推不出合法值 → 边丢弃。 */
  droppedEdges: number
  /** 按 legacy type 计的映射账目。 */
  bySourceType: Record<string, number>
  /** 按 `kind.subtype` 计的产出账目。 */
  byTarget: Record<string, number>
  /** 按槽计的边账目。 */
  bySlot: Record<string, number>
}

const RETIRED_TYPES: ReadonlySet<string> = new Set([
  NODE_TYPE_IDS.composer,
  NODE_TYPE_IDS.agent,
])

interface V4Identity {
  kind: NodeWorkflowMediaKind
  subtype: NodeV4Subtype
  /** 这个节点连出去的边默认落哪个槽（`frameImage` → 首帧、`closeup` → 特写）。 */
  preferredSlot?: NodeSlotId
}

/** §9.3 处置表。返回 `null` = 整节点剥除。 */
export function resolveV4Identity(node: V3Node): V4Identity | null {
  const { image, text, audio, video } = NODE_MEDIA_KIND_IDS
  if (RETIRED_TYPES.has(node.type)) return null

  switch (node.type) {
    case NODE_TYPE_IDS.shotText:
      return {
        kind: text,
        subtype:
          node.data.scriptRef !== undefined
            ? NODE_V4_TEXT_SUBTYPE_IDS.shotNote
            : NODE_V4_TEXT_SUBTYPE_IDS.script,
      }
    case NODE_TYPE_IDS.shot:
      return { kind: image, subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot }
    case NODE_TYPE_IDS.characterImage:
      return { kind: image, subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character }
    case NODE_TYPE_IDS.backgroundImage:
      return { kind: image, subtype: NODE_V4_IMAGE_SUBTYPE_IDS.background }
    case NODE_TYPE_IDS.frameImage:
      // 「首帧」是**槽义不是身份**（§1.1）：节点降为普通镜头图，帧义搬到边的槽上。
      return {
        kind: image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        preferredSlot: NODE_SLOT_IDS.firstFrame,
      }
    case NODE_TYPE_IDS.image:
      return resolveUnifiedImageIdentity(node)
    case NODE_TYPE_IDS.voice:
      return { kind: audio, subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice }
    case NODE_TYPE_IDS.seedance:
      return { kind: video, subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot }
    case NODE_TYPE_IDS.videoReference:
      return { kind: video, subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip }
    case NODE_TYPE_IDS.videoMerge:
      return { kind: video, subtype: NODE_V4_VIDEO_SUBTYPE_IDS.merge }
    default:
      // 未知 type：当作散图落 result，而不是丢掉一个用户还看得见的节点。
      return { kind: image, subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result }
  }
}

function resolveUnifiedImageIdentity(node: V3Node): V4Identity {
  const role = node.data.role
  switch (role) {
    case NODE_IMAGE_ROLE_IDS.character:
      return {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
      }
    case NODE_IMAGE_ROLE_IDS.background:
      return {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.background,
      }
    case NODE_IMAGE_ROLE_IDS.shot:
      return {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
      }
    case NODE_IMAGE_ROLE_IDS.frame:
      return {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
        preferredSlot: NODE_SLOT_IDS.firstFrame,
      }
    case NODE_IMAGE_ROLE_IDS.closeup:
      return {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
        preferredSlot: NODE_SLOT_IDS.closeup,
      }
    default:
      // role 缺失 → result（§9.3）。
      return {
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
      }
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

/**
 * ScriptDoc 里镜头的排序 = 镜号。没有 `scriptRef` 的节点无镜号（散节点）。
 *
 * ⚠ C3c-① A 迁移缺口②：**台词也进这张表**。音色节点的 `scriptRef.sourceId` 存的
 * 是**台词 id**（投影时一条台词一个音色节点），不是镜头 id —— 只按 `shot.id` 建
 * 索引的话，整张图里所有音色节点的 `shotNo` 全为空，于是它们落到镜头带下方的
 * 自由区，用户看到的是「音色全掉出镜头了」。台词映到它所属镜头的镜号。
 */
function buildShotNoIndex(state: V3State): Map<string, number> {
  const index = new Map<string, number>()
  const shots = state.scriptDoc?.shots ?? []
  shots.forEach((shot, position) => {
    const shotNo = position + 1
    index.set(shot.id, shotNo)
    for (const line of shot.dialogue ?? []) {
      if (line?.id) index.set(line.id, shotNo)
    }
  })
  return index
}

function resolveShotNo(
  node: V3Node,
  shotIndex: ReadonlyMap<string, number>,
): number | undefined {
  const ref = node.data.scriptRef
  if (!ref || typeof ref !== 'object') return undefined
  const sourceId = readString((ref as { sourceId?: unknown }).sourceId)
  if (!sourceId) return undefined
  return shotIndex.get(sourceId)
}

/**
 * 一条 v3 边的槽（§9.2：按旧的 `referenceAssets[].role` 与目标类型推导，推不出来
 * 的落 `reference`）。返回 `null` = 这条边在 v4 里没有合法落点，丢弃并计数。
 */
export function resolveEdgeSlot(
  sourceIdentity: V4Identity,
  targetIdentity: V4Identity,
  sourceNode: V3Node,
): NodeSlotId | null {
  const has = (slot: NodeSlotId): boolean =>
    getNodeV4Slot(targetIdentity.kind, targetIdentity.subtype, slot) !==
    undefined

  // 文本节点的入口只有 source（「从这些素材写文本」）。
  if (targetIdentity.kind === NODE_MEDIA_KIND_IDS.text) {
    return has(NODE_SLOT_IDS.source) ? NODE_SLOT_IDS.source : null
  }

  // `imageCategory` 的 frameStart / frameEnd 是关键帧首尾语义的唯一载体（造关键帧
  // 的入口 2026-08-09 退役后）——它们在 v4 里变成边的槽，字段本身随之消失（§9.3）。
  const [frameStart, frameEnd] = NODE_STUDIO_KEYFRAME_REFERENCE_ROLES
  const category = sourceNode.data.imageCategory
  if (category === frameEnd && has(NODE_SLOT_IDS.lastFrame)) {
    return NODE_SLOT_IDS.lastFrame
  }
  if (category === frameStart && has(NODE_SLOT_IDS.firstFrame)) {
    return NODE_SLOT_IDS.firstFrame
  }
  if (
    sourceIdentity.preferredSlot !== undefined &&
    has(sourceIdentity.preferredSlot)
  ) {
    return sourceIdentity.preferredSlot
  }

  switch (sourceIdentity.kind) {
    case NODE_MEDIA_KIND_IDS.text:
      return has(NODE_SLOT_IDS.text) ? NODE_SLOT_IDS.text : null
    case NODE_MEDIA_KIND_IDS.audio:
      if (has(NODE_SLOT_IDS.voice)) return NODE_SLOT_IDS.voice
      return has(NODE_SLOT_IDS.timbre) ? NODE_SLOT_IDS.timbre : null
    case NODE_MEDIA_KIND_IDS.video:
      if (has(NODE_SLOT_IDS.clip)) return NODE_SLOT_IDS.clip
      return has(NODE_SLOT_IDS.reference) ? NODE_SLOT_IDS.reference : null
    default:
      return has(NODE_SLOT_IDS.reference) ? NODE_SLOT_IDS.reference : null
  }
}

/**
 * 上传 / 生成回填的媒体元数据（C3c-① A）。v3 把它们散在 data 顶层，v4 收进
 * `NodeV4MediaMetaShape`（image / audio / video 三类共用一份形状）。
 *
 * ⚠ 这一段在此之前是**断的**：`/api/node-workflow/upload-reference-video` 回填的
 * `videoThumbnailUrl` / `sizeBytes` / `mediaWidth` / `mediaHeight` 在 v4 schema 里
 * 没有落点，迁移一跑视频 poster、文件大小、W×H 读数与「已有图/生成图」角标就
 * 全部静默消失。
 */
function readMediaMeta(node: V3Node): {
  videoThumbnailUrl?: string
  sizeBytes?: number
  mediaWidth?: number
  mediaHeight?: number
  imageSource?: NodeWorkflowImageOutputSource
} {
  const positiveInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : undefined
  const size =
    typeof node.data.sizeBytes === 'number' &&
    Number.isInteger(node.data.sizeBytes) &&
    node.data.sizeBytes >= 0
      ? node.data.sizeBytes
      : undefined
  const source = NODE_STUDIO_IMAGE_OUTPUT_SOURCES.find(
    (candidate) => candidate === node.data.imageSource,
  )
  return {
    ...(readString(node.data.videoThumbnailUrl)
      ? { videoThumbnailUrl: readString(node.data.videoThumbnailUrl) }
      : {}),
    ...(size === undefined ? {} : { sizeBytes: size }),
    ...(positiveInt(node.data.mediaWidth) === undefined
      ? {}
      : { mediaWidth: positiveInt(node.data.mediaWidth) }),
    ...(positiveInt(node.data.mediaHeight) === undefined
      ? {}
      : { mediaHeight: positiveInt(node.data.mediaHeight) }),
    ...(source ? { imageSource: source } : {}),
  }
}

function buildNodeData(
  node: V3Node,
  identity: V4Identity,
  name: string,
  shotNo: number | undefined,
  createdAt: string,
  /** 镜头标签（C1 契约修正 1）。只有 `video.shot` 必须带；其余 kind 忽略。 */
  label: string,
): NodeV4Data {
  const base = {
    name,
    status: node.data.status ?? 'idle',
    ...(shotNo === undefined ? {} : { shotNo }),
    ...(readString(node.data.note) ? { note: readString(node.data.note) } : {}),
    createdAt,
  }
  const media =
    readString(node.data.mediaUrl) ??
    readString(node.data.imageUrl) ??
    readString(node.data.videoUrl)
  const mediaMeta = readMediaMeta(node)
  const params = {
    ...(readString(node.data.aspectRatio)
      ? { aspectRatio: readString(node.data.aspectRatio) }
      : {}),
    ...(readString(node.data.resolution)
      ? { resolution: readString(node.data.resolution) }
      : {}),
    ...(readString(node.data.duration)
      ? { duration: readString(node.data.duration) }
      : {}),
    ...(typeof node.data.generateAudio === 'boolean'
      ? { generateAudio: node.data.generateAudio }
      : {}),
    ...(typeof node.data.seed === 'number' ? { seed: node.data.seed } : {}),
  }
  const hasParams = Object.keys(params).length > 0

  switch (identity.kind) {
    case NODE_MEDIA_KIND_IDS.text:
      return {
        ...base,
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: identity.subtype as 'script' | 'shotNote' | 'rule',
        // C3c-① A 迁移缺口①：v3 的 `shotText` 正文住在 scene / action / camera /
        // composition **四栏**里，`prompt` 在这类节点上通常是空的 —— 之前只读
        // `prompt` 等于把整段镜头文字迁没了。合成走与投影 / v3 送模型同一份
        // `composeShotTextBody`，顺序取自 `NODE_WORKFLOW_FIELDS_BY_NODE_TYPE`。
        body:
          composeShotTextBody(
            (
              NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[NODE_TYPE_IDS.shotText] ?? []
            ).map((fieldId) =>
              getNodeWorkflowFieldValue(
                node.data as NodeWorkflowNodeData,
                fieldId,
              ),
            ),
          ) ||
          readString(node.data.prompt) ||
          '',
        // v3 的 `shotText` 连进镜头的那条边一律是剧本（C1 契约修正 2）——v3 里
        // 根本没有「风格约束 / 角色描述」这两档，把它们猜出来就是编数据。
        defaultRole: NODE_SLOT_TEXT_ROLE_IDS.script,
      } as NodeV4Data
    case NODE_MEDIA_KIND_IDS.audio:
      return {
        ...base,
        kind: NODE_MEDIA_KIND_IDS.audio,
        subtype: identity.subtype as 'voice' | 'ambience',
        ...mediaMeta,
        // 三条 deprecated 字段在迁移里合流后删除——一次性回填不受「读路径先 parse
        // 后 migrate」那条约束（那正是它们今天不能删的唯一原因）。
        ...((readString(node.data.voiceClipUrl) ??
        readString(node.data.voiceSampleUrl) ??
        readString(node.data.voiceReferenceAudioUrl))
          ? {
              url:
                readString(node.data.voiceClipUrl) ??
                readString(node.data.voiceSampleUrl) ??
                readString(node.data.voiceReferenceAudioUrl),
            }
          : {}),
        ...(node.data.model ? { model: node.data.model } : {}),
        ...(readString(node.data.audioOwnerName)
          ? { ownerName: readString(node.data.audioOwnerName) }
          : {}),
      } as NodeV4Data
    case NODE_MEDIA_KIND_IDS.video:
      return {
        ...base,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: identity.subtype as 'shot' | 'clip' | 'merge',
        ...mediaMeta,
        label,
        ...(media ? { url: media } : {}),
        ...(node.data.model ? { model: node.data.model } : {}),
        ...(readString(node.data.prompt)
          ? { prompt: readString(node.data.prompt) }
          : {}),
        ...(readString(node.data.negativePrompt)
          ? { negativePrompt: readString(node.data.negativePrompt) }
          : {}),
        ...(node.data.videoMode ? { videoMode: node.data.videoMode } : {}),
        ...(node.data.mergeSettings
          ? { mergeSettings: node.data.mergeSettings }
          : {}),
        ...(hasParams ? { params } : {}),
      } as NodeV4Data
    default:
      return {
        ...base,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: identity.subtype as
          | 'character'
          | 'background'
          | 'shot'
          | 'reference'
          | 'result',
        ...mediaMeta,
        ...(media ? { url: media } : {}),
        ...(node.data.model ? { model: node.data.model } : {}),
        ...(readString(node.data.prompt)
          ? { prompt: readString(node.data.prompt) }
          : {}),
        ...(readString(node.data.negativePrompt)
          ? { negativePrompt: readString(node.data.negativePrompt) }
          : {}),
        ...(readString(node.data.characterName)
          ? { characterName: readString(node.data.characterName) }
          : {}),
        ...(hasParams ? { params } : {}),
      } as NodeV4Data
  }
}

/**
 * 存量的单 `url` → `outputs.versions[0]`（S3b §1.8）。
 *
 * ⚠ 迁移里回填不是为了「能读出来」—— 读侧 `readOutputVersions` 本来就把裸 `url`
 * 当一版。⭐ 是为了让**下一次生成**追加时有一张表可追加：没有表的话
 * `appendOutputVersion` 只能从 legacy 那一版重建，而那一版没有铸过 id。
 */
function withLegacyOutputs(data: NodeV4Data): NodeV4Data {
  if (!isMediaNodeData(data)) return data
  const outputs = buildOutputsFromLegacy(data)
  return outputs ? ({ ...data, outputs } as NodeV4Data) : data
}

export interface MigrationResult {
  state: NodeWorkflowStateV4
  stats: MigrationStats
}

/**
 * v3 整图 → v4 整图。**纯函数**：不碰 DB、不碰 R2、不读时钟以外的东西。
 * `now` 可注入，让单测的 `createdAt` 可断言。
 */
export function migrateNodeWorkflowStateToV4(
  input: V3State,
  options: { now?: string } = {},
): MigrationResult {
  const createdAt = options.now ?? new Date().toISOString()
  const nodesIn = input.nodes ?? []
  const edgesIn = input.edges ?? []
  const shotIndex = buildShotNoIndex(input)

  const stats: MigrationStats = {
    nodesIn: nodesIn.length,
    nodesOut: 0,
    droppedRetiredNodes: 0,
    edgesIn: edgesIn.length,
    edgesOut: 0,
    droppedEdges: 0,
    bySourceType: {},
    byTarget: {},
    bySlot: {},
  }

  const identities = new Map<string, V4Identity>()
  const nodes: NodeV4[] = []
  const taken = new Set<string>()
  const takenLabels = new Set<string>()

  for (const node of nodesIn) {
    stats.bySourceType[node.type] = (stats.bySourceType[node.type] ?? 0) + 1
    const identity = resolveV4Identity(node)
    if (!identity) {
      stats.droppedRetiredNodes += 1
      continue
    }
    identities.set(node.id, identity)
    const shotNo = resolveShotNo(node, shotIndex)
    const name = buildStableNodeName(
      {
        kind: identity.kind,
        subtype: identity.subtype,
        shotNo,
        properName: resolveNodeDisplayName(node.data as NodeWorkflowNodeData),
      },
      {
        labelOf: (kind, subtype) =>
          NODE_V4_SUBTYPE_LABELS[`${kind}.${subtype}`] ?? subtype,
        taken,
      },
    )
    taken.add(name)
    // 镜头标签（C1 契约修正 1）：v3 没有这个字段，按 title → 提示词前 8 字 →
    // `镜头` 兜底。⚠ 标签与显示名分家之后，这里算出来的才是 `@` 认的那个名字。
    const label = buildShotLabel(
      {
        given:
          readString(node.data.shotName) ??
          resolveNodeDisplayName(node.data as NodeWorkflowNodeData),
        prompt: readString(node.data.prompt),
      },
      takenLabels,
    )
    takenLabels.add(label)
    nodes.push({
      id: node.id,
      position: node.position,
      data: withLegacyOutputs(
        buildNodeData(node, identity, name, shotNo, createdAt, label),
      ),
    })
    const key = `${identity.kind}.${identity.subtype}`
    stats.byTarget[key] = (stats.byTarget[key] ?? 0) + 1
  }
  stats.nodesOut = nodes.length

  const nodeById = new Map(nodesIn.map((node) => [node.id, node]))
  const edges: NodeWorkflowEdgeV4[] = []
  for (const edge of edgesIn) {
    const sourceIdentity = identities.get(edge.source)
    const targetIdentity = identities.get(edge.target)
    const sourceNode = nodeById.get(edge.source)
    if (!sourceIdentity || !targetIdentity || !sourceNode) {
      stats.droppedEdges += 1
      continue
    }
    const slot = resolveEdgeSlot(sourceIdentity, targetIdentity, sourceNode)
    if (!slot) {
      stats.droppedEdges += 1
      continue
    }
    edges.push({
      id: edge.id,
      source: edge.source,
      sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
      target: edge.target,
      slot,
      ...(edge.data ? { data: edge.data } : {}),
    })
    stats.bySlot[slot] = (stats.bySlot[slot] ?? 0) + 1
  }
  stats.edgesOut = edges.length

  const state = NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes,
    edges,
    ...(input.scriptDoc ? { scriptDoc: input.scriptDoc } : {}),
    ...(input.canvasAppearance
      ? { canvasAppearance: input.canvasAppearance }
      : {}),
    ...(input.scriptDocStage ? { scriptDocStage: input.scriptDocStage } : {}),
    ...(input.scriptDocDepth ? { scriptDocDepth: input.scriptDocDepth } : {}),
    ...(input.scriptDocLocks ? { scriptDocLocks: input.scriptDocLocks } : {}),
    ...(typeof input.scriptDocShotStills === 'boolean'
      ? { scriptDocShotStills: input.scriptDocShotStills }
      : {}),
  })

  return { state, stats }
}

/** 备份 key。同项目重跑不互相覆盖（§9.2）。 */
export function buildV3BackupKey(projectId: string, at: Date): string {
  return `backups/node-workflow-v3/${projectId}/${at.toISOString()}.json`
}

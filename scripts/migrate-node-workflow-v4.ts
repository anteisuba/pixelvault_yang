/**
 * 一次性回填：`NodeWorkflowProject.state` v3 → v4（node-canvas-v2 §9.2 / §9.3）。
 *
 * Usage:
 *   npx tsx scripts/migrate-node-workflow-v4.ts --dry-run   # 只打印 diff 统计，不写库
 *   npx tsx scripts/migrate-node-workflow-v4.ts             # 真跑（C3，本片不执行）
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
  getNodeV4Slot,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_STUDIO_KEYFRAME_REFERENCE_ROLES,
  NODE_V4_SUBTYPE_LABELS,
} from '@/constants/node-studio'
import {
  buildStableNodeName,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import {
  NodeWorkflowStateV4Schema,
  type NodeV4,
  type NodeV4Data,
  type NodeWorkflowEdgeV4,
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
  scriptDoc?: { shots?: { id: string }[] } & Record<string, unknown>
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

/** ScriptDoc 里镜头的排序 = 镜号。没有 `scriptRef` 的节点无镜号（散节点）。 */
function buildShotNoIndex(state: V3State): Map<string, number> {
  const index = new Map<string, number>()
  const shots = state.scriptDoc?.shots ?? []
  shots.forEach((shot, position) => {
    index.set(shot.id, position + 1)
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

function buildNodeData(
  node: V3Node,
  identity: V4Identity,
  name: string,
  shotNo: number | undefined,
  createdAt: string,
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
        body: readString(node.data.prompt) ?? '',
      } as NodeV4Data
    case NODE_MEDIA_KIND_IDS.audio:
      return {
        ...base,
        kind: NODE_MEDIA_KIND_IDS.audio,
        subtype: identity.subtype as 'voice' | 'ambience',
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
    nodes.push({
      id: node.id,
      position: node.position,
      data: buildNodeData(node, identity, name, shotNo, createdAt),
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

/* ── CLI ────────────────────────────────────────────────────────────────
 * 只有 dry-run 在本片可用。真跑（备份 → 改写 → 就地校验 → 不等即回滚）是 C3，
 * 那时才接 Prisma 与 `uploadToR2`。
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  if (!dryRun) {
    console.error(
      '[migrate-v4] ⛔ 真跑属于 C3（含 R2 备份与就地校验回滚）。本片只提供 --dry-run。',
    )
    process.exitCode = 1
    return
  }

  const dotenv = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  const { PrismaClient } = await import('../src/lib/generated/prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })

  const projects = await prisma.nodeWorkflowProject.findMany({
    select: { id: true, name: true, state: true },
  })
  const totals: MigrationStats = {
    nodesIn: 0,
    nodesOut: 0,
    droppedRetiredNodes: 0,
    edgesIn: 0,
    edgesOut: 0,
    droppedEdges: 0,
    bySourceType: {},
    byTarget: {},
    bySlot: {},
  }
  const failures: { id: string; error: string }[] = []

  for (const project of projects) {
    try {
      const { stats } = migrateNodeWorkflowStateToV4(
        (project.state ?? {}) as V3State,
      )
      totals.nodesIn += stats.nodesIn
      totals.nodesOut += stats.nodesOut
      totals.droppedRetiredNodes += stats.droppedRetiredNodes
      totals.edgesIn += stats.edgesIn
      totals.edgesOut += stats.edgesOut
      totals.droppedEdges += stats.droppedEdges
      for (const [key, count] of Object.entries(stats.bySourceType)) {
        totals.bySourceType[key] = (totals.bySourceType[key] ?? 0) + count
      }
      for (const [key, count] of Object.entries(stats.byTarget)) {
        totals.byTarget[key] = (totals.byTarget[key] ?? 0) + count
      }
      for (const [key, count] of Object.entries(stats.bySlot)) {
        totals.bySlot[key] = (totals.bySlot[key] ?? 0) + count
      }
      console.log(
        `[migrate-v4] ${project.id} nodes ${stats.nodesIn}→${stats.nodesOut} (剥除 ${stats.droppedRetiredNodes}) · edges ${stats.edgesIn}→${stats.edgesOut} (丢弃 ${stats.droppedEdges})`,
      )
    } catch (error) {
      failures.push({
        id: project.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log('\n[migrate-v4] 汇总（dry-run，未写库）')
  console.log(JSON.stringify(totals, null, 2))
  if (failures.length > 0) {
    console.error(`\n[migrate-v4] 失败清单 ${failures.length} 项`)
    console.error(JSON.stringify(failures, null, 2))
    process.exitCode = 1
  }
  await prisma.$disconnect()
}

// tsx 直跑时才执行；被单测 import 时不跑。
if (process.argv[1]?.endsWith('migrate-node-workflow-v4.ts')) {
  void main()
}

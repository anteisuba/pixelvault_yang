/**
 * v4 ⇄ v3 视图（第三期 · 画布 C3c-③c）。
 *
 * ── ⚠ 这是迁移顺序里的一步，不是兼容层，③d 翻转后整个文件删 ────────────
 * ③c 把**存储**翻到 v4：hook 持有的是 `NodeWorkflowStateV4`，写库写的也是 v4。
 * 但画布组件（`NODE_COMPONENTS` 那十来个 v3 卡）还没换，所以 v3 引擎需要一份
 * v3 形状的**只读投影**来渲染，它的写入再折回 v4。两个方向各一个函数：
 *
 *   `projectV4ToV3View(v4, previousV3?)`  v4 事实 → v3 视图（渲染用）
 *   `writeV3ViewBackToV4(v3, baseV4)`     v3 视图的改动 → v4（唯一写入口的下半截）
 *
 * ── 为什么不是「每次改动重跑 migrate」──────────────────────────────────
 * `migrateNodeWorkflowStateToV4` 会**重算** `name` / `label` / `createdAt` /
 * `shotNo`，并且把四栏镜头文本压成一段 `body` —— 拿它当写回口，用户每敲一个字
 * 都会让全图的稳定名和镜号重新洗一遍，`@` 提及当场指错节点。所以写回是**逐字段
 * 覆盖**：以 v4 那份为底，只写下面这张映射表里的字段，v4 独有的
 * （`slots` / `sourceRef` / `shotNo` / `createdAt` / `contextCardId` …）原样留着。
 * migrate 只在**新增节点**上跑（这个 id 在 v4 里根本不存在，没有底可以留）。
 *
 * ── `previousV3` 是什么 ────────────────────────────────────────────────
 * v3 有一批字段 v4 里没有落点（`scriptRef` / `referenceAssets` / `loras` /
 * `imageCategory` …）。投影时从上一份 v3 视图（首次投影时 = 服务端读到的那份
 * v3 原件）把它们**原样带过来**，否则 v3 画布上的剧本投影会因为 `scriptRef` 丢
 * 失而重复建节点。⚠ 这些字段**不落库**（v4 schema 里没有它们），刷新即失 ——
 * 这是 ③c 已知的窗口期损耗，③d 之后 v3 引擎整段退场，问题随之消失。
 */

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import {
  resolveNodeDisplayName,
  toNodeDisplayLabel,
} from '@/lib/node-display-name'
import {
  migrateNodeWorkflowStateToV4,
  resolveEdgeSlot,
  resolveV4Identity,
} from '@/lib/node-workflow-migrate-v4'
import {
  NodeWorkflowStateV4Schema,
  type NodeV4,
  type NodeV4Data,
  type NodeWorkflowEdge,
  type NodeWorkflowEdgeV4,
  type NodeWorkflowNode,
  type NodeWorkflowNodeData,
  type NodeWorkflowState,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

/**
 * 投影**总是**写（或删）的 v3 字段。⚠ 与 `previousV3` 残留合并时这些键必须先被
 * 清掉：留着上一轮的 `scene` / `mediaUrl` 就等于让残留盖过 v4 的事实。
 */
const MAPPED_V3_KEYS = [
  'status',
  'note',
  'mediaKind',
  'role',
  'mediaUrl',
  'imageUrl',
  'videoUrl',
  'voiceClipUrl',
  'model',
  'prompt',
  'negativePrompt',
  'characterName',
  'backgroundName',
  'shotName',
  'voiceName',
  'mediaLabel',
  'sourceLabel',
  'audioOwnerName',
  'videoMode',
  'mergeSettings',
  'mediaReview',
  'videoThumbnailUrl',
  'sizeBytes',
  'mediaWidth',
  'mediaHeight',
  'imageSource',
  'aspectRatio',
  'resolution',
  'duration',
  'generateAudio',
  'seed',
  NODE_WORKFLOW_FIELD_IDS.scene,
  NODE_WORKFLOW_FIELD_IDS.action,
  NODE_WORKFLOW_FIELD_IDS.camera,
  NODE_WORKFLOW_FIELD_IDS.composition,
] as const

function defined<T extends Record<string, unknown>>(input: T): T {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) next[key] = value
  }
  return next as T
}

function residueOf(
  previous: NodeWorkflowNodeData | undefined,
): Record<string, unknown> {
  if (!previous) return {}
  const next: Record<string, unknown> = { ...previous }
  for (const key of MAPPED_V3_KEYS) delete next[key]
  return next
}

function v3TypeAndRole(data: NodeV4Data): {
  type: NodeWorkflowNodeType
  role?: string
} {
  switch (data.kind) {
    case NODE_MEDIA_KIND_IDS.text:
      return { type: NODE_TYPE_IDS.shotText }
    case NODE_MEDIA_KIND_IDS.audio:
      return { type: NODE_TYPE_IDS.voice }
    case NODE_MEDIA_KIND_IDS.video:
      return {
        type:
          data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
            ? NODE_TYPE_IDS.seedance
            : data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.clip
              ? NODE_TYPE_IDS.videoReference
              : NODE_TYPE_IDS.videoMerge,
      }
    default:
      switch (data.subtype) {
        case NODE_V4_IMAGE_SUBTYPE_IDS.character:
          return {
            type: NODE_TYPE_IDS.image,
            role: NODE_IMAGE_ROLE_IDS.character,
          }
        case NODE_V4_IMAGE_SUBTYPE_IDS.background:
          return {
            type: NODE_TYPE_IDS.image,
            role: NODE_IMAGE_ROLE_IDS.background,
          }
        case NODE_V4_IMAGE_SUBTYPE_IDS.shot:
          return { type: NODE_TYPE_IDS.image, role: NODE_IMAGE_ROLE_IDS.shot }
        case NODE_V4_IMAGE_SUBTYPE_IDS.reference:
          return {
            type: NODE_TYPE_IDS.image,
            role: NODE_IMAGE_ROLE_IDS.closeup,
          }
        default:
          // `result` = 没有 role 的散图（§9.3 的反向）。
          return { type: NODE_TYPE_IDS.image }
      }
  }
}

function paramsToV3(data: NodeV4Data): Record<string, unknown> {
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return {}
  if (data.kind === NODE_MEDIA_KIND_IDS.audio) return {}
  return defined({
    aspectRatio: data.params?.aspectRatio,
    resolution: data.params?.resolution,
    duration: data.params?.duration,
    generateAudio: data.params?.generateAudio,
    seed: data.params?.seed,
  })
}

function mediaMetaToV3(data: NodeV4Data): Record<string, unknown> {
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return {}
  return defined({
    videoThumbnailUrl: data.videoThumbnailUrl,
    sizeBytes: data.sizeBytes,
    mediaWidth: data.mediaWidth,
    mediaHeight: data.mediaHeight,
    imageSource: data.imageSource,
  })
}

function v3DataOf(
  data: NodeV4Data,
  previous: NodeWorkflowNodeData | undefined,
): NodeWorkflowNodeData {
  const base = defined({
    status: data.status,
    note: data.note,
    mediaKind: data.kind,
    mediaLabel: data.name,
  })

  switch (data.kind) {
    case NODE_MEDIA_KIND_IDS.text:
      return {
        ...residueOf(previous),
        ...base,
        // 四栏 → 单一正文是**不可逆的合并**（migrate 那一侧做的），所以反向只往
        // 第一栏落一次：再次 compose 回来仍然是同一段 `body`。
        [NODE_WORKFLOW_FIELD_IDS.scene]: data.body,
      } as unknown as NodeWorkflowNodeData
    case NODE_MEDIA_KIND_IDS.audio:
      return {
        ...residueOf(previous),
        ...base,
        ...mediaMetaToV3(data),
        ...defined({
          voiceName: data.name,
          mediaUrl: data.url,
          voiceClipUrl: data.url,
          model: data.model,
          prompt: data.prompt,
          audioOwnerName: data.ownerName,
        }),
      } as NodeWorkflowNodeData
    case NODE_MEDIA_KIND_IDS.video:
      return {
        ...residueOf(previous),
        ...base,
        ...mediaMetaToV3(data),
        ...paramsToV3(data),
        ...defined({
          // `label` 才是 `@` 认的那个名字，所以它占显示名优先链里靠前的
          // `shotName`；v4 的稳定名 `name` 留在 `mediaLabel`。
          shotName: data.label,
          mediaUrl: data.url,
          videoUrl: data.url,
          model: data.model,
          prompt: data.prompt,
          negativePrompt: data.negativePrompt,
          videoMode: data.videoMode,
          mergeSettings: data.mergeSettings,
          mediaReview: data.mediaReview,
        }),
      } as NodeWorkflowNodeData
    default: {
      const { role } = v3TypeAndRole(data)
      return {
        ...residueOf(previous),
        ...base,
        ...mediaMetaToV3(data),
        ...paramsToV3(data),
        ...defined({
          role,
          mediaUrl: data.url,
          imageUrl: data.url,
          model: data.model,
          prompt: data.prompt,
          negativePrompt: data.negativePrompt,
          mediaReview: data.mediaReview,
          characterName:
            data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character
              ? (data.characterName ?? data.name)
              : undefined,
          backgroundName:
            data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.background
              ? data.name
              : undefined,
          shotName:
            data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character ||
            data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.background
              ? undefined
              : data.name,
        }),
      } as NodeWorkflowNodeData
    }
  }
}

/**
 * v4 整图 → v3 形状的**只读投影**。`previousV3` 提供 v4 里没有落点的残留字段。
 */
export function projectV4ToV3View(
  stateV4: NodeWorkflowStateV4,
  previousV3?: NodeWorkflowState,
): NodeWorkflowState {
  const previousById = new Map(
    (previousV3?.nodes ?? []).map((node) => [node.id, node]),
  )
  const nodes: NodeWorkflowNode[] = stateV4.nodes.map((node) => {
    const previous = previousById.get(node.id)
    const { type } = v3TypeAndRole(node.data)
    return {
      ...(previous ? { width: previous.width, height: previous.height } : {}),
      id: node.id,
      type,
      position: node.position,
      data: v3DataOf(node.data, previous?.data),
      ...(node.selected === undefined ? {} : { selected: node.selected }),
      ...(node.dragging === undefined ? {} : { dragging: node.dragging }),
    } as NodeWorkflowNode
  })

  const edges: NodeWorkflowEdge[] = stateV4.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    slot: edge.slot,
    ...(edge.data ? { data: edge.data } : {}),
  }))

  return {
    nodes,
    edges,
    ...defined({
      scriptDoc: stateV4.scriptDoc,
      canvasAppearance: stateV4.canvasAppearance,
      scriptDocStage: stateV4.scriptDocStage,
      scriptDocDepth: stateV4.scriptDocDepth,
      scriptDocLocks: stateV4.scriptDocLocks,
      scriptDocShotStills: stateV4.scriptDocShotStills,
    }),
  } as NodeWorkflowState
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const next = value.trim()
  return next.length > 0 ? next : undefined
}

function v3ParamsPatch(data: NodeWorkflowNodeData): Record<string, unknown> {
  const params = defined({
    aspectRatio: readString(data.aspectRatio),
    resolution: readString(data.resolution),
    duration: readString(data.duration),
    generateAudio:
      typeof data.generateAudio === 'boolean' ? data.generateAudio : undefined,
    seed: typeof data.seed === 'number' ? data.seed : undefined,
  })
  return Object.keys(params).length > 0 ? { params } : { params: undefined }
}

function v3MediaMetaPatch(data: NodeWorkflowNodeData): Record<string, unknown> {
  const positiveInt = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isInteger(value) && value > 0
      ? value
      : undefined
  return {
    videoThumbnailUrl: readString(data.videoThumbnailUrl),
    sizeBytes:
      typeof data.sizeBytes === 'number' &&
      Number.isInteger(data.sizeBytes) &&
      data.sizeBytes >= 0
        ? data.sizeBytes
        : undefined,
    mediaWidth: positiveInt(data.mediaWidth),
    mediaHeight: positiveInt(data.mediaHeight),
    imageSource: readString(data.imageSource),
  }
}

/** v3 节点的可映射字段 → v4 节点数据（以 `base` 为底逐字段覆盖）。 */
function mergeV3DataIntoV4(
  base: NodeV4Data,
  v3: NodeWorkflowNodeData,
): NodeV4Data {
  const status = readString(v3.status) ?? base.status
  const note = readString(v3.note)
  const media =
    readString(v3.mediaUrl) ??
    readString(v3.imageUrl) ??
    readString(v3.videoUrl)

  if (base.kind === NODE_MEDIA_KIND_IDS.text) {
    return {
      ...base,
      status,
      note,
      name: toNodeDisplayLabel(resolveNodeDisplayName(v3)) ?? base.name,
      body: typeof v3.scene === 'string' ? v3.scene : base.body,
    } as NodeV4Data
  }

  if (base.kind === NODE_MEDIA_KIND_IDS.audio) {
    return {
      ...base,
      ...v3MediaMetaPatch(v3),
      status,
      note,
      name: toNodeDisplayLabel(resolveNodeDisplayName(v3)) ?? base.name,
      url: readString(v3.voiceClipUrl) ?? media,
      model: v3.model ?? base.model,
      prompt: typeof v3.prompt === 'string' ? v3.prompt : base.prompt,
      ownerName: toNodeDisplayLabel(v3.audioOwnerName),
    } as NodeV4Data
  }

  if (base.kind === NODE_MEDIA_KIND_IDS.video) {
    const isShot = base.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
    const label = toNodeDisplayLabel(v3.shotName) ?? base.label
    return {
      ...base,
      ...v3MediaMetaPatch(v3),
      ...v3ParamsPatch(v3),
      status,
      note,
      // 视频镜头的显示名是 `label`（占了 `shotName`），稳定名走 `mediaLabel`。
      name: toNodeDisplayLabel(v3.mediaLabel) ?? base.name,
      ...(isShot ? { label: label ?? base.name } : { label }),
      url: media,
      model: v3.model ?? base.model,
      prompt: typeof v3.prompt === 'string' ? v3.prompt : base.prompt,
      negativePrompt: readString(v3.negativePrompt),
      videoMode: v3.videoMode ?? base.videoMode,
      mergeSettings: v3.mergeSettings ?? base.mergeSettings,
      mediaReview: v3.mediaReview ?? base.mediaReview,
    } as unknown as NodeV4Data
  }

  return {
    ...base,
    ...v3MediaMetaPatch(v3),
    ...v3ParamsPatch(v3),
    status,
    note,
    name: toNodeDisplayLabel(resolveNodeDisplayName(v3)) ?? base.name,
    url: media,
    model: v3.model ?? base.model,
    prompt: typeof v3.prompt === 'string' ? v3.prompt : base.prompt,
    negativePrompt: readString(v3.negativePrompt),
    characterName: toNodeDisplayLabel(v3.characterName),
    mediaReview: v3.mediaReview ?? base.mediaReview,
  } as NodeV4Data
}

/**
 * v3 视图的改动 → v4。⚠ 唯一写入口 `commitV3Mutation` 的下半截。
 *
 * · 已存在的 id：以 v4 那份为底逐字段覆盖，v4 独有字段原样保留。
 * · 新增的 id：跑一次 `migrateNodeWorkflowStateToV4` 现造一份（没有底可留）。
 * · 消失的 id：连同它的边一起丢弃。
 */
export function writeV3ViewBackToV4(
  v3: NodeWorkflowState,
  baseV4: NodeWorkflowStateV4,
  options: { now?: string } = {},
): NodeWorkflowStateV4 {
  const baseNodeById = new Map(baseV4.nodes.map((node) => [node.id, node]))
  const baseEdgeById = new Map(baseV4.edges.map((edge) => [edge.id, edge]))

  const nodes: NodeV4[] = []
  const keptV3Nodes = new Map<string, NodeWorkflowNode>()
  for (const node of v3.nodes) {
    const base = baseNodeById.get(node.id)
    if (base) {
      nodes.push({
        ...base,
        position: node.position,
        data: mergeV3DataIntoV4(base.data, node.data),
        ...(node.selected === undefined ? {} : { selected: node.selected }),
      })
      keptV3Nodes.set(node.id, node)
      continue
    }
    const migrated = migrateNodeWorkflowStateToV4(
      { nodes: [node as never], edges: [] },
      { ...(options.now ? { now: options.now } : {}) },
    ).state.nodes[0]
    // composer / agent 是退役类型，migrate 会整节点剥除 —— 反向也一样丢。
    if (!migrated) continue
    nodes.push(migrated)
    keptV3Nodes.set(node.id, node)
  }

  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges: NodeWorkflowEdgeV4[] = []
  for (const edge of v3.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    const base = baseEdgeById.get(edge.id)
    if (base) {
      edges.push({ ...base, ...(edge.slot ? { slot: edge.slot } : {}) })
      continue
    }
    const sourceNode = keptV3Nodes.get(edge.source)
    const targetNode = keptV3Nodes.get(edge.target)
    if (!sourceNode || !targetNode) continue
    const sourceIdentity = resolveV4Identity(sourceNode as never)
    const targetIdentity = resolveV4Identity(targetNode as never)
    if (!sourceIdentity || !targetIdentity) continue
    const slot =
      edge.slot ??
      resolveEdgeSlot(sourceIdentity, targetIdentity, sourceNode as never) ??
      NODE_SLOT_IDS.reference
    edges.push({
      id: edge.id,
      source: edge.source,
      sourceHandle:
        edge.sourceHandle === NODE_SLOT_OUTPUT_IDS.tailFrame
          ? NODE_SLOT_OUTPUT_IDS.tailFrame
          : NODE_SLOT_OUTPUT_IDS.out,
      target: edge.target,
      slot,
      ...(edge.data ? { data: edge.data } : {}),
    })
  }

  return NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes,
    edges,
    ...defined({
      scriptDoc: v3.scriptDoc,
      canvasAppearance: v3.canvasAppearance,
      scriptDocStage: v3.scriptDocStage,
      scriptDocDepth: v3.scriptDocDepth,
      scriptDocLocks: v3.scriptDocLocks,
      scriptDocShotStills: v3.scriptDocShotStills,
    }),
  })
}

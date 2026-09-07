/**
 * v4 具名槽 → 生成载荷（第三期 · 画布 C3b）。
 *
 * ⛔ **本片写好不接线** —— 生产调用方为 0；接线在 C3c（`src/hooks/node/*-v4.ts`
 * 四个钩子与本文件一起换上去，见该片的接线清单）。
 *
 * ── 为什么装配要单独成一层纯函数 ────────────────────────────────────────
 * v3 的装配散在钩子与组件里（`use-video-composer` 的槽架、`StudioNodeWorkbench`
 * 的 handler、`node-video-send-preview` 的预览各拼一遍），三处对同一张图算出不同
 * 的账是这一域最老的病。v4 把「读哪个槽 → 落哪个位置」收进这里一份：钩子只负责
 * React 那一半（读 store、发请求），装配一律问本文件。
 *
 * ── 三条判据 ────────────────────────────────────────────────────────────
 * ① **binding 优先，边表兜底**：`data.slots[slot]` 有 binding 就读它（轮播槽只取
 *    `cur` 那一版，0..N 槽取全部未停用版本）；没有 binding 才回落边表 —— 迁移产物
 *    只写边不写 binding，这条回落就是它们的读路径（与 `collectSlotLines`、
 *    `orderSourcesBySlot` 同一条纪律）。
 * ② **停用版永不入列**：`version.blocked` / `image.blocked` 都挡在装配之前。
 * ③ **纯函数**：不碰 DOM / store / 网络 / 时钟。
 */

import {
  NODE_SLOT_IDS,
  NODE_SLOT_TEXT_ROLE_FALLBACK,
  NODE_SLOT_TEXT_ROLE_IDS,
  getNodeV4Ports,
  getNodeV4Slot,
  slotSupportsVersions,
  type NodeSlotId,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { resolveEdgeTextRole } from '@/lib/node-slot-binding'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

/** 一条进了某个槽的源。⚠ 只描述结构，URL 与文本的取值在下面各自的读取器里。 */
export interface SlotSource {
  readonly node: NodeV4
  readonly edgeId: string
  readonly slot: NodeSlotId
  /** 只有 `text` 槽有角色；缺席按 `script` 算（`NODE_SLOT_TEXT_ROLE_FALLBACK`）。 */
  readonly role?: NodeSlotTextRole
}

function nodeById(nodes: readonly NodeV4[]): Map<string, NodeV4> {
  return new Map(nodes.map((node) => [node.id, node]))
}

/** 这个节点已判失败（`image.blocked`）——⛔ 不进任何载荷。 */
export function isBlockedNode(data: NodeV4Data): boolean {
  return data.kind === NODE_MEDIA_KIND_IDS.image && data.blocked === true
}

/**
 * 一个槽当前实际供货的源，**按顺序**。
 *
 * ⚠ 轮播槽（容量恰为 1，`slotSupportsVersions`）只出 `cur` 指的那一版：其余版本
 * 是历史，不是并列内容。`cur` 为空 = 空槽，⛔ 不静默拿第一版顶上（§1.4）。
 */
export function readSlotSources(
  node: NodeV4,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): SlotSource[] {
  const byId = nodeById(nodes)
  const spec = getNodeV4Slot(node.data.kind, node.data.subtype, slot)
  const binding = node.data.slots?.[slot]
  const sources: SlotSource[] = []

  const push = (
    sourceId: string,
    edgeId: string,
    role?: NodeSlotTextRole,
  ): void => {
    const source = byId.get(sourceId)
    if (!source || isBlockedNode(source.data)) return
    sources.push({
      node: source,
      edgeId,
      slot,
      ...(slot === NODE_SLOT_IDS.text
        ? { role: role ?? NODE_SLOT_TEXT_ROLE_FALLBACK }
        : {}),
    })
  }

  if (binding) {
    const carousel = spec ? slotSupportsVersions(spec) : false
    const live = binding.versions.filter((version) => !version.blocked)
    const chosen = carousel
      ? live.filter((version) => version.id === binding.cur)
      : live
    for (const version of chosen) {
      push(version.sourceNodeId, version.edgeId, version.role)
    }
    return sources
  }

  for (const edge of edges) {
    if (edge.target !== node.id || edge.slot !== slot) continue
    push(edge.source, edge.id, resolveEdgeTextRole(edge, node, nodes))
  }
  return sources
}

/** 这个节点交付的那条媒体 URL —— v4 只有一个字段（v3 的三条在迁移里合流）。 */
export function readNodeUrl(data: NodeV4Data): string | undefined {
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return undefined
  return data.url?.trim() || undefined
}

function pushUnique(target: string[], value: string | undefined): void {
  if (!value) return
  if (target.includes(value)) return
  target.push(value)
}

/* ═════════════════════════════════════════════════════════════════════════
 * 文本三档（C1 契约修正 2）
 * ═══════════════════════════════════════════════════════════════════════ */

export interface SlotTextSegments {
  /** 要拍的内容本身（0..1）。 */
  readonly script?: string
  /** 风格 / 规则约束（0..N），可叠加。 */
  readonly style: readonly string[]
  /** 角色描述（0..N），可叠加。 */
  readonly character: readonly string[]
}

function readBody(node: NodeV4): string {
  return node.data.kind === NODE_MEDIA_KIND_IDS.text
    ? node.data.body.trim()
    : ''
}

/**
 * 一个节点 `text` 槽的三档正文。⚠ 分档判据是**边上的角色**，不是源节点的子型：
 * 同一份文本可以在 A 镜当剧本、在 B 镜当风格约束（角色住在边上，见 C1 修正 2）。
 */
export function readTextSegments(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): SlotTextSegments {
  const sources = readSlotSources(node, NODE_SLOT_IDS.text, edges, nodes)
  const style: string[] = []
  const character: string[] = []
  let script: string | undefined

  for (const source of sources) {
    const body = readBody(source.node)
    if (!body) continue
    switch (source.role ?? NODE_SLOT_TEXT_ROLE_FALLBACK) {
      case NODE_SLOT_TEXT_ROLE_IDS.style:
        style.push(body)
        break
      case NODE_SLOT_TEXT_ROLE_IDS.character:
        character.push(body)
        break
      default:
        // 剧本 0..1：多于一条时**取第一条**并保留其余在正文里（与 v3 的
        // 「所有上游文本按图顺序拼进正文」等价），⛔ 不静默丢。
        script = script ? `${script}\n\n${body}` : body
    }
  }

  return { ...(script ? { script } : {}), style, character }
}

/**
 * 三档 + 节点自己的提示词 → 最终提示词。
 *
 * 版式：**正文在前，约束在后**（上游剧本 → 本节点提示词 → 角色段 → 风格段）。
 * 约束排在最后是因为它们是「不许违反的规则」，读在内容之后才不会被当成画面描述
 * 念出来 —— 这正是 `text` 槽要分角色的原因。
 *
 * ⚠ 正文那一半与 v3 的 `mergePromptWithUpstreamText` 逐字等价（上游在前、自有在
 * 后、空的那一边直接跳过），v3 那条路径现在也调它，⛔ 两处不再各拼各的。
 */
export function composeSlotPrompt(input: {
  readonly ownPrompt?: string
  readonly script?: string
  readonly style?: readonly string[]
  readonly character?: readonly string[]
}): string {
  const chunks = [
    input.script?.trim() ?? '',
    input.ownPrompt?.trim() ?? '',
    ...(input.character ?? []).map((value) => value.trim()),
    ...(input.style ?? []).map((value) => value.trim()),
  ].filter(Boolean)
  return chunks.join('\n\n')
}

/* ═════════════════════════════════════════════════════════════════════════
 * 载荷装配
 * ═══════════════════════════════════════════════════════════════════════ */

export interface SlotAudioBinding {
  readonly url: string
  readonly nodeId: string
  /** 这条音色属于谁（`ownerName`，或经角色卡带进来的角色名）。 */
  readonly characterName?: string
}

export interface V4VideoPayload {
  readonly prompt: string
  /** 首帧（`firstFrame` 槽的当前版）。 */
  readonly firstFrameUrl?: string
  /** 尾帧（`lastFrame` 槽的当前版）。 */
  readonly lastFrameUrl?: string
  /**
   * `image_urls`：首帧 → 尾帧 → 参考图 → 一跳特写。
   * ⚠ 关键帧段是**真前缀**（与 v3 的 `HarvestedImageUrls.keyframeUrls` 同一条契约）。
   */
  readonly imageUrls: readonly string[]
  readonly keyframeUrls: readonly string[]
  /** `video_urls`：`reference` 槽里的视频源。 */
  readonly videoUrls: readonly string[]
  /** `audio_urls` + 归属：直连的 `voice` 槽 + 角色卡上绑的那一跳。 */
  readonly audioBindings: readonly SlotAudioBinding[]
  readonly text: SlotTextSegments
}

/**
 * 一个 `video.shot` 节点的完整送出载荷。
 *
 * ⚠ 一跳外的来源（特写挂在角色卡上、音色绑在角色卡上）问的是**那张卡的槽** ——
 * 与 v3 收割层同一条纪律（`harvestSlots` 的头注）：「谁的槽」只有一个答案。
 */
export function buildV4VideoPayload(params: {
  readonly nodeId: string
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  readonly ownPrompt?: string
}): V4VideoPayload {
  const { nodeId, nodes, edges } = params
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) {
    return {
      prompt: params.ownPrompt?.trim() ?? '',
      imageUrls: [],
      keyframeUrls: [],
      videoUrls: [],
      audioBindings: [],
      text: { style: [], character: [] },
    }
  }

  const sourcesIn = (slot: NodeSlotId) =>
    readSlotSources(node, slot, edges, nodes)

  const urlInSlot = (slot: NodeSlotId): string | undefined => {
    const source = sourcesIn(slot)[0]
    return source ? readNodeUrl(source.node.data) : undefined
  }
  const firstFrameUrl = urlInSlot(NODE_SLOT_IDS.firstFrame)
  const lastFrameUrl = urlInSlot(NODE_SLOT_IDS.lastFrame)

  const keyframeUrls: string[] = []
  pushUnique(keyframeUrls, firstFrameUrl)
  pushUnique(keyframeUrls, lastFrameUrl)

  const imageUrls = [...keyframeUrls]
  const videoUrls: string[] = []
  const audioBindings: SlotAudioBinding[] = []
  const seenAudio = new Set<string>()

  const pushAudio = (source: NodeV4, characterName?: string): void => {
    const url = readNodeUrl(source.data)
    if (!url || seenAudio.has(url)) return
    seenAudio.add(url)
    const owner =
      characterName ??
      (source.data.kind === NODE_MEDIA_KIND_IDS.audio
        ? source.data.ownerName
        : undefined)
    audioBindings.push({
      url,
      nodeId: source.id,
      ...(owner ? { characterName: owner } : {}),
    })
  }

  // 参考槽：图与视频同槽（端口表 `video.shot.reference` 两种 kind 都收），
  // 按 kind 分流到各自的载荷数组 —— 槽只回答「它是参考」。
  for (const source of sourcesIn(NODE_SLOT_IDS.reference)) {
    const url = readNodeUrl(source.node.data)
    if (source.node.data.kind === NODE_MEDIA_KIND_IDS.video) {
      pushUnique(videoUrls, url)
      continue
    }
    pushUnique(imageUrls, url)
  }

  // 一跳：角色卡上的特写与音色。⚠ 特写跟在主图后面入列（与 v3 顺序一致），
  // 音色则**先于**直连音色（角色卡带着名字，是更强的事实）。
  const characterCards = sourcesIn(NODE_SLOT_IDS.reference).filter(
    (source) =>
      source.node.data.kind === NODE_MEDIA_KIND_IDS.image &&
      source.node.data.subtype === 'character',
  )
  for (const card of characterCards) {
    for (const closeup of readSlotSources(
      card.node,
      NODE_SLOT_IDS.closeup,
      edges,
      nodes,
    )) {
      pushUnique(imageUrls, readNodeUrl(closeup.node.data))
    }
  }
  for (const card of characterCards) {
    for (const bound of readSlotSources(
      card.node,
      NODE_SLOT_IDS.voice,
      edges,
      nodes,
    )) {
      pushAudio(bound.node, card.node.data.name)
    }
  }
  for (const source of sourcesIn(NODE_SLOT_IDS.voice)) {
    pushAudio(source.node)
  }

  const text = readTextSegments(node, edges, nodes)

  return {
    prompt: composeSlotPrompt({
      ...(params.ownPrompt ? { ownPrompt: params.ownPrompt } : {}),
      ...(text.script ? { script: text.script } : {}),
      style: text.style,
      character: text.character,
    }),
    ...(firstFrameUrl ? { firstFrameUrl } : {}),
    ...(lastFrameUrl ? { lastFrameUrl } : {}),
    imageUrls,
    keyframeUrls,
    videoUrls,
    audioBindings,
    text,
  }
}

export interface V4ImagePayload {
  readonly prompt: string
  /** `reference` 槽里的图（含角色卡的一跳特写，跟在主图后面）。 */
  readonly referenceUrls: readonly string[]
  readonly text: SlotTextSegments
}

/** 一个图生成节点（`image.shot` / `image.character` / …）的送出载荷。 */
export function buildV4ImagePayload(params: {
  readonly nodeId: string
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  readonly ownPrompt?: string
}): V4ImagePayload {
  const { nodeId, nodes, edges } = params
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) {
    return {
      prompt: params.ownPrompt?.trim() ?? '',
      referenceUrls: [],
      text: { style: [], character: [] },
    }
  }

  const referenceUrls: string[] = []
  for (const source of readSlotSources(
    node,
    NODE_SLOT_IDS.reference,
    edges,
    nodes,
  )) {
    pushUnique(referenceUrls, readNodeUrl(source.node.data))
    if (
      source.node.data.kind === NODE_MEDIA_KIND_IDS.image &&
      source.node.data.subtype === 'character'
    ) {
      for (const closeup of readSlotSources(
        source.node,
        NODE_SLOT_IDS.closeup,
        edges,
        nodes,
      )) {
        pushUnique(referenceUrls, readNodeUrl(closeup.node.data))
      }
    }
  }

  const text = readTextSegments(node, edges, nodes)
  return {
    prompt: composeSlotPrompt({
      ...(params.ownPrompt ? { ownPrompt: params.ownPrompt } : {}),
      ...(text.script ? { script: text.script } : {}),
      style: text.style,
      character: text.character,
    }),
    referenceUrls,
    text,
  }
}

export interface V4AudioPayload {
  readonly prompt: string
  /** 音色参考（`timbre` 槽的当前版）。 */
  readonly timbreUrl?: string
  readonly text: SlotTextSegments
}

/** 一个 `audio.*` 节点的送出载荷：台词走 `text` 槽，音色供体走 `timbre` 槽。 */
export function buildV4AudioPayload(params: {
  readonly nodeId: string
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  readonly ownPrompt?: string
}): V4AudioPayload {
  const { nodeId, nodes, edges } = params
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) {
    return {
      prompt: params.ownPrompt?.trim() ?? '',
      text: { style: [], character: [] },
    }
  }
  const timbreUrl = readSlotSources(
    node,
    NODE_SLOT_IDS.timbre,
    edges,
    nodes,
  ).map((source) => readNodeUrl(source.node.data))[0]
  const text = readTextSegments(node, edges, nodes)
  return {
    prompt: composeSlotPrompt({
      ...(params.ownPrompt ? { ownPrompt: params.ownPrompt } : {}),
      ...(text.script ? { script: text.script } : {}),
      style: text.style,
      character: text.character,
    }),
    ...(timbreUrl ? { timbreUrl } : {}),
    text,
  }
}

/** 合并节点的待接片段（`clip` 槽，2..9）。 */
export function buildV4MergeClipUrls(params: {
  readonly nodeId: string
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
}): string[] {
  const node = params.nodes.find((candidate) => candidate.id === params.nodeId)
  if (!node) return []
  const urls: string[] = []
  for (const source of readSlotSources(
    node,
    NODE_SLOT_IDS.clip,
    params.edges,
    params.nodes,
  )) {
    pushUnique(urls, readNodeUrl(source.node.data))
  }
  return urls
}

/* ═════════════════════════════════════════════════════════════════════════
 * 生成前置校验
 * ═══════════════════════════════════════════════════════════════════════ */

export const V4_SLOT_ISSUE_IDS = {
  /** 槽里的边数少于 `min`（今天只有 `clip` 的 2）。 */
  belowMin: 'belowMin',
  /** 轮播槽有版本但 `cur` 为空 —— ⛔ 不静默用第一版（§1.4）。 */
  currentMissing: 'currentMissing',
  /** 当前版指向的素材已判失败。 */
  blockedSource: 'blockedSource',
} as const

export type V4SlotIssueId =
  (typeof V4_SLOT_ISSUE_IDS)[keyof typeof V4_SLOT_ISSUE_IDS]

export interface V4SlotIssue {
  readonly slot: NodeSlotId
  readonly issue: V4SlotIssueId
  /**
   * 文案键。⚠ `belowMin` 不能借 `connectRejected.*` —— 那一组说的是「这条线连不
   * 上」，而这里是「这个槽还没填满，生成不了」，借用会说反话。C3c-① 给它补了
   * 专属键 `StudioNode.v4.slotIssue.belowMin`（三语，带 `{slot}` 参数）。
   */
  readonly i18nKey?: string
}

const SLOT_ISSUE_I18N: Record<V4SlotIssueId, string> = {
  [V4_SLOT_ISSUE_IDS.belowMin]: 'StudioNode.v4.slotIssue.belowMin',
  [V4_SLOT_ISSUE_IDS.blockedSource]:
    'StudioNode.v4.connectRejected.blockedSource',
  [V4_SLOT_ISSUE_IDS.currentMissing]:
    'StudioNode.v4.connectRejected.blockedVersion',
}

/**
 * 一个节点能不能生成：逐槽按端口表校验。⛔ 返回**全部**问题，不在第一条就停 ——
 * 用户要一次看完还差什么，而不是修一条冒一条。
 */
export function validateV4Slots(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
): V4SlotIssue[] {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports) return []
  const issues: V4SlotIssue[] = []
  const add = (slot: NodeSlotId, issue: V4SlotIssueId): void => {
    issues.push({
      slot,
      issue,
      i18nKey: SLOT_ISSUE_I18N[issue],
    })
  }

  for (const spec of ports.inputs) {
    const sources = readSlotSources(node, spec.slot, edges, nodes)
    const binding = node.data.slots?.[spec.slot]
    if (
      binding &&
      slotSupportsVersions(spec) &&
      binding.versions.some((version) => !version.blocked) &&
      !binding.cur
    ) {
      add(spec.slot, V4_SLOT_ISSUE_IDS.currentMissing)
    }
    // 已判失败的素材被 `readSlotSources` 挡在外面 —— 要说清楚是「挡掉了」而不是
    // 「没连」，所以单独回看一眼边表。
    const wiredSourceIds = edges
      .filter((edge) => edge.target === node.id && edge.slot === spec.slot)
      .map((edge) => edge.source)
    if (
      wiredSourceIds.some((sourceId) => {
        const source = nodes.find((candidate) => candidate.id === sourceId)
        return source ? isBlockedNode(source.data) : false
      })
    ) {
      add(spec.slot, V4_SLOT_ISSUE_IDS.blockedSource)
    }
    if (sources.length < spec.min) {
      add(spec.slot, V4_SLOT_ISSUE_IDS.belowMin)
    }
  }
  return issues
}

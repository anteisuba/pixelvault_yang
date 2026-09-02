/**
 * 手势 A · 「点输入框，再点画布节点，节点进输入框」的**纯判定**。
 *
 * owner 2026-09-01 拍板：图 / 视频节点带媒体进去（模型真的看图）；文本节点带
 * 正文（正文走 `node-assistant-context` 的投影，这里只需把 id 送进请求）；所有
 * 节点都带 id（媒体引用自带 `nodeId`，服务端渲染成 `canvas node <id>`；非媒体
 * 节点进 `selectedNodeIds`，渲染成 `[[node:id]] title`）。
 *
 * ── 为什么不从 dock 那份 `referenceOptions` 里查 ──────────────────────
 * 那张表在末尾 `.slice(0, maxReferences)`，第 9 个媒体节点根本不在表里 —— 拾取
 * 必须**按节点直接构造**引用，所以构造器从 dock 抽到这里，两边共用一份判据。
 */

import {
  NODE_STUDIO_ASSISTANT_LIMITS,
  NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS,
  type NodeStudioAssistantPickRejectReason,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'

function isHttpMediaUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function readNodeMediaUrl(node: NodeWorkflowNode): string {
  return typeof node.data.mediaUrl === 'string' && node.data.mediaUrl.trim()
    ? node.data.mediaUrl.trim()
    : typeof node.data.imageUrl === 'string' && node.data.imageUrl.trim()
      ? node.data.imageUrl.trim()
      : ''
}

/**
 * 一个画布节点 → 助手可挂的媒体引用；不是媒体节点（或 URL 不是 http(s)）→ null。
 * Schema 要求绝对 http(s) URL —— data / blob / 相对路径一律跳过。
 */
export function buildCanvasAssistantMediaReference(
  node: NodeWorkflowNode,
  getNodeTypeLabel: (type: NodeWorkflowNode['type']) => string,
): NodeAssistantMediaReference | null {
  const url = readNodeMediaUrl(node)
  if (!url || !isHttpMediaUrl(url)) return null

  const kind =
    node.data.mediaKind === NODE_MEDIA_KIND_IDS.video ||
    node.type === NODE_TYPE_IDS.seedance ||
    node.type === NODE_TYPE_IDS.videoReference ||
    node.type === NODE_TYPE_IDS.videoMerge
      ? 'video'
      : node.data.mediaKind === NODE_MEDIA_KIND_IDS.image ||
          node.type === NODE_TYPE_IDS.image ||
          node.type === NODE_TYPE_IDS.characterImage ||
          node.type === NODE_TYPE_IDS.backgroundImage ||
          node.type === NODE_TYPE_IDS.frameImage ||
          node.type === NODE_TYPE_IDS.shot
        ? 'image'
        : null
  if (!kind) return null

  // 画布修法 08-A：直接读 mediaLabel/sourceLabel 绕开了机器值守卫——
  // 「选已有图」写入口把上传备注常量当名字写进这两个字段时，@ 菜单候选名
  // 会照单展示那串机器备注。改走共享解析器，顺带也能认出 characterName 等
  // 专有身份字段（原逻辑不认）。
  const label = resolveNodeDisplayName(node.data) || getNodeTypeLabel(node.type)
  const videoThumb =
    typeof node.data.videoThumbnailUrl === 'string'
      ? node.data.videoThumbnailUrl.trim()
      : ''
  return {
    id: `node-reference:${node.id}`,
    nodeId: node.id,
    source: 'canvas',
    kind,
    url,
    ...(kind === 'video' && videoThumb && isHttpMediaUrl(videoThumb)
      ? { thumbnailUrl: videoThumb }
      : kind === 'image'
        ? { thumbnailUrl: url }
        : {}),
    label,
  }
}

export type CanvasAssistantPickResult =
  | { kind: 'reference'; reference: NodeAssistantMediaReference }
  | { kind: 'node'; nodeId: string }
  | { kind: 'rejected'; reason: NodeStudioAssistantPickRejectReason }

export interface ResolveCanvasAssistantPickOptions {
  getNodeTypeLabel(type: NodeWorkflowNode['type']): string
  /** 输入框里已经挂着的媒体引用（含从素材库 / 上传来的）。 */
  selectedReferences: readonly NodeAssistantMediaReference[]
  /** 已经拾进输入框的非媒体节点 id。 */
  pickedNodeIds: readonly string[]
}

/**
 * 点了 `nodeId` 之后该发生什么。上限走 `NODE_STUDIO_ASSISTANT_LIMITS`：媒体引用
 * `maxReferences`（= `ASSISTANT_MEDIA_LIMITS.maxReferences`，送进模型的上限），
 * 非媒体节点 `maxSelectedNodes`（请求侧 `selectedNodeIds` 的截断线 —— 拾了第 13 个
 * 也送不出去，不如当场拒掉说清楚）。
 */
export function resolveCanvasAssistantPick(
  nodes: readonly NodeWorkflowNode[],
  nodeId: string,
  {
    getNodeTypeLabel,
    selectedReferences,
    pickedNodeIds,
  }: ResolveCanvasAssistantPickOptions,
): CanvasAssistantPickResult {
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) {
    return {
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.unknownNode,
    }
  }

  const reference = buildCanvasAssistantMediaReference(node, getNodeTypeLabel)
  if (reference) {
    if (selectedReferences.some((item) => item.id === reference.id)) {
      return {
        kind: 'rejected',
        reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.alreadyPicked,
      }
    }
    if (
      selectedReferences.length >= NODE_STUDIO_ASSISTANT_LIMITS.maxReferences
    ) {
      return {
        kind: 'rejected',
        reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.referenceLimit,
      }
    }
    return { kind: 'reference', reference }
  }

  if (pickedNodeIds.includes(node.id)) {
    return {
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.alreadyPicked,
    }
  }
  if (pickedNodeIds.length >= NODE_STUDIO_ASSISTANT_LIMITS.maxSelectedNodes) {
    return {
      kind: 'rejected',
      reason: NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.nodeLimit,
    }
  }
  return { kind: 'node', nodeId: node.id }
}

/** 这个节点现在还能不能被拾（供 arm 态高亮：能拾的亮、已拾的 ⊘）。 */
export function isCanvasAssistantPickIncluded(
  node: NodeWorkflowNode,
  {
    selectedReferences,
    pickedNodeIds,
  }: Pick<
    ResolveCanvasAssistantPickOptions,
    'selectedReferences' | 'pickedNodeIds'
  >,
): boolean {
  return (
    pickedNodeIds.includes(node.id) ||
    selectedReferences.some((reference) => reference.nodeId === node.id)
  )
}

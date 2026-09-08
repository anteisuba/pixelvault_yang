'use client'

/**
 * 视频节点编排的 v4 读取层（第三期 · 画布 C3b）。
 *
 * ③d 起已接线：唯一调用方是 `nodes/v4/NodeV4GenerateDesk.tsx`（原 `composer/VideoComposer.tsx`
 * 的 `useVideoComposer(id, data)` 换成这里，`CanvasSlotRack` 跟着改读 `tokens`）。
 * v3 那个钩子本片不改。
 *
 * ── 与 v3 的差别只有一句话 ──────────────────────────────────────────────
 * v3 的槽架是**从载荷倒推**的：先把 URL 收割成一个大数组，再 `indexOf` 反查每个
 * 节点占第几位（`payloadImageUrls.indexOf(mediaUrl)`）。于是「界面标的 @Image2」
 * 与「真正发出去的第 2 张」靠一次字符串查找维系，任何一处顺序变化都会让它说谎。
 * v4 反过来：槽是事实，令牌**由槽派生**，位置是槽的投影。⛔ 不再有 `indexOf`。
 */

import { useMemo } from 'react'

import { NODE_SLOT_IDS, type NodeSlotId } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  buildV4VideoPayload,
  readNodeUrl,
  readSlotSources,
  validateV4Slots,
  type V4SlotIssue,
  type V4VideoPayload,
} from '@/lib/node-slot-payload'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/** 槽架上的一格。⚠ `slotIndex` 是**这个槽内**的序号，不是全局载荷下标 —— 位置
 *  由槽决定，槽名才是用户看见的语义（首帧 / 尾帧 / 参考N / 音N）。 */
export interface V4ComposerToken {
  readonly nodeId: string
  readonly edgeId: string
  readonly slot: NodeSlotId
  readonly slotIndex: number
  /** 稳定名（`data.name`；镜头节点是 `label`）—— `@` 认的就是它。 */
  readonly label: string
  readonly mediaUrl?: string
  /** 这一格在本次请求里发不发得出去（没有 URL 的音色 = 挂着但发不出）。 */
  readonly sending: boolean
}

export interface V4VideoComposerValue {
  readonly payload: V4VideoPayload
  readonly tokens: readonly V4ComposerToken[]
  readonly issues: readonly V4SlotIssue[]
  /** 每个槽当前占了几格 —— 槽架的 `n/m` 里的 n。 */
  readonly countBySlot: Readonly<Partial<Record<NodeSlotId, number>>>
}

/** 槽架的顺序 = 端口表里 `video.shot` 的入口顺序（§6：两处不许各排各的）。 */
const SHOT_SLOT_ORDER: readonly NodeSlotId[] = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.reference,
  NODE_SLOT_IDS.voice,
  NODE_SLOT_IDS.text,
]

function labelOf(node: NodeV4): string {
  if (
    node.data.kind === NODE_MEDIA_KIND_IDS.video &&
    node.data.subtype === 'shot'
  ) {
    return node.data.label
  }
  return node.data.name
}

/** 纯函数：一个镜头节点 → 它的槽架。单测直接调它，不用挂 React。 */
export function buildV4ComposerTokens(
  nodeId: string,
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
): V4ComposerToken[] {
  const node = nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return []
  const tokens: V4ComposerToken[] = []
  for (const slot of SHOT_SLOT_ORDER) {
    readSlotSources(node, slot, edges, nodes).forEach((source, index) => {
      const mediaUrl = readNodeUrl(source.node.data)
      tokens.push({
        nodeId: source.node.id,
        edgeId: source.edgeId,
        slot,
        slotIndex: index,
        label: labelOf(source.node),
        ...(mediaUrl ? { mediaUrl } : {}),
        // 文本槽没有 URL 也照样发得出去（它发的是字）。
        sending: slot === NODE_SLOT_IDS.text ? true : Boolean(mediaUrl),
      })
    })
  }
  return tokens
}

export function useVideoComposerV4(
  nodeId: string,
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
): V4VideoComposerValue {
  return useMemo(() => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    const tokens = buildV4ComposerTokens(nodeId, nodes, edges)
    const countBySlot: Partial<Record<NodeSlotId, number>> = {}
    for (const token of tokens) {
      countBySlot[token.slot] = (countBySlot[token.slot] ?? 0) + 1
    }
    return {
      payload: buildV4VideoPayload({
        nodeId,
        nodes,
        edges,
        ...(node?.data.kind !== NODE_MEDIA_KIND_IDS.text && node?.data.prompt
          ? { ownPrompt: node.data.prompt }
          : {}),
      }),
      tokens,
      issues: node ? validateV4Slots(node, edges, nodes) : [],
      countBySlot,
    }
  }, [nodeId, nodes, edges])
}

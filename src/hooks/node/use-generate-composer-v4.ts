'use client'

/**
 * 生成框（组装台之外那条）的 v4 读取层（第三期 · 画布 C3b）。
 *
 * ③d 起已接线：唯一调用方是 `nodes/v4/NodeV4GenerateDesk.tsx`（原 `composer/GenerateComposer.tsx`
 * 的 `useGenerateComposer()` 换成这里）。v3 那个钩子本片不改。
 *
 * ── v4 让这里少了一整条判据 ────────────────────────────────────────────
 * v3 的宿主推断要先回答「这个节点是卡片还是图」（`isIdentityCardNode` + role 表
 * + 两个名字带 Image 其实是卡片的旧类型）。v4 里这就是 `kind` + `subtype` 两个
 * 字段：`image.character` / `image.background` 是卡片，其余是落点。⛔ 不再需要
 * 那张翻译表。
 */

import { useMemo } from 'react'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_IMAGE_SUBTYPE_IDS } from '@/constants/node-types'
import {
  buildV4ImagePayload,
  readNodeUrl,
  type V4ImagePayload,
} from '@/lib/node-slot-payload'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/** 生成框这一轮认的两种落点（视频仍走组装台，见 canvas-generate-composer.md §3）。 */
export type V4ComposerMode = 'image' | 'audio'

export interface V4ComposerHost {
  readonly nodeId: string
  readonly mode: V4ComposerMode
  readonly hasMedia: boolean
  readonly mediaUrl?: string
  readonly label: string
}

/**
 * 选中的节点 → 生成框的宿主。**纯函数**。
 *
 * ⚠ 身份卡（角色 / 背景）返回 `null`：它们自己不产图，是引用的收集器。这条判据
 * 在 v3 里叫 `isIdentityCardNode`（还要认两个名字带 Image 的旧类型），v4 里就是
 * 两个子型字面量。
 */
export function inferV4ComposerHost(
  node: NodeV4 | null | undefined,
): V4ComposerHost | null {
  if (!node) return null
  const data = node.data
  if (data.kind === NODE_MEDIA_KIND_IDS.text) return null
  if (data.kind === NODE_MEDIA_KIND_IDS.video) return null
  if (
    data.kind === NODE_MEDIA_KIND_IDS.image &&
    (data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character ||
      data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.background)
  ) {
    return null
  }
  const mediaUrl = readNodeUrl(data)
  return {
    nodeId: node.id,
    mode:
      data.kind === NODE_MEDIA_KIND_IDS.audio
        ? ('audio' as const)
        : ('image' as const),
    hasMedia: Boolean(mediaUrl),
    ...(mediaUrl ? { mediaUrl } : {}),
    label: data.name,
  }
}

/** 生成框的参考格 —— 直接来自 `reference` 槽，⛔ 不再另存一份 slot 数组。 */
export interface V4ComposerReferenceSlot {
  readonly url: string
  /** 第一格钉宿主图，不可删（§4）。 */
  readonly pinned: boolean
}

export interface V4GenerateComposerValue {
  readonly host: V4ComposerHost | null
  readonly payload: V4ImagePayload
  readonly referenceSlots: readonly V4ComposerReferenceSlot[]
}

export function useGenerateComposerV4(
  nodeId: string | null,
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
): V4GenerateComposerValue {
  return useMemo(() => {
    const node = nodeId
      ? (nodes.find((candidate) => candidate.id === nodeId) ?? null)
      : null
    const host = inferV4ComposerHost(node)
    const payload = buildV4ImagePayload({
      nodeId: nodeId ?? '',
      nodes,
      edges,
      ...(node &&
      node.data.kind !== NODE_MEDIA_KIND_IDS.text &&
      node.data.prompt
        ? { ownPrompt: node.data.prompt }
        : {}),
    })
    const referenceSlots: V4ComposerReferenceSlot[] = []
    if (host?.mediaUrl) {
      referenceSlots.push({ url: host.mediaUrl, pinned: true })
    }
    for (const url of payload.referenceUrls) {
      if (referenceSlots.some((slot) => slot.url === url)) continue
      referenceSlots.push({ url, pinned: false })
    }
    return { host, payload, referenceSlots }
  }, [nodeId, nodes, edges])
}

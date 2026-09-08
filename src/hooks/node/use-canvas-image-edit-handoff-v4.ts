'use client'

/**
 * 图片编辑 handoff（工作台「在画布里编辑」→ `/studio/node?...`）的 **v4 落点**。
 *
 * ③d-4 从 `StudioNodeWorkbench` 搬来。幂等三件套（`readCanvasImageEditHandoff` /
 * `getCanvasImageEditHandoffRequestKey` / `decideCanvasImageEditHandoffSession`）
 * 一行没动 —— 它们判的是「这个请求这一会话处理过没有」，与图的版本无关。
 *
 * 变的只有**落点**：v3 那条 `resolveCanvasImageEditHandoff` 返回一份 v3 data patch
 * （`mediaUrl` / `generationStatus` / `sourceGenerationId` …），v4 里这些字段全不
 * 存在。所以复用判据在这里按 v4 形状重写：
 *   · 复用 = 画布上已经有一张 `kind:'image'` 且 `url` 就是它的卡；
 *   · 否则新建一张 `image.result`，媒体走 `graph.setMedia`（与拖投 / 上传同一条
 *     回填路径，⛔ 不另发明一份 patch）。
 * ⚠ v4 的图片节点没有 `generationId` 字段（血缘住在 `sourceRef`），所以按
 * generationId 复用那一支在 v4 里没有对象 —— URL 就是唯一判据。
 */

import { useEffect, useRef } from 'react'
import type { ReadonlyURLSearchParams } from 'next/navigation'

import { NODE_STUDIO_NODE_PLACEMENT } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
} from '@/constants/node-types'
import {
  decideCanvasImageEditHandoffSession,
  getCanvasImageEditHandoffRequestKey,
  type CanvasImageEditHandoffRequest,
} from '@/lib/canvas-image-edit-handoff'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'

export interface UseCanvasImageEditHandoffV4Options {
  readonly graph: NodeGraphV4
  /** `null` = URL 上没有 handoff 参数。 */
  readonly request: CanvasImageEditHandoffRequest | null
  /** Clerk 未加载或未登录时传 `null` —— ⛔ 不拿上一个账号的键做幂等。 */
  readonly userId: string | null
  readonly projectId: string
  /** 项目快照还没水合时不落点，否则会往空图上建一张孤卡。 */
  readonly isHydrated: boolean
  onFocusNode(nodeId: string): void
}

export type { ReadonlyURLSearchParams }

export function useCanvasImageEditHandoffV4({
  graph,
  request,
  userId,
  projectId,
  isHydrated,
  onFocusNode,
}: UseCanvasImageEditHandoffV4Options): void {
  /** requestKey → 这一次 handoff 落在哪个节点上。 */
  const nodeByRequestRef = useRef(new Map<string, string>())
  const activeRequestKeyRef = useRef<string | null>(null)
  const pendingRequestKeyRef = useRef<string | null>(null)

  const latest = useRef({ graph, onFocusNode })
  useEffect(() => {
    latest.current = { graph, onFocusNode }
  }, [graph, onFocusNode])

  useEffect(() => {
    if (!userId || !isHydrated || !request) {
      activeRequestKeyRef.current = null
      pendingRequestKeyRef.current = null
      return
    }

    const { graph: g, onFocusNode: focus } = latest.current
    const requestKey = getCanvasImageEditHandoffRequestKey(
      userId,
      projectId,
      request.signature,
    )
    const rememberedNodeId = nodeByRequestRef.current.get(requestKey)
    const rememberedNodeExists =
      rememberedNodeId !== undefined &&
      g.nodes.some((node) => node.id === rememberedNodeId)

    const decision = decideCanvasImageEditHandoffSession({
      requestKey,
      activeRequestKey: activeRequestKeyRef.current,
      pendingRequestKey: pendingRequestKeyRef.current,
      ...(rememberedNodeId ? { rememberedNodeId } : {}),
      rememberedNodeExists,
    })
    if (decision.kind === 'skip') return
    if (decision.kind === 'focus') {
      pendingRequestKeyRef.current = null
      activeRequestKeyRef.current = requestKey
      focus(decision.nodeId)
      return
    }
    if (decision.staleNodeId) {
      nodeByRequestRef.current.delete(requestKey)
    }

    // 复用：画布上已经有这张图（同一个 URL）——⛔ 不再建第二张。
    const sourceUrl = request.sourceUrl
    const existing = sourceUrl
      ? g.nodes.find(
          (node) =>
            node.data.kind === NODE_MEDIA_KIND_IDS.image &&
            node.data.url === sourceUrl,
        )
      : undefined
    if (existing) {
      nodeByRequestRef.current.set(requestKey, existing.id)
      pendingRequestKeyRef.current = null
      activeRequestKeyRef.current = requestKey
      focus(existing.id)
      return
    }

    const nodeId = g.addNode(
      NODE_MEDIA_KIND_IDS.image,
      NODE_V4_IMAGE_SUBTYPE_IDS.result,
      { position: NODE_STUDIO_NODE_PLACEMENT.topbarAddPosition },
    )
    if (!nodeId) return
    if (sourceUrl) {
      g.setMedia(nodeId, {
        url: sourceUrl,
        imageSource: 'existing',
        ...(request.width === undefined ? {} : { mediaWidth: request.width }),
        ...(request.height === undefined
          ? {}
          : { mediaHeight: request.height }),
      })
    }
    // 下一帧就能通过「记住的节点」那条路走到 focus —— 详情保持关闭，只有显式
    // 展开钮才打开它。
    nodeByRequestRef.current.set(requestKey, nodeId)
    pendingRequestKeyRef.current = requestKey
  }, [request, userId, projectId, isHydrated, graph.nodes])
}

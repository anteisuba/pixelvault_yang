'use client'

import { useEffect, useRef } from 'react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { CANVAS_NEW_PROJECT_QUERY_VALUE } from '@/constants/routes'
import {
  takeBenchToCanvasHandoff,
  type BenchToCanvasHandoff,
} from '@/lib/bench-canvas-handoff'
import { requestOperatorDraft } from '@/hooks/use-studio-operator-store'
import type {
  NodeGraphV4,
  NodeGraphV4CreatedSeed,
} from '@/hooks/node/use-node-graph-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'

/**
 * **工作台交过来的那件事**在画布上落地（P6 台间交接，`lib/bench-canvas-handoff.ts`）。
 *
 * 先切到卡上选的那块画布（`new` = 新建一块；那块已经没了就落在眼前这块），切过去之后
 * 一批 op 落下：一张图片卡（提示词、模型、刚出的那张图当它的第一版）+ 每张参考图一张参考
 * 卡连进它的参考槽 —— 一个撤销条目（`dispatchBatchWithMedia`）。最后把下一句话交给这块
 * 画布的助手输入框（⛔ 不替用户发）。
 * ⚠ 存储读一次就清掉：刷新不再落第二张。
 */
export interface UseBenchHandoffArrivalV4Options {
  readonly graph: NodeGraphV4
  readonly isHydrated: boolean
  readonly currentProjectId: string
  readonly projectIds: readonly string[]
  switchProject(id: string): void
  createProject(name: string): string
  /** 新建画布时的名字。 */
  readonly newProjectName: string
  onFocusNode(nodeId: string): void
}

export function buildBenchHandoffOps(handoff: BenchToCanvasHandoff): {
  ops: NodeAssistantOpV4[]
  seeds: (NodeGraphV4CreatedSeed | undefined)[]
} {
  const ops: NodeAssistantOpV4[] = [
    {
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
      ref: 'card',
    },
  ]
  // `seeds[i]` 对应第 i 张新建的卡（只数 add_node）。
  const seeds: (NodeGraphV4CreatedSeed | undefined)[] = [
    handoff.result
      ? {
          media: {
            url: handoff.result.url,
            imageSource: 'generated',
            ...(handoff.result.generationId
              ? { generationId: handoff.result.generationId }
              : {}),
            ...(handoff.result.width
              ? { mediaWidth: handoff.result.width }
              : {}),
            ...(handoff.result.height
              ? { mediaHeight: handoff.result.height }
              : {}),
          },
        }
      : undefined,
  ]
  if (handoff.prompt.trim()) {
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
      target: 'card',
      prompt: handoff.prompt,
      mode: 'replace',
    })
  }
  if (handoff.modelId) {
    ops.push({
      op: NODE_ASSISTANT_OP_V4_IDS.setModel,
      target: 'card',
      modelId: handoff.modelId,
    })
  }
  handoff.referenceUrls.forEach((url, index) => {
    const ref = `ref-${index + 1}`
    ops.push(
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.image,
        subtype: NODE_V4_IMAGE_SUBTYPE_IDS.reference,
        ref,
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: ref,
        target: 'card',
        slot: NODE_SLOT_IDS.reference,
      },
    )
    seeds.push({ media: { url, imageSource: 'existing' } })
  })
  return { ops, seeds }
}

export function useBenchHandoffArrivalV4({
  graph,
  isHydrated,
  currentProjectId,
  projectIds,
  switchProject,
  createProject,
  newProjectName,
  onFocusNode,
}: UseBenchHandoffArrivalV4Options): void {
  const pendingRef = useRef<{
    handoff: BenchToCanvasHandoff
    target: string | null
  } | null>(null)
  const readRef = useRef(false)

  useEffect(() => {
    if (!isHydrated) return
    if (!readRef.current) {
      readRef.current = true
      const handoff = takeBenchToCanvasHandoff()
      if (handoff) pendingRef.current = { handoff, target: null }
    }
    const pending = pendingRef.current
    if (!pending) return
    if (pending.target === null) {
      if (pending.handoff.projectId === CANVAS_NEW_PROJECT_QUERY_VALUE) {
        pending.target = createProject(newProjectName)
        return
      }
      // 那块画布已经没了：落在眼前这块上。
      pending.target = projectIds.includes(pending.handoff.projectId)
        ? pending.handoff.projectId
        : currentProjectId
      if (currentProjectId !== pending.target) {
        switchProject(pending.target)
        return
      }
    }
    if (currentProjectId !== pending.target) return
    pendingRef.current = null
    const { ops, seeds } = buildBenchHandoffOps(pending.handoff)
    const outcome = graph.dispatchBatchWithMedia(ops, seeds)
    const cardId = outcome.createdRefs.card
    if (cardId) onFocusNode(cardId)
    if (pending.handoff.next)
      requestOperatorDraft('canvas', pending.handoff.next, pending.target)
  }, [
    createProject,
    currentProjectId,
    graph,
    isHydrated,
    newProjectName,
    onFocusNode,
    projectIds,
    switchProject,
  ])
}

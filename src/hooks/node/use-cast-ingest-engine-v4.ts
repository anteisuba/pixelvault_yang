'use client'

/**
 * v4 **吞噬手势引擎**（第三期 · 画布 C3c-③d-3「写好不接」）。
 *
 * ⛔ 本片生产调用方为 0 —— 接线在 ③d-4（`IngestDragLayerV4` 挂进 `NodeWorkbenchV4`，
 * 同批删 `use-cast-ingest.ts` 的 `useCastIngestEngine` 与 `IngestDragLayer.tsx`）。
 *
 * ── 与 v3 那台引擎差在哪 ──────────────────────────────────────────────
 * v3 只能回答 yes/no，落点是隐式的「一个节点一个入口」。v4 的目标节点有**多个具名
 * 口**，所以这里的判据整条换成 `planV4IngestDrop` 的**三态**：
 *   · `rejected` → 抖 + 说理由（§3.3 理由必须可见）
 *   · `single`   → 直接落，不问
 *   · `choose`   → **不替用户挑**：把候选槽交回 UI 点亮，由用户点一个
 *     （替他挑首帧他会得到一个没打算要的关键帧，挑参考又违背「拖到首帧口上」的
 *     直觉 —— 见 `planV4IngestDrop` 头注）
 *
 * ── 复用而不是重写 ────────────────────────────────────────────────────
 * 磁吸 / 咬合 / 吞咽 / 抖动那一整套 WAAPI 动作与节点形状无关（它们只认 DOM），
 * 所以**原样复用** `use-cast-ingest.ts` 导出的那批纯 DOM helper。⛔ 不在这里抄
 * 第二份：③d-4 删的是那个文件里的 `useCastIngestEngine`，helper 会随之搬家，
 * 抄一份等于给自己留两处要同步的动效。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { EASE_SOFT_RETURN_CSS, INGEST_MOTION } from '@/constants/motion'
import { NODE_STUDIO_INGEST_MAGNET } from '@/constants/node-studio'
import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

import {
  applyBiteHover,
  applyMagnetHighlight,
  clearAllMagnetHighlights,
  clearBiteHover,
  distanceToRect,
  findNodeCardElement,
  playTargetGulpAnimation,
  playTargetRejectShakeAnimation,
  prefersReducedMotion,
} from './use-cast-ingest'
import {
  planV4IngestDrop,
  type V4IngestDropPlan,
  type V4IngestSlotCandidate,
} from './use-cast-ingest-v4'

/** 拖起来的那张卡。⚠ 带整个 `NodeV4` —— 合法性判据要读 kind/subtype/媒体。 */
export interface V4IngestSourceInfo {
  readonly node: NodeV4
  readonly label: string
  readonly thumbnailUrl?: string
}

export interface V4IngestGhostState {
  readonly originX: number
  readonly originY: number
  readonly width: number
  readonly height: number
  readonly label: string
  readonly thumbnailUrl?: string
}

/** 拒绝理由气泡。⚠ 引擎自己**不翻译**（它不吃 i18n），只发 reason id。 */
export interface V4IngestReasonBubble {
  readonly x: number
  readonly y: number
  readonly text: string
}

/** 多口都收得下时的待决状态 —— UI 据此点亮候选槽。 */
export interface V4IngestPendingChoice {
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly candidates: readonly V4IngestSlotCandidate[]
  /** 候选面板的屏幕锚点（目标卡的上边中点）。 */
  readonly x: number
  readonly y: number
}

export interface V4IngestDragState {
  readonly active: boolean
  readonly sourceNodeId: string | null
  readonly ghost: V4IngestGhostState | null
  readonly reason: V4IngestReasonBubble | null
  /** `null` = 没有待用户挑的落点。 */
  readonly pendingChoice: V4IngestPendingChoice | null
}

const EMPTY_DRAG_STATE: V4IngestDragState = {
  active: false,
  sourceNodeId: null,
  ghost: null,
  reason: null,
  pendingChoice: null,
}

export interface BeginV4DragParams {
  readonly source: V4IngestSourceInfo
  readonly pointerEvent: ReactPointerEvent<Element>
  readonly originElement: HTMLElement
  /** 没越过拖拽阈值 —— 当成一次普通点击，⛔ 不双重处理 click。 */
  onTap?(): void
}

/** 咬到一个目标时的张口预览（`null` = 离开目标 / 拖拽结束）。 */
export interface V4IngestBiteChange {
  readonly sourceNode: NodeV4
  readonly targetNode: NodeV4
  readonly plan: V4IngestDropPlan
}

interface MagnetTarget {
  readonly id: string
  readonly el: HTMLElement
}

interface PendingDrag {
  source: V4IngestSourceInfo
  pointerId: number
  startClientX: number
  startClientY: number
  originRect: DOMRect
  dragging: boolean
  currentTargetId: string | null
  magnetTargets: MagnetTarget[] | null
  onTap?(): void
}

export interface UseCastIngestEngineV4Params {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 落一条边。⚠ 槽**必给** —— v4 里没有「没有槽的边」（§3.4）。 */
  onConnect(sourceId: string, targetId: string, slot: NodeSlotId): void
  /** reason id → 用户看得懂的一句话。引擎不吃 i18n，翻译留给调用方。 */
  translateReason(plan: V4IngestDropPlan): string
  /** 每次咬到 / 离开目标时触发（张口预览的输入）。 */
  onBiteChange?(change: V4IngestBiteChange | null): void
  /** 模型给的动态槽上限（`0..N` 的槽跟模型走）。 */
  readonly capacityBySlot?: Partial<Record<NodeSlotId, number>>
}

export interface CastIngestEngineV4 {
  readonly dragState: V4IngestDragState
  beginDrag(params: BeginV4DragParams): void
  registerGhostElement(el: HTMLDivElement | null): void
  /** 用户在候选里点了一个槽 —— 这一投就落它。 */
  resolveChoice(slot: NodeSlotId): void
  /** 用户点了别处 / 按了 Esc —— 这一投作废，⛔ 不替他挑一个默认。 */
  cancelChoice(): void
}

function canAnimate(el: Element | null): el is Element {
  return Boolean(el) && !prefersReducedMotion()
}

export function useCastIngestEngineV4({
  nodes,
  edges,
  onConnect,
  translateReason,
  onBiteChange,
  capacityBySlot,
}: UseCastIngestEngineV4Params): CastIngestEngineV4 {
  const [dragState, setDragState] =
    useState<V4IngestDragState>(EMPTY_DRAG_STATE)

  /**
   * 拖拽期间图和回调都从 ref 读。⚠ 指针监听器注册在 `window` 上且只注册一次，
   * 闭包捕获的那份 props 会在一次拖拽里过期 —— v3 那台引擎也是这么处理的。
   */
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const onConnectRef = useRef(onConnect)
  const translateReasonRef = useRef(translateReason)
  const onBiteChangeRef = useRef(onBiteChange)
  const capacityRef = useRef(capacityBySlot)
  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    onConnectRef.current = onConnect
    translateReasonRef.current = translateReason
    onBiteChangeRef.current = onBiteChange
    capacityRef.current = capacityBySlot
  }, [nodes, edges, onConnect, translateReason, onBiteChange, capacityBySlot])

  const pendingRef = useRef<PendingDrag | null>(null)
  const ghostElRef = useRef<HTMLDivElement | null>(null)
  const reasonTimeoutRef = useRef<number | null>(null)

  const registerGhostElement = useCallback((el: HTMLDivElement | null) => {
    ghostElRef.current = el
  }, [])

  const plan = useCallback(
    (source: NodeV4, target: NodeV4): V4IngestDropPlan =>
      planV4IngestDrop(
        source,
        target,
        edgesRef.current,
        nodesRef.current,
        capacityRef.current,
      ),
    [],
  )

  const clearReasonSoon = useCallback(() => {
    if (reasonTimeoutRef.current !== null) {
      window.clearTimeout(reasonTimeoutRef.current)
    }
    reasonTimeoutRef.current = window.setTimeout(() => {
      setDragState((current) => ({ ...current, reason: null }))
    }, INGEST_MOTION.rejectReasonVisibleMs)
  }, [])

  const clearMagnets = useCallback((pending: PendingDrag | null) => {
    if (pending?.magnetTargets) clearAllMagnetHighlights()
  }, [])

  /**
   * 收尾 = 只收**手势**那部分（ghost / 磁吸 / 源）。
   *
   * ⚠ `pendingChoice` 与 `reason` 都要留下：前者是「手势结束了但这一投还没落地」，
   * 清掉等于用户松手之后候选面板当场消失（那正是「替他挑了 null」）；后者由
   * `clearReasonSoon` 定时收走 —— 跟着 ghost 一起清的话，拒绝理由会在拒绝动画
   * 结束的同一帧消失，用户根本读不到（v3 那台引擎靠动画时长掩盖了这一点，
   * reduced-motion 下就露馅）。
   */
  const finishDrag = useCallback(() => {
    setDragState((current) => ({
      ...EMPTY_DRAG_STATE,
      pendingChoice: current.pendingChoice,
      reason: current.reason,
    }))
  }, [])

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return

      const dx = event.clientX - pending.startClientX
      const dy = event.clientY - pending.startClientY

      if (!pending.dragging) {
        if (Math.hypot(dx, dy) < INGEST_MOTION.dragThresholdPx) return
        pending.dragging = true
        // 磁吸弱档：拖拽激活时把**每一个收得下的目标**点亮一次，判据与落点走
        // 同一个 `planV4IngestDrop`，⛔ 高亮不许承诺一个落不下去的目标。
        const magnetTargets: MagnetTarget[] = []
        for (const node of nodesRef.current) {
          if (node.id === pending.source.node.id) continue
          if (plan(pending.source.node, node).kind === 'rejected') continue
          const el = findNodeCardElement(node.id)
          if (!el) continue
          applyMagnetHighlight(el)
          magnetTargets.push({ id: node.id, el })
        }
        pending.magnetTargets = magnetTargets
        setDragState({
          active: true,
          sourceNodeId: pending.source.node.id,
          ghost: {
            originX: pending.originRect.left,
            originY: pending.originRect.top,
            width: pending.originRect.width,
            height: pending.originRect.height,
            label: pending.source.label,
            ...(pending.source.thumbnailUrl
              ? { thumbnailUrl: pending.source.thumbnailUrl }
              : {}),
          },
          reason: null,
          pendingChoice: null,
        })
      }

      const ghostEl = ghostElRef.current
      if (ghostEl) {
        ghostEl.style.transform = `translate(${pending.originRect.left + dx}px, ${pending.originRect.top + dy}px)`
      }

      const hitElement = document.elementFromPoint(event.clientX, event.clientY)
      const nodeWrapper =
        hitElement instanceof Element
          ? hitElement.closest('.react-flow__node')
          : null
      let targetId = nodeWrapper?.getAttribute('data-id') ?? null

      // 磁吸吸附：没有直接命中时，吸附半径内最近的合法目标算作目标。直接命中
      // 永远优先于就近。
      if (!targetId && pending.magnetTargets) {
        let nearest: MagnetTarget | null = null
        let nearestDistance = Number.POSITIVE_INFINITY
        for (const candidate of pending.magnetTargets) {
          const distance = distanceToRect(
            event.clientX,
            event.clientY,
            candidate.el.getBoundingClientRect(),
          )
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearest = candidate
          }
        }
        if (
          nearest &&
          nearestDistance <= NODE_STUDIO_INGEST_MAGNET.snapRadiusPx
        ) {
          targetId = nearest.id
        }
      }

      if (targetId === pending.currentTargetId) return
      if (pending.currentTargetId) {
        clearBiteHover(findNodeCardElement(pending.currentTargetId))
      }
      pending.currentTargetId = targetId
      onBiteChangeRef.current?.(null)

      if (!targetId || targetId === pending.source.node.id) return
      const targetNode = nodesRef.current.find((node) => node.id === targetId)
      if (!targetNode) return
      const dropPlan = plan(pending.source.node, targetNode)
      if (dropPlan.kind !== 'rejected') {
        const tiltDeg =
          dx >= 0 ? INGEST_MOTION.biteTiltDeg : -INGEST_MOTION.biteTiltDeg
        applyBiteHover(findNodeCardElement(targetId), tiltDeg)
      }
      // 张口预览：合法的给候选清单，被拒的也报 —— 咬不动之前就看得到为什么。
      onBiteChangeRef.current?.({
        sourceNode: pending.source.node,
        targetNode,
        plan: dropPlan,
      })
    },
    [plan],
  )

  const playSwallow = useCallback(
    (pending: PendingDrag, targetNodeId: string) => {
      const ghostEl = ghostElRef.current
      const targetEl = findNodeCardElement(targetNodeId)
      if (!canAnimate(ghostEl)) {
        playTargetGulpAnimation(targetEl)
        finishDrag()
        return
      }
      const targetRect = targetEl?.getBoundingClientRect() ?? null
      const startRect = ghostEl.getBoundingClientRect()
      const startX = startRect.left
      const startY = startRect.top
      const endX = targetRect
        ? targetRect.left + targetRect.width / 2 - startRect.width / 2
        : startX
      const endY = targetRect
        ? targetRect.top + targetRect.height / 2 - startRect.height / 2
        : startY
      const midX = (startX + endX) / 2
      const midY =
        Math.min(startY, endY) -
        pending.originRect.height * INGEST_MOTION.swallowArcRiseRatio

      ghostEl
        .animate(
          [
            {
              transform: `translate(${startX}px, ${startY}px) scale(1, 1) rotate(0deg)`,
              offset: 0,
            },
            {
              transform: `translate(${midX}px, ${midY}px) scale(${INGEST_MOTION.swallowSquashScaleX}, ${INGEST_MOTION.swallowSquashScaleY}) rotate(6deg)`,
              offset: 0.55,
            },
            {
              transform: `translate(${endX}px, ${endY}px) scale(${INGEST_MOTION.swallowEndScale}, ${INGEST_MOTION.swallowEndScale}) rotate(${INGEST_MOTION.swallowEndRotateDeg}deg)`,
              offset: 1,
            },
          ],
          {
            duration: INGEST_MOTION.swallowDurationMs,
            easing: EASE_SOFT_RETURN_CSS,
            fill: 'forwards',
          },
        )
        .finished.catch(() => undefined)
        .finally(() => {
          playTargetGulpAnimation(targetEl)
          finishDrag()
        })
    },
    [finishDrag],
  )

  const playReject = useCallback(
    (
      pending: PendingDrag,
      targetNodeId: string,
      dropPlan: V4IngestDropPlan,
    ) => {
      const targetEl = findNodeCardElement(targetNodeId)
      const targetRect = targetEl?.getBoundingClientRect() ?? null
      const startRect =
        ghostElRef.current?.getBoundingClientRect() ?? pending.originRect
      setDragState((current) => ({
        ...current,
        reason: {
          x: targetRect
            ? targetRect.left + targetRect.width / 2
            : startRect.left,
          y: targetRect ? targetRect.top : startRect.top,
          text: translateReasonRef.current(dropPlan),
        },
      }))
      clearReasonSoon()
      playTargetRejectShakeAnimation(targetEl)
      finishDrag()
    },
    [clearReasonSoon, finishDrag],
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return
      detach()
      pendingRef.current = null

      if (!pending.dragging) {
        pending.onTap?.()
        return
      }

      clearMagnets(pending)
      if (pending.currentTargetId) {
        clearBiteHover(findNodeCardElement(pending.currentTargetId))
      }
      onBiteChangeRef.current?.(null)

      const targetId = pending.currentTargetId
      const targetNode =
        targetId && targetId !== pending.source.node.id
          ? nodesRef.current.find((node) => node.id === targetId)
          : undefined
      if (!targetNode) {
        // 掉在空白处 / 掉回自己身上 —— 安静退回，没有可抖的目标也没有值得说的
        // 理由。
        finishDrag()
        return
      }

      const dropPlan = plan(pending.source.node, targetNode)
      if (dropPlan.kind === 'rejected') {
        playReject(pending, targetNode.id, dropPlan)
        return
      }
      if (dropPlan.kind === 'single') {
        playSwallow(pending, targetNode.id)
        onConnectRef.current(
          pending.source.node.id,
          targetNode.id,
          dropPlan.candidate.slot,
        )
        return
      }
      // `choose`：多个口都收得下 —— ⛔ **不替用户挑**，把候选交回 UI 点亮。
      const targetRect =
        findNodeCardElement(targetNode.id)?.getBoundingClientRect() ?? null
      setDragState({
        ...EMPTY_DRAG_STATE,
        pendingChoice: {
          sourceNodeId: pending.source.node.id,
          targetNodeId: targetNode.id,
          candidates: dropPlan.candidates,
          x: targetRect ? targetRect.left + targetRect.width / 2 : 0,
          y: targetRect ? targetRect.top : 0,
        },
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detach/handlePointerMove/Cancel 与本回调一起注册，是稳定的 ref 对
    [clearMagnets, finishDrag, plan, playReject, playSwallow],
  )

  const handlePointerCancel = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return
      detach()
      pendingRef.current = null
      clearMagnets(pending)
      if (pending.currentTargetId) {
        clearBiteHover(findNodeCardElement(pending.currentTargetId))
      }
      finishDrag()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上
    [clearMagnets, finishDrag],
  )

  function detach() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerCancel)
  }

  const beginDrag = useCallback(
    ({ source, pointerEvent, originElement, onTap }: BeginV4DragParams) => {
      pendingRef.current = {
        source,
        pointerId: pointerEvent.pointerId,
        startClientX: pointerEvent.clientX,
        startClientY: pointerEvent.clientY,
        originRect: originElement.getBoundingClientRect(),
        dragging: false,
        currentTargetId: null,
        magnetTargets: null,
        ...(onTap ? { onTap } : {}),
      }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerCancel)
    },
    [handlePointerMove, handlePointerUp, handlePointerCancel],
  )

  const resolveChoice = useCallback((slot: NodeSlotId) => {
    setDragState((current) => {
      const choice = current.pendingChoice
      if (!choice) return current
      // ⚠ 落边在这里发而不是在调用方：候选状态是本引擎持有的，让调用方自己
      // 读一遍再发 = 两处各判一次「这个槽还在不在候选里」。
      if (choice.candidates.some((candidate) => candidate.slot === slot)) {
        onConnectRef.current(choice.sourceNodeId, choice.targetNodeId, slot)
        playTargetGulpAnimation(findNodeCardElement(choice.targetNodeId))
      }
      return { ...current, pendingChoice: null }
    })
  }, [])

  const cancelChoice = useCallback(() => {
    setDragState((current) =>
      current.pendingChoice ? { ...current, pendingChoice: null } : current,
    )
  }, [])

  // 卸载时的兜底：拖到一半离开页面也不留 window 监听。
  useEffect(
    () => () => {
      detach()
      if (reasonTimeoutRef.current !== null) {
        window.clearTimeout(reasonTimeoutRef.current)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- detach 读的三个回调本身是稳定引用
    [handlePointerMove, handlePointerUp, handlePointerCancel],
  )

  return {
    dragState,
    beginDrag,
    registerGhostElement,
    resolveChoice,
    cancelChoice,
  }
}

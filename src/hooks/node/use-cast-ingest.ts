'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import {
  EASE_INGEST_CSS,
  EASE_SOFT_RETURN_CSS,
  INGEST_MOTION,
} from '@/constants/motion'
import {
  NODE_STUDIO_INGEST_MAGNET,
  NODE_STUDIO_INGEST_REJECT_REASON_IDS,
  type NodeStudioIngestRejectReason,
} from '@/constants/node-studio'
import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { canConnectNodeTypes } from '@/lib/node-connection-rules'
import { getUpstreamNodes } from '@/lib/node-workflow-graph'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'
import type { CastSectionId } from '@/components/business/node/CastDock'

/** A Cast card being dragged — everything the engine needs to know about the
 *  source without re-deriving it mid-drag (§6.3 吞噬合法性 = canConnectNodeTypes). */
export interface CastIngestSourceInfo {
  node: NodeWorkflowNode
  sectionId: CastSectionId
  label: string
  thumbnailUrl?: string
}

export interface CastIngestGhostState {
  originX: number
  originY: number
  width: number
  height: number
  label: string
  thumbnailUrl?: string
}

export interface CastIngestReasonBubble {
  x: number
  y: number
  text: string
}

export interface CastIngestDragState {
  active: boolean
  sourceNodeId: string | null
  ghost: CastIngestGhostState | null
  reason: CastIngestReasonBubble | null
}

const EMPTY_DRAG_STATE: CastIngestDragState = {
  active: false,
  sourceNodeId: null,
  ghost: null,
  reason: null,
}

export interface CastIngestEvaluation {
  legal: boolean
  reason?: NodeStudioIngestRejectReason
  current?: number
  limit?: number
}

/** Source types that contribute to a target's image_urls payload — the only
 *  pool a numeric capacity check makes sense for (voice/videoReference have no
 *  known per-target cap in this codebase, so capacityFull never fires for
 *  them — honest silence over a guessed number, §6.3 "不可得则只说"). */
function isImageContributingNode(node: NodeWorkflowNode): boolean {
  return (
    node.type === NODE_TYPE_IDS.characterImage ||
    node.type === NODE_TYPE_IDS.backgroundImage ||
    node.type === NODE_TYPE_IDS.frameImage ||
    node.type === NODE_TYPE_IDS.shot ||
    node.type === NODE_TYPE_IDS.image
  )
}

/**
 * §6.3 张口预览 / 咬不动「参考位已满 n/m」的容量来源: only checked when the
 * target is an image-reference consumer (video/shot) AND already has a model
 * selected (an unset model has no knowable cap — the check is skipped
 * entirely rather than guessing, matching the task packet's "上限不可得则
 * 只说「参考位已满」" — here that case simply never raises capacityFull).
 * Exported for the S5f B3 张口预览 mini-list: the preview shows "参考位 n/m"
 * whenever the cap is knowable, NOT only when it's exceeded — so the preview
 * needs the raw numbers even while `evaluateCastIngest` stays legal. Kept
 * OUT of `CastIngestEvaluation`'s legal shape on purpose (existing tests
 * assert `toEqual({ legal: true })`, and "legal + incidental numbers" would
 * be a weaker contract).
 */
export function previewIngestCapacity(
  sourceNode: NodeWorkflowNode,
  targetNode: NodeWorkflowNode,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): { current: number; limit: number } | null {
  if (!isImageContributingNode(sourceNode)) return null
  const targetIsVideo = targetNode.type === NODE_TYPE_IDS.seedance
  const targetIsShot =
    targetNode.type === NODE_TYPE_IDS.shot ||
    (targetNode.type === NODE_TYPE_IDS.image &&
      targetNode.data.role === NODE_IMAGE_ROLE_IDS.shot)
  if (!targetIsVideo && !targetIsShot) return null

  const model = targetNode.data.model
  if (!model) return null
  const limit = getMaxReferenceImages(model.adapterType, model.modelId)
  if (!Number.isFinite(limit) || limit <= 0) return null

  const current = getUpstreamNodes(targetNode.id, edges, nodes).filter(
    isImageContributingNode,
  ).length
  return { current, limit }
}

/** Pure legality + capacity check — no DOM, no state. Reused by the pointer
 *  hover pass (bite/no-bite) and the drop pass (connect/reject). */
export function evaluateCastIngest(
  sourceNode: NodeWorkflowNode,
  targetNode: NodeWorkflowNode,
  edges: readonly NodeWorkflowEdge[],
  nodes: readonly NodeWorkflowNode[],
): CastIngestEvaluation {
  if (sourceNode.id === targetNode.id) {
    return {
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    }
  }
  const typeOk = canConnectNodeTypes(
    sourceNode.type,
    targetNode.type,
    targetNode.data.role,
    sourceNode.data.role,
  )
  if (!typeOk) {
    return {
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    }
  }
  const duplicate = edges.some(
    (edge) => edge.source === sourceNode.id && edge.target === targetNode.id,
  )
  if (duplicate) {
    return {
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate,
    }
  }
  const capacity = previewIngestCapacity(sourceNode, targetNode, edges, nodes)
  if (capacity && capacity.current >= capacity.limit) {
    return {
      legal: false,
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull,
      current: capacity.current,
      limit: capacity.limit,
    }
  }
  return { legal: true }
}

// Exported — S5d 融合动画补齐 reuses these to locate a canvas node's card
// element for the fusion gesture's own bite/flight beats (StudioNodeWorkbench
// has no other way to resolve a bare node id to its rendered `.node-card-paper`).
export function findNodeWrapperElement(nodeId: string): HTMLElement | null {
  const wrappers = document.querySelectorAll<HTMLElement>('.react-flow__node')
  for (const wrapper of wrappers) {
    if (wrapper.getAttribute('data-id') === nodeId) return wrapper
  }
  return null
}

export function findNodeCardElement(nodeId: string): HTMLElement | null {
  const wrapper = findNodeWrapperElement(nodeId)
  if (!wrapper) return null
  return wrapper.querySelector<HTMLElement>('.node-card-paper') ?? wrapper
}

/** S5f B: a node's rendered ingest-target surface — its canvas card if
 *  visible, else its Cast dock mirror card (an eaten identity node only
 *  exists on screen as the dock card). One resolver so magnet/quick-throw/
 *  hit-test all agree on what "the target element" means. */
export function findIngestTargetElement(nodeId: string): HTMLElement | null {
  return (
    findNodeCardElement(nodeId) ??
    document.querySelector<HTMLElement>(`[data-cast-card-node-id="${nodeId}"]`)
  )
}

/** Distance from a point to a rect's closest edge (0 while inside) — the
 *  磁吸 snap metric (§6.3 ①「指针阈值半径内最近目标」). Edge distance, not
 *  center distance: big cards would otherwise never win against small ones. */
export function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const dx = Math.max(rect.left - x, 0, x - rect.right)
  const dy = Math.max(rect.top - y, 0, y - rect.bottom)
  return Math.hypot(dx, dy)
}

const INGEST_MAGNET_CLASS = 'node-ingest-magnet'

/** S5f B1 磁吸弱档：mark one legal target while a drag is in flight. Same
 *  imperative-classList discipline as `applyBiteHover` (never React state —
 *  applied to N cards at drag start, per-frame renders must not eat it). */
export function applyMagnetHighlight(el: HTMLElement): void {
  el.classList.add(INGEST_MAGNET_CLASS)
}

/** Global sweep instead of per-element bookkeeping — a drag can end from
 *  pointerup/pointercancel/unmount, and hot-expanding the Cast dock mid-drag
 *  can even re-render carriers; one querySelectorAll is the only cleanup
 *  that's correct in every exit path. */
export function clearAllMagnetHighlights(): void {
  document
    .querySelectorAll<HTMLElement>(`.${INGEST_MAGNET_CLASS}`)
    .forEach((el) => el.classList.remove(INGEST_MAGNET_CLASS))
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Guards every `.animate()` call — jsdom (and any pre-WAAPI browser) has no
 *  `Element.prototype.animate`; without this check the whole gesture would
 *  throw instead of just skipping the keyframe flourish (§8's
 *  prefers-reduced-motion "降级淡入淡出" degrades further here to "no
 *  animation", the connection itself still completes normally). */
function canAnimate(el: Element | null): el is HTMLElement {
  return (
    Boolean(el) && typeof el?.animate === 'function' && !prefersReducedMotion()
  )
}

/**
 * Target "消化落定" gulp overshoot (§8) — factored out of `playSwallow` below
 * so the canvas-node-driven fusion gesture (loose image → character/
 * background card, `StudioNodeWorkbench`'s `onNodeDragStop`) can play the
 * exact same feedback on a successful fuse without duplicating the keyframe
 * array. Also the settle beat `playCanvasFuseSwallowAnimation` below calls
 * once its own flight ghost finishes.
 */
export function playTargetGulpAnimation(targetEl: Element | null): void {
  if (!canAnimate(targetEl)) return
  targetEl.animate(
    [
      { transform: 'scale(1.08, 0.9)', offset: 0 },
      {
        transform: `scale(${INGEST_MOTION.gulpOvershootScaleX}, ${INGEST_MOTION.gulpOvershootScaleY})`,
        offset: 0.6,
      },
      { transform: 'scale(1, 1)', offset: 1 },
    ],
    { duration: INGEST_MOTION.gulpDurationMs, easing: 'ease-out' },
  )
}

/** Target 咬不动 shake (§8) — factored out of `playReject` below for the same
 *  reuse reason as `playTargetGulpAnimation`. */
export function playTargetRejectShakeAnimation(targetEl: Element | null): void {
  if (!canAnimate(targetEl)) return
  targetEl.classList.add('node-ingest-reject')
  targetEl
    .animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(0)' },
      ],
      {
        duration: INGEST_MOTION.rejectShakeDurationMs,
        easing: 'ease-in-out',
      },
    )
    .finished.catch(() => undefined)
    .finally(() => {
      targetEl.classList.remove('node-ingest-reject')
    })
}

/** 张口（§8）: applied to a legal fuse target while a card is hovering over
 *  it. Exported so the canvas-image→card fusion gesture (native ReactFlow
 *  node drag, no per-frame hook of its own inside this file) can apply the
 *  SAME bite feedback the Cast-card ingest loop below uses, instead of
 *  reimplementing the class/transform pair. */
export function applyBiteHover(
  targetEl: HTMLElement | null,
  tiltDeg: number,
): void {
  if (!targetEl) return
  targetEl.classList.add('node-ingest-bite')
  targetEl.style.transform = `scale(${INGEST_MOTION.biteScale}) rotate(${tiltDeg}deg)`
}

/** Clears `applyBiteHover` — also used internally by the Cast-card drag loop
 *  below (`clearBite`). */
export function clearBiteHover(targetEl: HTMLElement | null): void {
  if (!targetEl) return
  targetEl.classList.remove('node-ingest-bite')
  targetEl.style.transform = ''
}

/**
 * S5d ⑤ 融合动画修复：the canvas-image→card fusion gesture rides ReactFlow's
 * OWN native node drag (StudioNodeWorkbench's onNodeDragStop) — the dragged
 * node is real, not a ghost, and by the time this fires it's already sitting
 * at the drop point. There is still a "吸入" beat to play (§8 full three-beat
 * spec, not just the target's gulp): this clones the dragged card's rendered
 * DOM into a one-shot `position:fixed` body ghost (escapes the zoomed
 * ReactFlow viewport transform, same reasoning as the Cast-card engine's own
 * portal ghost) and flies it the short remaining distance into the target's
 * center using the EXACT same squash/arc/rotate keyframes + `INGEST_MOTION`
 * numbers as `playSwallow` below — one curve, two directions. `onSettle`
 * fires after the target's gulp plays, so the caller can flip
 * `fusedIntoNodeId` (hide the real node) in lockstep with the ghost
 * finishing instead of a jarring instant swap.
 */
export function playCanvasFuseSwallowAnimation(
  sourceEl: HTMLElement,
  targetNodeId: string,
  onSettle: () => void,
): void {
  const targetEl = findNodeCardElement(targetNodeId)

  if (!canAnimate(sourceEl)) {
    playTargetGulpAnimation(targetEl)
    onSettle()
    return
  }

  const sourceRect = sourceEl.getBoundingClientRect()
  const targetRect = targetEl?.getBoundingClientRect() ?? null

  const ghost = sourceEl.cloneNode(true) as HTMLElement
  ghost.removeAttribute('id')
  ghost.style.position = 'fixed'
  ghost.style.left = '0'
  ghost.style.top = '0'
  ghost.style.margin = '0'
  ghost.style.width = `${sourceRect.width}px`
  ghost.style.height = `${sourceRect.height}px`
  ghost.style.zIndex = '50'
  ghost.style.pointerEvents = 'none'
  document.body.appendChild(ghost)

  const startX = sourceRect.left
  const startY = sourceRect.top
  const endX = targetRect
    ? targetRect.left + targetRect.width / 2 - sourceRect.width / 2
    : startX
  const endY = targetRect
    ? targetRect.top + targetRect.height / 2 - sourceRect.height / 2
    : startY
  const midX = (startX + endX) / 2
  const midY =
    Math.min(startY, endY) -
    sourceRect.height * INGEST_MOTION.swallowArcRiseRatio

  const cleanup = () => {
    ghost.remove()
    playTargetGulpAnimation(targetEl)
    onSettle()
  }

  ghost
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
        easing: EASE_INGEST_CSS,
        fill: 'forwards',
      },
    )
    .finished.catch(() => undefined)
    .finally(cleanup)
}

/** One legal drop target collected at drag start — kept with its element so
 *  the per-frame nearest-target scan (磁吸) never re-queries the DOM. */
interface MagnetTarget {
  id: string
  el: HTMLElement
}

interface PendingDrag {
  source: CastIngestSourceInfo
  pointerId: number
  startClientX: number
  startClientY: number
  originRect: DOMRect
  dragging: boolean
  currentTargetId: string | null
  /** null until the drag threshold is crossed (magnet lights up with the
   *  ghost, not on plain taps). */
  magnetTargets: MagnetTarget[] | null
  /** S5f B2 触屏长按 → 快投 (only armed for touch pointers with an
   *  onLongPress handler). */
  longPressTimer: number | null
  onTap?(): void
  onLongPress?(): void
}

export interface BeginCastDragParams {
  source: CastIngestSourceInfo
  pointerEvent: ReactPointerEvent<Element>
  originElement: HTMLElement
  /** Called if the pointer never crosses the drag threshold — lets the
   *  caller treat it as a plain tap without double-handling click. */
  onTap?(): void
  /** S5f B2: touch-only long-press (NODE_STUDIO_INGEST_QUICK_THROW.
   *  longPressMs) before the drag threshold is crossed — the touchscreen
   *  entry into quick-throw mode (desktop uses the hover button instead). */
  onLongPress?(): void
}

/** S5f B3 张口预览: fired whenever the bite target changes — `null` on
 *  leaving a target / drag end. The consumer (workbench) translates this
 *  into the mini-list overlay; the engine itself stays i18n-free. */
export interface CastIngestBiteChange {
  sourceNode: NodeWorkflowNode
  targetNode: NodeWorkflowNode
  evaluation: CastIngestEvaluation
}

interface UseCastIngestEngineParams {
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  onConnect(sourceId: string, targetId: string): void
  translateReason(evaluation: CastIngestEvaluation): string
  onBiteChange?(change: CastIngestBiteChange | null): void
}

export interface CastIngestEngine {
  dragState: CastIngestDragState
  beginDrag(params: BeginCastDragParams): void
  registerGhostElement(el: HTMLDivElement | null): void
}

/**
 * S5b 吞噬手势引擎（node-canvas.md §6.3/§8）。Owns the custom pointer drag
 * lifecycle for Cast dock cards: hit-testing against `.react-flow__node`
 * DOM (data-id), legality/capacity evaluation, and the three-beat WAAPI
 * animation. Per-frame hover feedback on the TARGET card is applied by
 * imperative `classList`/`style` writes (not React state) — the target node
 * component is never re-rendered by a drag, so NodeShell.tsx needs no
 * changes for this (task packet Allowed Scope keeps that file to the
 * ingredient-chip unbind only). Called ONCE near the top of the canvas tree.
 */
export function useCastIngestEngine({
  nodes,
  edges,
  onConnect,
  translateReason,
  onBiteChange,
}: UseCastIngestEngineParams): CastIngestEngine {
  const [dragState, setDragState] =
    useState<CastIngestDragState>(EMPTY_DRAG_STATE)

  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  const edgesRef = useRef(edges)
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])
  const onConnectRef = useRef(onConnect)
  useEffect(() => {
    onConnectRef.current = onConnect
  }, [onConnect])
  const translateReasonRef = useRef(translateReason)
  useEffect(() => {
    translateReasonRef.current = translateReason
  }, [translateReason])
  const onBiteChangeRef = useRef(onBiteChange)
  useEffect(() => {
    onBiteChangeRef.current = onBiteChange
  }, [onBiteChange])

  const pendingRef = useRef<PendingDrag | null>(null)
  const ghostElRef = useRef<HTMLDivElement | null>(null)
  const reasonTimeoutRef = useRef<number | null>(null)

  const registerGhostElement = useCallback((el: HTMLDivElement | null) => {
    ghostElRef.current = el
  }, [])

  const clearReasonSoon = useCallback(() => {
    if (reasonTimeoutRef.current !== null) {
      window.clearTimeout(reasonTimeoutRef.current)
    }
    reasonTimeoutRef.current = window.setTimeout(() => {
      setDragState((current) => ({ ...current, reason: null }))
    }, INGEST_MOTION.rejectReasonVisibleMs)
  }, [])

  const clearBite = useCallback((targetId: string | null) => {
    if (!targetId) return
    clearBiteHover(findNodeCardElement(targetId))
  }, [])

  const finishDrag = useCallback(() => {
    setDragState(EMPTY_DRAG_STATE)
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
        // Crossing the threshold cancels the touch long-press candidate —
        // the gesture is now unambiguously a drag, not a quick-throw entry.
        if (pending.longPressTimer !== null) {
          window.clearTimeout(pending.longPressTimer)
          pending.longPressTimer = null
        }
        // S5f B1 磁吸弱档: light up EVERY legal drop target for this source
        // once, at drag activation — evaluated against the same
        // evaluateCastIngest the drop uses, so the highlight never promises
        // a target the drop would reject. Canvas cards only
        // (findNodeCardElement, not the dock fallback): the dock dims to
        // opacity-40 during a cast drag and isn't part of this direction's
        // hit path.
        const magnetTargets: MagnetTarget[] = []
        for (const node of nodesRef.current) {
          if (node.id === pending.source.node.id) continue
          const evaluation = evaluateCastIngest(
            pending.source.node,
            node,
            edgesRef.current,
            nodesRef.current,
          )
          if (!evaluation.legal) continue
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
            thumbnailUrl: pending.source.thumbnailUrl,
          },
          reason: null,
        })
      }

      const ghostEl = ghostElRef.current
      if (ghostEl) {
        const x = pending.originRect.left + dx
        const y = pending.originRect.top + dy
        ghostEl.style.transform = `translate(${x}px, ${y}px)`
      }

      const hitElement = document.elementFromPoint(event.clientX, event.clientY)
      const nodeWrapper =
        hitElement instanceof Element
          ? hitElement.closest('.react-flow__node')
          : null
      let targetId = nodeWrapper?.getAttribute('data-id') ?? null

      // S5f B1 磁吸吸附: no direct hit → nearest legal target within the
      // snap radius counts as the target (张口满档 + 松手即落这家 —— 磁吸
      // 既是视觉也是落点放宽). Direct hits always win over proximity.
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
      clearBite(pending.currentTargetId)
      pending.currentTargetId = targetId
      onBiteChangeRef.current?.(null)

      if (targetId && targetId !== pending.source.node.id) {
        const targetNode = nodesRef.current.find((node) => node.id === targetId)
        const evaluation: CastIngestEvaluation = targetNode
          ? evaluateCastIngest(
              pending.source.node,
              targetNode,
              edgesRef.current,
              nodesRef.current,
            )
          : { legal: false }
        if (evaluation.legal) {
          const tiltDeg =
            dx >= 0 ? INGEST_MOTION.biteTiltDeg : -INGEST_MOTION.biteTiltDeg
          applyBiteHover(findNodeCardElement(targetId), tiltDeg)
        }
        // S5f B3 张口预览: legal → normal mini-list; capacityFull → red row
        // (契约校验前置 — 咬不动之前就看得到超限). typeMismatch/duplicate
        // stay silent (nothing useful to preview).
        if (
          targetNode &&
          (evaluation.legal ||
            evaluation.reason ===
              NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull)
        ) {
          onBiteChangeRef.current?.({
            sourceNode: pending.source.node,
            targetNode,
            evaluation,
          })
        }
      }
    },
    [clearBite],
  )

  const playSwallow = useCallback(
    (pending: PendingDrag, targetNode: NodeWorkflowNode) => {
      const ghostEl = ghostElRef.current
      const targetEl = findNodeCardElement(targetNode.id)
      const targetRect = targetEl?.getBoundingClientRect() ?? null
      const startRect = ghostEl?.getBoundingClientRect() ?? pending.originRect
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

      if (canAnimate(ghostEl)) {
        const animation = ghostEl.animate(
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
            easing: EASE_INGEST_CSS,
            fill: 'forwards',
          },
        )
        animation.finished
          .catch(() => undefined)
          .finally(() => {
            playTargetGulpAnimation(targetEl)
            finishDrag()
          })
        return
      }

      // Reduced motion: no flight/gulp keyframes, just resolve immediately.
      finishDrag()
    },
    [finishDrag],
  )

  const playReject = useCallback(
    (
      pending: PendingDrag,
      targetNode: NodeWorkflowNode | null,
      evaluation: CastIngestEvaluation,
    ) => {
      const ghostEl = ghostElRef.current
      const startRect = ghostEl?.getBoundingClientRect() ?? pending.originRect
      const startX = startRect.left
      const startY = startRect.top
      const targetEl = targetNode ? findNodeCardElement(targetNode.id) : null
      const targetRect = targetEl?.getBoundingClientRect() ?? null

      if (targetNode) {
        const reasonText = translateReasonRef.current(evaluation)
        const bubbleX = targetRect
          ? targetRect.left + targetRect.width / 2
          : startX
        const bubbleY = targetRect ? targetRect.top : startY
        setDragState((current) => ({
          ...current,
          reason: { x: bubbleX, y: bubbleY, text: reasonText },
        }))
        clearReasonSoon()
      }

      playTargetRejectShakeAnimation(targetEl)

      if (canAnimate(ghostEl) && targetRect) {
        const lungeX =
          startX + (targetRect.left - startX) * INGEST_MOTION.rejectLungeRatio
        const lungeY =
          startY + (targetRect.top - startY) * INGEST_MOTION.rejectLungeRatio
        const animation = ghostEl.animate(
          [
            {
              transform: `translate(${startX}px, ${startY}px) scale(1) rotate(0deg)`,
              offset: 0,
            },
            {
              transform: `translate(${lungeX}px, ${lungeY}px) scale(1.05) rotate(-4deg)`,
              offset: 0.4,
            },
            {
              transform: `translate(${startX}px, ${startY}px) scale(1) rotate(0deg)`,
              offset: 1,
            },
          ],
          {
            duration: INGEST_MOTION.rejectDurationMs,
            easing: EASE_SOFT_RETURN_CSS,
            fill: 'forwards',
          },
        )
        animation.finished.catch(() => undefined).finally(finishDrag)
        return
      }

      finishDrag()
    },
    [clearReasonSoon, finishDrag],
  )

  const handlePointerUp = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      pendingRef.current = null

      if (!pending.dragging) {
        pending.onTap?.()
        return
      }

      clearBite(pending.currentTargetId)
      const targetId = pending.currentTargetId
      const targetNode =
        targetId && targetId !== pending.source.node.id
          ? nodesRef.current.find((node) => node.id === targetId)
          : null

      if (!targetNode) {
        // Dropped on empty canvas / back onto itself — return quietly, no
        // target to shake and no reason worth surfacing.
        const ghostEl = ghostElRef.current
        if (canAnimate(ghostEl)) {
          const rect = ghostEl.getBoundingClientRect()
          ghostEl
            .animate(
              [
                {
                  transform: `translate(${rect.left}px, ${rect.top}px) scale(1)`,
                  offset: 0,
                },
                {
                  transform: `translate(${pending.originRect.left}px, ${pending.originRect.top}px) scale(1)`,
                  offset: 1,
                },
              ],
              {
                duration: INGEST_MOTION.rejectDurationMs,
                easing: EASE_SOFT_RETURN_CSS,
                fill: 'forwards',
              },
            )
            .finished.catch(() => undefined)
            .finally(finishDrag)
          return
        }
        finishDrag()
        return
      }

      const evaluation = evaluateCastIngest(
        pending.source.node,
        targetNode,
        edgesRef.current,
        nodesRef.current,
      )
      if (evaluation.legal) {
        playSwallow(pending, targetNode)
        onConnectRef.current(pending.source.node.id, targetNode.id)
        return
      }
      playReject(pending, targetNode, evaluation)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlePointerMove/Cancel are stable refs registered together
    [clearBite, finishDrag, playReject, playSwallow],
  )

  const handlePointerCancel = useCallback(
    (event: PointerEvent) => {
      const pending = pendingRef.current
      if (!pending || event.pointerId !== pending.pointerId) return
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      pendingRef.current = null
      clearBite(pending.currentTargetId)
      finishDrag()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlePointerMove/Up are stable refs registered together
    [clearBite, finishDrag],
  )

  const beginDrag = useCallback(
    ({
      source,
      pointerEvent,
      originElement,
      onTap,
      onLongPress,
    }: BeginCastDragParams) => {
      pendingRef.current = {
        source,
        pointerId: pointerEvent.pointerId,
        startClientX: pointerEvent.clientX,
        startClientY: pointerEvent.clientY,
        originRect: originElement.getBoundingClientRect(),
        dragging: false,
        currentTargetId: null,
        magnetTargets: null,
        longPressTimer: null,
        onTap,
        onLongPress,
      }
      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerCancel)
    },
    [handlePointerMove, handlePointerUp, handlePointerCancel],
  )

  // Safety net: drop any still-registered window listeners on unmount (e.g.
  // navigating away mid-drag).
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      if (reasonTimeoutRef.current !== null) {
        window.clearTimeout(reasonTimeoutRef.current)
      }
    },
    [handlePointerMove, handlePointerUp, handlePointerCancel],
  )

  return { dragState, beginDrag, registerGhostElement }
}

'use client'

/**
 * 画布节点的 **DOM 定位与动画基元**（吞噬 / 磁吸 / 咬合 / 墨线的命令式那一半）。
 *
 * ③d-4 从 `use-cast-ingest.ts` 整段搬来 —— 那个文件的另一半（v3 引擎
 * `useCastIngestEngine` 与 v3 形状的 `evaluateCastIngest`）随翻转一起删了，而这
 * 一半跟节点形状**一点关系都没有**：它只认 `.react-flow__node[data-id]` 和
 * `.node-card-paper`，v3 v4 的卡都长这样。
 *
 * ⚠ 全部命令式改 DOM / WAAPI，⛔ 不进 React state：这些效果每帧都要动，而每帧
 * setState 会重渲整棵画布（2026-07-18「拖动手感钝」那次的根因）。
 *
 * 消费方：v4 吞噬引擎（`use-cast-ingest-engine-v4`）与状态边
 * （`edges/NodeWorkflowStatusEdge`）。
 */

import {
  EASE_INGEST_CSS,
  EASE_SOFT_RETURN_CSS,
  INGEST_MOTION,
  NODE_EDGE_SIGNING_MOTION,
} from '@/constants/motion'
import { NODE_STUDIO_INGEST_MAGNET } from '@/constants/node-studio'

// Exported — S5d 融合动画补齐 reuses these to locate a canvas node's card
// element for the fusion gesture's own bite/flight beats (the workbench
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

/** Exported for callers outside the WAAPI keyframe functions below that need
 *  the same check BEFORE deciding whether to even start a signing/unsigning
 *  episode (R3-2, `useEdgeSigning`'s scheduling of the 墨线签署/褪去 hold
 *  windows) — `canAnimate` bundles this with an element+WAAPI-support check
 *  that only makes sense once an element is already in hand. */
export function prefersReducedMotion(): boolean {
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
/**
 * Narrows to `Element` (not `HTMLElement`) so the SAME guard covers both the
 * ingest engine's `.node-card-paper` targets AND R3-2's SVG `<path>` edge
 * elements (`playInkSignAnimation`/`playInkUnsignAnimation`) — TS intersects
 * a custom predicate with the argument's static type, so an `HTMLElement |
 * null` caller still narrows to `HTMLElement` and an `SVGPathElement | null`
 * caller still narrows to `SVGPathElement`; only the guard body needs to stay
 * generic.
 */
function canAnimate(el: Element | null): el is Element {
  return (
    Boolean(el) && typeof el?.animate === 'function' && !prefersReducedMotion()
  )
}

/**
 * Target "消化落定" gulp overshoot (§8), shared by the active Cast-card
 * ingest layer and its swallow animation.
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

/** Target 咬不动 shake (§8), shared by canvas ingest feedback. */
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

/** 张口（§8）: applied to a legal ingest target while a card is hovering. */
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
 * R3-2「墨线签署」目标轻咽（canvas-relationship-v3 §2.7）: the target's own
 * subtle acknowledgement pulse for a NON-folding source (collector card /
 * voice / videoReference dragged onto a shot/video/character target) — the
 * source doesn't disappear this time, so the target doesn't get the full
 * 消化落定 gulp (that overshoot reads as "I just swallowed something",
 * dishonest here). `handleNodeDragStop`'s bite-hover cleanup always runs
 * first and resets the target's inline transform to `''`, so this starts
 * clean from `scale(1)` — unlike `playTargetGulpAnimation`, which continues
 * from the 张口 bite scale an ingest gulp is chained after.
 */
export function playTargetSigningSettleAnimation(
  targetEl: Element | null,
): void {
  if (!canAnimate(targetEl)) return
  targetEl.animate(
    [
      { transform: 'scale(1)', offset: 0 },
      {
        transform: `scale(${NODE_EDGE_SIGNING_MOTION.targetSettleScaleDown})`,
        offset: 0.4,
      },
      {
        transform: `scale(${NODE_EDGE_SIGNING_MOTION.targetSettleScaleUp})`,
        offset: 0.75,
      },
      { transform: 'scale(1)', offset: 1 },
    ],
    { duration: NODE_EDGE_SIGNING_MOTION.targetSettleMs, easing: 'ease-out' },
  )
}

/**
 * R3-2「本体归位」: the dragged node's OWN rendered `.node-card-paper` (not a
 * ghost — the real card never disappears for a non-folding source) slides
 * from wherever the native drag left it back to where it started, then
 * `onSettle` writes the real `position` data back to the drag-start value.
 * `dx`/`dy` are a caller-computed SCREEN-PIXEL delta (origin - drop, in that
 * order) — deliberately not flow-space, so the animation is correct
 * regardless of current zoom/pan without this function needing to know about
 * either. Data commits only in `onSettle`; skipped/failed animation still
 * calls `onSettle` immediately so the data
 * layer is never left stale (§8 red line: "动画失败或被跳过时数据结果必须完全
 * 一致").
 */
export function playNodeBounceBack(
  cardEl: HTMLElement | null,
  dx: number,
  dy: number,
  onSettle: () => void,
): void {
  if (!canAnimate(cardEl) || (dx === 0 && dy === 0)) {
    onSettle()
    return
  }
  cardEl
    .animate(
      [
        { transform: 'translate(0px, 0px)', offset: 0 },
        { transform: `translate(${dx}px, ${dy}px)`, offset: 1 },
      ],
      {
        duration: NODE_EDGE_SIGNING_MOTION.bounceBackMs,
        easing: EASE_SOFT_RETURN_CSS,
        fill: 'forwards',
      },
    )
    .finished.catch(() => undefined)
    .finally(() => {
      cardEl.style.transform = ''
      onSettle()
    })
}

/**
 * R3-2「墨线画入」: draws an edge's already-rendered SVG `<path>` from nothing
 * to its full stroke via `stroke-dashoffset`, using the path's OWN measured
 * length (`getTotalLength`) so it works for any smoothstep geometry without a
 * static keyframe table. Called by `NodeWorkflowStatusEdge` when
 * `data.justSigned` rises — the edge itself owns the timing, this is just the
 * WAAPI primitive. Leaves the dasharray/offset cleared on finish so the path
 * falls back to its normal (fully solid) rendering once the draw-in is done —
 * a later 关系线 toggle / selection-driven reveal of the SAME edge must not
 * inherit a stale dasharray.
 */
export function playInkSignAnimation(pathEl: SVGPathElement | null): void {
  if (!pathEl || !canAnimate(pathEl)) return
  let length: number
  try {
    length = pathEl.getTotalLength()
  } catch {
    return
  }
  if (!Number.isFinite(length) || length <= 0) return

  pathEl.style.strokeDasharray = `${length}`
  pathEl
    .animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: NODE_EDGE_SIGNING_MOTION.inkDrawMs,
      easing: EASE_INGEST_CSS,
      fill: 'forwards',
    })
    .finished.catch(() => undefined)
    .finally(() => {
      pathEl.style.strokeDasharray = ''
      pathEl.style.strokeDashoffset = ''
    })
}

/**
 * R3-2「墨线反向褪去」: the unbind mirror of `playInkSignAnimation` — dashoffset
 * retreats from fully-drawn back to nothing. Called on a `data.unsigning`
 * edge, which `useEdgeSigning` keeps alive for exactly this long
 * AFTER the real edge is already gone from `workflow.edges` (§2.7 "数据先删,
 * 动画只是视觉层") — `onSettle` here is purely a courtesy callback (there is
 * nothing left to commit; the caller only uses it, if at all, for cleanup),
 * unlike `playNodeBounceBack`'s onSettle which carries a real data write.
 */
export function playInkUnsignAnimation(
  pathEl: SVGPathElement | null,
  onSettle?: () => void,
): void {
  if (!pathEl || !canAnimate(pathEl)) {
    onSettle?.()
    return
  }
  let length: number
  try {
    length = pathEl.getTotalLength()
  } catch {
    onSettle?.()
    return
  }
  if (!Number.isFinite(length) || length <= 0) {
    onSettle?.()
    return
  }

  pathEl.style.strokeDasharray = `${length}`
  pathEl
    .animate([{ strokeDashoffset: 0 }, { strokeDashoffset: length }], {
      duration: NODE_EDGE_SIGNING_MOTION.unsignFadeMs,
      easing: EASE_INGEST_CSS,
      fill: 'forwards',
    })
    .finished.catch(() => undefined)
    .finally(() => {
      onSettle?.()
    })
}

/* ─── 助手回执：改过的节点闪一次（进度表 22 · D7 Q4）─────────────────── */

const ASSISTANT_TOUCH_CLASS = 'node-assistant-touched'

/**
 * 让一个节点闪一次 outline —— 助手刚改过它。
 *
 * ⚠ 与本文件其余几只手同一条纪律：**命令式 classList**，⛔ 不进 React state。
 * 判据在这里比拖拽那几条更硬：改一个节点会让那张卡重渲染，而 React 那一侧的
 * className 会在同一拍把 class 覆盖掉 —— 表现是「有时闪有时不闪」。
 * ⚠ 先摘再挂：同一个节点在一轮里被改两次时，不重启动画就只闪第一次
 *   （CSS 动画对「class 已经在了」不做任何事）。`void offsetWidth` 是强制重排，
 *   ⛔ 别删 —— 删掉之后浏览器会把摘与挂合并成一次无变化。
 * ⚠ 节点不在 DOM 里（折叠的镜 / 手机镜头带）时**静默跳过**：闪一个看不见的东西
 *   不是失败，面板里那行「已改 N 项」照样说得清。
 */
export function flashAssistantTouchedNode(nodeId: string): void {
  const el = findNodeCardElement(nodeId)
  if (!el) return
  el.classList.remove(ASSISTANT_TOUCH_CLASS)
  void el.offsetWidth
  el.classList.add(ASSISTANT_TOUCH_CLASS)
  el.addEventListener(
    'animationend',
    () => el.classList.remove(ASSISTANT_TOUCH_CLASS),
    { once: true },
  )
}

import {
  DURATION_MS,
  EASE_STANDARD_CSS,
  MEDIA_DRAG_LIFT,
  SPRING_CSS_MS,
} from '@/constants/motion'
import { cssSpringEasing } from '@/lib/studio-workbench-motion'

import { findNodeCardElement, prefersReducedMotion } from './node-ingest-dom'

/**
 * 素材拖上画布（动效样片 AF，owner 2026-10-08 批准，替掉 2026-09-12 那张 1×1 透明拖影）。
 *
 * - **拿起**：浏览器自带的拖影仍然关掉（它是源元素的半透明截图，不可编程）；改由这里
 *   放一张跟手的影子 —— 素材格那么大，用 `spring-slot` 放大到 `MEDIA_DRAG_LIFT.scale`、
 *   带浮层投影，跟着指针走。
 * - **落进画布**：落卡照旧走 `placeMediaAtFlow` → `graph.addNode`（op 表，⛔ 这里不碰图），
 *   新卡一出现，影子用 `spring-expand` 从拿着的样子展开到那张卡的位置与尺寸，再淡掉，
 *   底下就是真卡。
 * - **没落进画布**（落在别处 / Esc）：影子缩回原尺寸淡掉。
 *
 * 纪律与 `fly-to-composer.ts` 相同：纯装饰、影子一定会被摘掉（兜底定时器）。
 * `prefers-reduced-motion` 下影子照样跟手（那是直接操作，不是装饰），只是不放大、
 * 不展开，落下直接摘掉。
 */

interface ActiveGhost {
  readonly el: HTMLElement
  readonly offsetX: number
  readonly offsetY: number
  readonly reduced: boolean
  x: number
  y: number
  landing: boolean
  readonly onDragOver: (event: DragEvent) => void
}

let active: ActiveGhost | null = null

/** 等新卡出现在 DOM 里最多几帧（与 `fadeInNodeCards` 同一种等法）。 */
const LAND_MAX_WAIT_FRAMES = 10

function place(ghost: ActiveGhost, clientX: number, clientY: number) {
  ghost.x = clientX - ghost.offsetX
  ghost.y = clientY - ghost.offsetY
  ghost.el.style.translate = `${ghost.x}px ${ghost.y}px`
}

function remove(ghost: ActiveGhost) {
  document.removeEventListener('dragover', ghost.onDragOver, true)
  ghost.el.remove()
  if (active === ghost) active = null
}

/** 素材格 `dragstart` 时调：放一张跟手的影子，并把浏览器自带的拖影换成透明图。 */
export function liftMediaDragGhost(
  event: Pick<DragEvent, 'clientX' | 'clientY'> & {
    readonly dataTransfer: DataTransfer | null
  },
  tile: HTMLElement,
  src: string,
  transparentImage: HTMLImageElement | null,
): void {
  if (typeof window === 'undefined') return
  if (active) remove(active)
  if (transparentImage) event.dataTransfer?.setDragImage(transparentImage, 0, 0)
  const rect = tile.getBoundingClientRect()
  if (rect.width === 0) return

  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: '8px',
    background: `center / cover no-repeat url("${src.replace(/"/g, '%22')}") var(--muted)`,
    boxShadow: 'var(--shadow-float)',
    pointerEvents: 'none',
    zIndex: '9999',
  })
  const reduced = prefersReducedMotion()
  const ghost: ActiveGhost = {
    el,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    reduced,
    x: rect.left,
    y: rect.top,
    landing: false,
    onDragOver: (dragEvent) => {
      // 有的浏览器在拖拽末尾补一帧 (0, 0)，跳过它，⛔ 让影子闪到左上角。
      if (dragEvent.clientX === 0 && dragEvent.clientY === 0) return
      if (active === ghost && !ghost.landing)
        place(ghost, dragEvent.clientX, dragEvent.clientY)
    },
  }
  el.style.translate = `${rect.left}px ${rect.top}px`
  document.body.appendChild(el)
  document.addEventListener('dragover', ghost.onDragOver, true)
  active = ghost
  if (!reduced && typeof el.animate === 'function') {
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: `scale(${MEDIA_DRAG_LIFT.scale})` },
      ],
      {
        duration: SPRING_CSS_MS.slot,
        easing: cssSpringEasing('slot'),
        fill: 'forwards',
      },
    )
  }
  // 兜底：拖拽被系统吞掉、dragend 没来时也不留残影。
  window.setTimeout(() => {
    if (active === ghost && !ghost.landing) remove(ghost)
  }, MEDIA_DRAG_LIFT.maxLifetimeMs)
}

/**
 * 画布接住了这一拖、刚建了 `nodeId` 那张卡：影子展开成那张卡，再淡掉。
 * ⚠ 只管画法 —— 卡是调用方先经 op 表建好的。
 */
export function landMediaDragGhost(nodeId: string): void {
  const ghost = active
  if (!ghost) return
  ghost.landing = true
  if (ghost.reduced || typeof ghost.el.animate !== 'function') {
    remove(ghost)
    return
  }
  // 未缩放的那一份：缩放另由 transform 从拿起的那一档回到 1。
  const from = {
    left: ghost.x,
    top: ghost.y,
    width: ghost.el.offsetWidth,
    height: ghost.el.offsetHeight,
  }
  const tick = (frame: number) => {
    const card = findNodeCardElement(nodeId)
    const rect = card?.getBoundingClientRect()
    if (!rect || rect.width === 0) {
      if (frame >= LAND_MAX_WAIT_FRAMES) {
        remove(ghost)
        return
      }
      window.requestAnimationFrame(() => tick(frame + 1))
      return
    }
    ghost.el.getAnimations().forEach((animation) => animation.cancel())
    const expand = ghost.el.animate(
      [
        {
          translate: `${from.left}px ${from.top}px`,
          width: `${from.width}px`,
          height: `${from.height}px`,
          transform: `scale(${MEDIA_DRAG_LIFT.scale})`,
        },
        {
          translate: `${rect.left}px ${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          transform: 'scale(1)',
        },
      ],
      {
        duration: SPRING_CSS_MS.expand,
        easing: cssSpringEasing('expand'),
        fill: 'forwards',
      },
    )
    const fade = ghost.el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION_MS.fast,
      delay: SPRING_CSS_MS.expand,
      easing: EASE_STANDARD_CSS,
      fill: 'forwards',
    })
    let done = false
    const finish = () => {
      if (done) return
      done = true
      expand.cancel()
      remove(ghost)
    }
    fade.onfinish = finish
    window.setTimeout(
      finish,
      SPRING_CSS_MS.expand + DURATION_MS.fast + DURATION_MS.base,
    )
  }
  window.requestAnimationFrame(() => tick(1))
}

/** 素材格 `dragend` 时调：没落进画布就缩回、淡掉。落进画布的那一下归 `landMediaDragGhost`。 */
export function endMediaDragGhost(): void {
  const ghost = active
  if (!ghost || ghost.landing) return
  if (ghost.reduced || typeof ghost.el.animate !== 'function') {
    remove(ghost)
    return
  }
  const drop = ghost.el.animate(
    [
      { transform: `scale(${MEDIA_DRAG_LIFT.scale})`, opacity: 1 },
      { transform: 'scale(1)', opacity: 0 },
    ],
    { duration: DURATION_MS.base, easing: EASE_STANDARD_CSS, fill: 'forwards' },
  )
  let done = false
  const finish = () => {
    if (done) return
    done = true
    remove(ghost)
  }
  drop.onfinish = finish
  window.setTimeout(finish, DURATION_MS.base * 2)
}

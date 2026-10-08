import {
  DROP_FLY,
  DURATION_MS,
  EASE_STANDARD_CSS,
  REFERENCE_FLY,
  SPRING_CSS_MS,
} from '@/constants/motion'
import { cssSpringEasing } from '@/lib/studio-workbench-motion'

/**
 * 「用它当参考」：结果格上的图飞进助手输入框（owner 2026-10-07 动效方向）。
 *
 * ⭐ 纯装饰 —— 真正的挂载（`addChip`）由调用方**立刻**做，这里只放一个影子飞过去。
 * ⚠ 影子**一定会被摘掉**：正常播完、动画没跑起来（后台标签页里 WAAPI 会被暂停，
 *   `onfinish` 可能永远不来）两条路都通向同一个清理，兜底定时器保证不留残影
 *   （与 `VoiceRoomCasting` 的飞入同一条教训）。
 * ⚠ `prefers-reduced-motion` 下不飞。
 */
export function flyImageToComposer(
  from: HTMLElement,
  to: HTMLElement,
  src: string,
): void {
  if (
    typeof window === 'undefined' ||
    typeof from.animate !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  if (a.width === 0 || b.width === 0) return

  const ghost = document.createElement('img')
  ghost.src = src
  ghost.alt = ''
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    objectFit: 'cover',
    borderRadius: '8px',
    pointerEvents: 'none',
    zIndex: '9999',
  })
  document.body.appendChild(ghost)

  const size = REFERENCE_FLY.toSizePx
  const scale = size / Math.max(a.width, a.height)
  /* 落点：输入框左上角往里一点 —— chip 就排在那一行的开头。 */
  const dx = b.left + 12 + size / 2 - (a.left + a.width / 2)
  const dy = b.top + 12 + size / 2 - (a.top + a.height / 2)
  const animation = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - REFERENCE_FLY.liftPx}px) scale(${(1 + scale) / 2})`,
        opacity: 1,
        offset: 0.5,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        opacity: 0.4,
      },
    ],
    { duration: DURATION_MS.slow * 2, easing: EASE_STANDARD_CSS },
  )
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    ghost.remove()
  }
  animation.onfinish = cleanup
  animation.oncancel = cleanup
  window.setTimeout(cleanup, DURATION_MS.slow * 2 + DURATION_MS.base)
}

/**
 * 「钉住」：这一排来源卡的影子缩着飞到面板顶上那条钉住条（owner 2026-10-07 动效
 * 第 3 批「引用和钉住」）。与上面那颗同一套纪律：纯装饰、真正的钉住由调用方先做、
 * 影子一定会被摘掉、减少动效时不飞。
 */
export function flyCloneToTarget(from: HTMLElement, to: HTMLElement): void {
  if (
    typeof window === 'undefined' ||
    typeof from.animate !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
    return
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  if (a.width === 0 || b.width === 0) return

  const ghost = from.cloneNode(true) as HTMLElement
  ghost.setAttribute('aria-hidden', 'true')
  ghost.removeAttribute('id')
  ghost.removeAttribute('data-testid')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: '0',
    pointerEvents: 'none',
    transformOrigin: 'top left',
    zIndex: '9999',
  })
  document.body.appendChild(ghost)

  const scale = Math.min(1, b.height / Math.max(a.height, 1))
  const dx = b.left - a.left
  const dy = b.top - a.top
  const animation = ghost.animate(
    [
      {
        transform: 'translate(0, 0) scale(1)',
        opacity: 1,
        filter: 'blur(0px)',
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        opacity: 0,
        filter: 'blur(4px)',
      },
    ],
    { duration: DURATION_MS.slow * 2, easing: EASE_STANDARD_CSS },
  )
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    ghost.remove()
  }
  animation.onfinish = cleanup
  animation.oncancel = cleanup
  window.setTimeout(cleanup, DURATION_MS.slow * 2 + DURATION_MS.base)
}

/** 拖图落进来之后，新缩略图排进的那一行（参考图条 / 视频素材排）挂这个属性。 */
export const STUDIO_DROP_ROW_ATTR = 'data-studio-drop-row'

/**
 * 「拖图进来」（动效样片 T，owner 2026-10-08）：接住图的那块区域先填实（图浮出来、
 * 虚线褪掉），再整块缩成一颗小缩略图、用 `spring-expand` 飞到 `scope` 里那一排
 * （`STUDIO_DROP_ROW_ATTR`）的末尾。与上面两颗同一套纪律：纯装饰（真正的挂载由调用方
 * 先做）、影子一定会被摘掉、减少动效时不飞。
 *
 * `from` 由调用方在区域**收起之前**量好传进来 —— 松手那一帧虚线框就卸了。
 * 影子是脱离文档流的 `position: fixed` 一层，动它的尺寸不会让别的东西重排。
 */
export function flyDropIntoRow(
  from: DOMRect,
  scope: HTMLElement | null,
  preview: File | string | null,
): void {
  if (
    typeof window === 'undefined' ||
    !scope ||
    typeof scope.animate !== 'function' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
    from.width === 0
  )
    return
  const row = scope.querySelector<HTMLElement>(`[${STUDIO_DROP_ROW_ATTR}]`)
  const anchor = (row ?? scope).getBoundingClientRect()
  const last = row?.lastElementChild?.getBoundingClientRect()
  const size = DROP_FLY.toSizePx
  const toLeft = last ? last.right + DROP_FLY.gapPx : anchor.left + 12
  const toTop = last ? last.top + (last.height - size) / 2 : anchor.top + 12

  // 本地文件给一个临时地址，影子摘掉时一起收回。
  const src = preview instanceof File ? URL.createObjectURL(preview) : preview
  const ghost = document.createElement('div')
  ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    borderRadius: '12px',
    border: '1.5px dashed var(--border)',
    background: 'var(--muted)',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '9999',
  })
  const fill = document.createElement('div')
  Object.assign(fill.style, {
    position: 'absolute',
    inset: '0',
    background: src
      ? `center / cover no-repeat url("${src.replace(/"/g, '%22')}")`
      : 'var(--foreground)',
    opacity: '0',
  })
  ghost.appendChild(fill)
  document.body.appendChild(ghost)

  // 第一拍：填实。
  const fillIn = fill.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: DURATION_MS.base,
    easing: EASE_STANDARD_CSS,
    fill: 'forwards',
  })
  ghost.animate(
    [{ borderColor: 'var(--border)' }, { borderColor: 'transparent' }],
    {
      duration: DURATION_MS.base,
      easing: EASE_STANDARD_CSS,
      fill: 'forwards',
    },
  )
  // 第二拍：缩成缩略图飞进那一排。
  const fly = ghost.animate(
    [
      {
        left: `${from.left}px`,
        top: `${from.top}px`,
        width: `${from.width}px`,
        height: `${from.height}px`,
        borderRadius: '12px',
      },
      {
        left: `${toLeft}px`,
        top: `${toTop}px`,
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '6px',
      },
    ],
    {
      duration: SPRING_CSS_MS.expand,
      delay: DURATION_MS.base,
      easing: cssSpringEasing('expand'),
      fill: 'forwards',
    },
  )
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    fillIn.cancel()
    ghost.remove()
    if (preview instanceof File && src) URL.revokeObjectURL(src)
  }
  fly.onfinish = cleanup
  fly.oncancel = cleanup
  window.setTimeout(
    cleanup,
    DURATION_MS.base + SPRING_CSS_MS.expand + DURATION_MS.base,
  )
}

import {
  DURATION_MS,
  EASE_STANDARD_CSS,
  REFERENCE_FLY,
} from '@/constants/motion'

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

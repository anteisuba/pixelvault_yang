import {
  DURATION_MS,
  EASE_STANDARD_CSS,
  LIQUID_TIMING,
  staggerDelay,
} from '@/constants/motion'

/**
 * 图片工作台出图的命令式动效（owner 2026-10-07 工作台原型 12 处）。
 *
 * 与 `fly-to-composer.ts` 同一套纪律：
 * ① **纯装饰**：状态由调用方先改好，这里只让元素「从哪来」地出现，⛔ 不等它播完。
 * ② **一定收得回**：后台标签页里 WAAPI 可能不回 `onfinish`，兜底定时器把动画
 *    `cancel()` 掉，元素回到自己的正常样式（看得见），⛔ 不留 `opacity:0`。
 * ③ `prefers-reduced-motion` 下什么都不做。
 */

/** 生成键（底部输入框右端那颗圆键）的锚点；新一轮的格子从这里散开。 */
export const STUDIO_GENERATE_ANCHOR_ATTR = 'data-studio-generate'
/** 底部输入框那张卡；「做同款」的配方落进来时它顶一下。 */
export const STUDIO_COMPOSER_ATTR = 'data-studio-composer'

function canAnimate(el: HTMLElement | null): el is HTMLElement {
  return (
    el !== null &&
    typeof window !== 'undefined' &&
    typeof el.animate === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function settle(animation: Animation, totalMs: number) {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    animation.cancel()
  }
  animation.onfinish = finish
  window.setTimeout(finish, totalMs + DURATION_MS.base)
}

/**
 * 「结果从生成键散开」：这一格从生成键的位置、缩成按钮那么大，飞到自己的位置
 * 再长开。`order` 决定先后（一格一格错开，⛔ 一起炸开）。
 */
export function flyTileFromGenerate(tile: HTMLElement, order: number): void {
  if (!canAnimate(tile)) return
  const source = document.querySelector<HTMLElement>(
    `[${STUDIO_GENERATE_ANCHOR_ATTR}]`,
  )
  if (!source) return
  const a = source.getBoundingClientRect()
  const b = tile.getBoundingClientRect()
  if (a.width === 0 || b.width === 0) return
  const dx = a.left + a.width / 2 - (b.left + b.width / 2)
  const dy = a.top + a.height / 2 - (b.top + b.height / 2)
  const scale = a.width / Math.max(b.width, 1)
  const delay = staggerDelay(order) * 1000
  const duration = DURATION_MS.slow * 2
  const animation = tile.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        opacity: 0,
      },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ],
    { duration, delay, easing: EASE_STANDARD_CSS, fill: 'backwards' },
  )
  settle(animation, delay + duration)
}

/**
 * 「做同款落进输入框」（V 简化版）：配方写进来之后，提示词由糊变清，整张卡轻轻
 * 顶一下 —— 一处动，⛔ 不逐个飞 chip。
 */
export function landRecipeInComposer(): void {
  const card = document.querySelector<HTMLElement>(`[${STUDIO_COMPOSER_ATTR}]`)
  if (!canAnimate(card)) return
  const bump = card.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.008)', offset: 0.35 },
      { transform: 'scale(1)' },
    ],
    { duration: DURATION_MS.slow, easing: EASE_STANDARD_CSS },
  )
  settle(bump, DURATION_MS.slow)
  const prompt = document.getElementById('studio-prompt')
  if (!prompt) return
  const swap = prompt.animate(
    [
      { opacity: 0, filter: `blur(${LIQUID_TIMING.blurPx}px)` },
      { opacity: 1, filter: 'blur(0px)' },
    ],
    { duration: DURATION_MS.base, easing: EASE_STANDARD_CSS },
  )
  settle(swap, DURATION_MS.base)
}

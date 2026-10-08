import {
  DURATION_MS,
  EASE_STANDARD_CSS,
  LIQUID_TIMING,
  FOCUS_FLOAT,
  RECIPE_LAND,
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

/** 输入框工具行里「做同款」会一颗颗落进来的 chip（模型 / 规格），值 = 落下的先后。 */
export const STUDIO_RECIPE_CHIP_ATTR = 'data-studio-recipe-chip'

/**
 * CSS 侧弹簧的 `linear()` 近似（globals.css `--spring-*-ease`），给 WAAPI 用 ——
 * `Element.animate` 的 easing 不认 `var()`，只好读出算好的值。读不到（测试环境 /
 * 老浏览器）退回脊柱曲线。
 */
export function cssSpringEasing(preset: 'slot' | 'expand' = 'slot'): string {
  if (typeof window === 'undefined') return EASE_STANDARD_CSS
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(`--spring-${preset}-ease`)
    .trim()
  return value || EASE_STANDARD_CSS
}

/**
 * 「做同款落进输入框」（动效样片 V 简化版，owner 2026-10-08）：配方写进来之后
 * **一样接一样**地动 —— ① 提示词由糊变清；② 模型、规格 chip 从上面一颗颗落进
 * 输入框（`spring-slot`，错开 `RECIPE_LAND.chipStaggerMs`）；③ 最后一颗落定，整张卡
 * 轻轻顶一下。同一时刻只有一样在动。
 */
export function landRecipeInComposer(): void {
  const card = document.querySelector<HTMLElement>(`[${STUDIO_COMPOSER_ATTR}]`)
  if (!canAnimate(card)) return
  const easing = cssSpringEasing('slot')
  let at = 0
  const prompt = document.getElementById('studio-prompt')
  if (prompt) {
    const swap = prompt.animate(
      [
        { opacity: 0, filter: `blur(${LIQUID_TIMING.blurPx}px)` },
        { opacity: 1, filter: 'blur(0px)' },
      ],
      { duration: DURATION_MS.base, easing: EASE_STANDARD_CSS },
    )
    settle(swap, DURATION_MS.base)
    at = DURATION_MS.base
  }
  const chips = Array.from(
    card.querySelectorAll<HTMLElement>(`[${STUDIO_RECIPE_CHIP_ATTR}]`),
  ).sort(
    (a, b) =>
      Number(a.getAttribute(STUDIO_RECIPE_CHIP_ATTR)) -
      Number(b.getAttribute(STUDIO_RECIPE_CHIP_ATTR)),
  )
  chips.forEach((chip, index) => {
    const delay = at + index * RECIPE_LAND.chipStaggerMs
    const drop = chip.animate(
      [
        {
          transform: `translateY(-${RECIPE_LAND.dropPx}px)`,
          opacity: 0,
          filter: `blur(${RECIPE_LAND.blurPx}px)`,
        },
        { transform: 'translateY(0)', opacity: 1, filter: 'blur(0px)' },
      ],
      {
        duration: DURATION_MS.slow,
        delay,
        easing,
        fill: 'backwards',
      },
    )
    settle(drop, delay + DURATION_MS.slow)
  })
  if (chips.length > 0) {
    at += (chips.length - 1) * RECIPE_LAND.chipStaggerMs + DURATION_MS.slow
  }
  const bump = card.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${RECIPE_LAND.bumpScale})`, offset: 0.35 },
      { transform: 'scale(1)' },
    ],
    { duration: DURATION_MS.slow, delay: at, easing: EASE_STANDARD_CSS },
  )
  settle(bump, at + DURATION_MS.slow)
}

/**
 * 「点进输入框」（动效样片 Z，owner 2026-10-08）：框先长高（CSS `min-height` 那一拍），
 * 长完之后工具行的模型 / 规格 chip 从框里往上浮出来 —— 由下方 `FOCUS_FLOAT.risePx`
 * 处、带一点糊，`spring-slot` 落到原位。焦点只在框里挪动（从提示词跳到 chip）⛔ 再浮。
 */
export function floatComposerChips(): void {
  const card = document.querySelector<HTMLElement>(`[${STUDIO_COMPOSER_ATTR}]`)
  if (!canAnimate(card)) return
  const easing = cssSpringEasing('slot')
  card
    .querySelectorAll<HTMLElement>(`[${STUDIO_RECIPE_CHIP_ATTR}]`)
    .forEach((chip) => {
      const delay = DURATION_MS.base
      const rise = chip.animate(
        [
          {
            transform: `translateY(${FOCUS_FLOAT.risePx}px)`,
            opacity: FOCUS_FLOAT.fromOpacity,
            filter: `blur(${FOCUS_FLOAT.blurPx}px)`,
          },
          { transform: 'translateY(0)', opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: DURATION_MS.slow, delay, easing, fill: 'backwards' },
      )
      settle(rise, delay + DURATION_MS.slow)
    })
}

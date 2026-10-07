/**
 * 助手的**光标**（owner 2026-10-07 动效第 2 批「改工作台」）。
 *
 * 助手改工作台时，一颗近黑的箭头（带助手名字）依次走到被改的那一格，到了才闪
 * （`studio-operator-flash.ts` 那一闪），一格一格来 —— 「同一时间只动一处」。
 * 用户自己的鼠标是白的 / 系统的，黑的这颗是助手：一眼分得清谁在动工作台。
 *
 * ── 纪律 ──────────────────────────────────────────────────────────
 * ① **纯装饰、命令式**：一个挂在 body 上的 fixed 元素，⛔ 不进 React state ——
 *    它跨着面板与工作台两棵树走，而且被改的那一格此刻正在重渲染。
 * ② **排队**：一轮改五格就走五站；每站 = 走过去（`DURATION_MS.slow`）+ 那一闪
 *    （`ASSISTANT_TOUCH_FLASH_MOTION.durationMs`）。走完一段时间没新活就淡出。
 * ③ **等待走定时器，不等 `onfinish`**：后台标签页里 WAAPI 会被暂停，`onfinish`
 *    可能永远不来，队列就卡死了（与 `fly-to-composer.ts` 同一条教训）。
 * ④ **只在桌面、只在动效开着时出现**：触屏没有光标这回事；减少动效时调用方直接
 *    闪，不排队（见 `canGuideAssistantCursor`）。
 * ⚠ 那一格此刻不在屏幕上（浮层没展开）时照样调 `flash`（它自己会静默跳过），
 *   光标不往那儿走。
 */

import {
  ASSISTANT_CURSOR_MOTION,
  ASSISTANT_TOUCH_FLASH_MOTION,
  DURATION_MS,
  EASE_STANDARD_CSS,
  LIQUID_TIMING,
} from '@/constants/motion'
import {
  STUDIO_OPERATOR_FIELD_IDS,
  type StudioOperatorField,
} from '@/constants/studio-assistant-operator'

/** 光标外观在 `globals.css`（`.assistant-cursor`），⛔ 这里不写颜色。 */
const CURSOR_CLASS = 'assistant-cursor'
const ARROW_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.5l11 6.2-4.6 1.1L6.6 13z"/></svg>'

interface Station {
  field: StudioOperatorField
  targets(): HTMLElement[]
  flash(): void
}

const queue: Station[] = []
let running = false
let cursor: HTMLDivElement | null = null
let labelNode: HTMLSpanElement | null = null
/** 光标此刻停在哪（`null` = 没在屏幕上）。 */
let position: { x: number; y: number } | null = null
let hideTimer: number | null = null
let label = ''

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** 光标上写的名字 —— 宿主（Dock）拿到 persona 后告诉这里一次。 */
export function setAssistantCursorLabel(name: string): void {
  label = name
  if (labelNode) labelNode.textContent = name
}

/** 桌面（精确指针）+ 动效开着 + 浏览器有 WAAPI 才走光标；否则调用方直接闪。 */
export function canGuideAssistantCursor(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  if (typeof HTMLElement.prototype.animate !== 'function') return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return false
  return window.matchMedia('(pointer: fine)').matches
}

function ensureCursor(): HTMLDivElement {
  if (cursor && cursor.isConnected) return cursor
  const el = document.createElement('div')
  el.className = CURSOR_CLASS
  el.setAttribute('aria-hidden', 'true')
  el.innerHTML = ARROW_SVG
  const name = document.createElement('span')
  name.textContent = label
  el.appendChild(name)
  document.body.appendChild(el)
  cursor = el
  labelNode = name
  position = null
  return el
}

const translate = (p: { x: number; y: number }) =>
  `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`

/** 箭头尖落在那一格左侧往里一点、垂直居中 —— 像有人伸手点了它。 */
function pointOf(target: HTMLElement): { x: number; y: number } {
  const rect = target.getBoundingClientRect()
  return {
    x: rect.left + Math.min(ASSISTANT_CURSOR_MOTION.insetPx, rect.width / 2),
    y: rect.top + rect.height / 2,
  }
}

/**
 * 那一格「换内容」的手感：内容由糊变清（提示词、模型名、比例、张数都是这一下），
 * 参考图位上最新那一张再顶一下。只动 filter / transform，⛔ 不动尺寸。
 */
function playContentSwap(field: StudioOperatorField, target: HTMLElement) {
  target.animate(
    [{ filter: `blur(${LIQUID_TIMING.blurPx}px)` }, { filter: 'blur(0px)' }],
    { duration: LIQUID_TIMING.swapInS * 1000, easing: EASE_STANDARD_CSS },
  )
  if (field !== STUDIO_OPERATOR_FIELD_IDS.references) return
  const images = target.querySelectorAll<HTMLElement>('img')
  const newest = images[images.length - 1]
  newest?.animate(
    [
      { transform: 'scale(0.92)' },
      { transform: 'scale(1.03)', offset: 0.6 },
      { transform: 'scale(1)' },
    ],
    { duration: DURATION_MS.slow, easing: EASE_STANDARD_CSS },
  )
}

async function visit(station: Station) {
  const target = station.targets().find((el) => el.getClientRects().length > 0)
  if (!target) {
    station.flash()
    return
  }
  const el = ensureCursor()
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
  const to = pointOf(target)
  if (position === null) {
    /* 第一次出现：就地淡入，从右下角挪进来一点。 */
    const from = {
      x: to.x + ASSISTANT_CURSOR_MOTION.enterOffsetPx,
      y: to.y + ASSISTANT_CURSOR_MOTION.enterOffsetPx,
    }
    el.style.transform = translate(to)
    el.style.opacity = '1'
    el.animate(
      [
        { transform: translate(from), opacity: 0 },
        { transform: translate(to), opacity: 1 },
      ],
      { duration: DURATION_MS.base, easing: EASE_STANDARD_CSS },
    )
    position = to
    await wait(DURATION_MS.base)
  } else {
    const from = position
    el.style.transform = translate(to)
    el.animate([{ transform: translate(from) }, { transform: translate(to) }], {
      duration: DURATION_MS.slow,
      easing: EASE_STANDARD_CSS,
    })
    position = to
    await wait(DURATION_MS.slow)
  }
  station.flash()
  for (const each of station.targets()) {
    if (each.getClientRects().length > 0) playContentSwap(station.field, each)
  }
  await wait(ASSISTANT_TOUCH_FLASH_MOTION.durationMs)
}

function scheduleHide() {
  hideTimer = window.setTimeout(() => {
    hideTimer = null
    const el = cursor
    if (!el || running) return
    el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION_MS.base,
      easing: EASE_STANDARD_CSS,
    })
    el.style.opacity = '0'
    position = null
  }, ASSISTANT_CURSOR_MOTION.idleHideMs)
}

async function drain() {
  running = true
  try {
    while (queue.length > 0) {
      const station = queue.shift()
      if (station) await visit(station)
    }
  } finally {
    running = false
    scheduleHide()
  }
}

/**
 * 让光标走到这一格，到了再闪。⚠ 调用方先判 `canGuideAssistantCursor()`；
 * 这里不再判第二次。
 */
export function guideAssistantCursor(station: Station): void {
  queue.push(station)
  if (!running) void drain()
}

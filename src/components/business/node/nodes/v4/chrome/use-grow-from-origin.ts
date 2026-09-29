'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { usePresence } from 'motion/react'

import { DURATION_MS, EASE_STANDARD_CSS } from '@/constants/motion'

/** 画中框的标题与底栏晚这么多进场（设计画布「画布 · 点开」A 动效表）。 */
const CHROME_DELAY_MS = DURATION_MS.fast
/** 关上缩回那张卡的时长（开 320 · 关 240）。 */
const CLOSE_MS = 240

interface GrowFromOriginOptions {
  /** 来处：那张卡。没给（或量不到）就在原地淡入、微微放大。 */
  readonly origin?: RefObject<HTMLElement | null> | undefined
  /** 要长出来的那个框（FLIP 的终点）。 */
  readonly box: RefObject<HTMLElement | null>
  /** 压暗层：与框同进同退。 */
  readonly scrim: RefObject<HTMLElement | null>
  /** 框里晚进、先退的那几条（标题 / 底栏）。 */
  readonly chrome?: RefObject<HTMLElement | null>
  readonly reduce: boolean
}

function flipFrom(origin: DOMRect, box: DOMRect): string {
  const dx = origin.left + origin.width / 2 - (box.left + box.width / 2)
  const dy = origin.top + origin.height / 2 - (box.top + box.height / 2)
  // 等比缩放：框与卡的宽高比常常不一样，拉伸会把字压扁；按宽对齐读成「这张卡长大了」。
  const scale = Math.max(origin.width / box.width, 0.05)
  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

function canAnimate(element: HTMLElement | null): element is HTMLElement {
  return !!element && typeof element.animate === 'function'
}

/**
 * 双击看图与画中框的开合（node-canvas-v2 §1 第 12 条 · 方向 A「从卡上长出来」）：
 * 开 = 从**卡片本身的位置和大小**放大到中间（320 标准），压暗层同进，标题与底栏晚 120；
 * 关 = 标题与底栏先退，框缩回那张卡（240），压暗层同退。减少动态效果下一律 120 淡入淡出。
 *
 * 关要播完才能卸：调用方把浮层包在 `AnimatePresence` 里，这里用 `usePresence`
 * 拖住卸载，播完再放行。⛔ 不在调用方各自记「正在关」。
 */
export function useGrowFromOrigin({
  origin,
  box,
  scrim,
  chrome,
  reduce,
}: GrowFromOriginOptions): { readonly closing: boolean } {
  const [isPresent, safeToRemove] = usePresence()
  const openedFrom = useRef<string | null>(null)
  // 退场只在「刚被摘下」那一刻起一次；放行用最新的那只回调。
  const release = useRef(safeToRemove)
  useLayoutEffect(() => {
    release.current = safeToRemove
  })

  useLayoutEffect(() => {
    const boxElement = box.current
    if (!canAnimate(boxElement)) return
    const scrimElement = scrim.current
    const chromeElements = chrome?.current
      ? Array.from(
          chrome.current.querySelectorAll<HTMLElement>('[data-grow-chrome]'),
        )
      : []
    const started: Animation[] = []
    if (reduce) {
      for (const element of [boxElement, scrimElement]) {
        if (element)
          started.push(
            element.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: DURATION_MS.fast,
              fill: 'backwards',
            }),
          )
      }
    } else {
      const originRect = origin?.current?.getBoundingClientRect()
      const from =
        originRect && originRect.width > 0
          ? flipFrom(originRect, boxElement.getBoundingClientRect())
          : 'scale(0.96)'
      openedFrom.current = from
      started.push(
        boxElement.animate(
          [
            { transform: from, opacity: 0 },
            { opacity: 1, offset: 0.35 },
            { transform: 'none', opacity: 1 },
          ],
          {
            duration: DURATION_MS.slow,
            easing: EASE_STANDARD_CSS,
            fill: 'backwards',
          },
        ),
      )
      if (scrimElement)
        started.push(
          scrimElement.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: DURATION_MS.base,
            easing: EASE_STANDARD_CSS,
            fill: 'backwards',
          }),
        )
      for (const element of chromeElements) {
        started.push(
          element.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: DURATION_MS.base,
            delay: CHROME_DELAY_MS,
            easing: EASE_STANDARD_CSS,
            fill: 'backwards',
          }),
        )
      }
    }
    // ⚠ 清理时收掉自己起的动画：开发态 StrictMode 会把这一段跑两遍，第二遍要是量到
    // 被第一遍变过形的框，算出来就是 scale(1) —— 只剩淡入、看不出从卡上长出来。
    return () => {
      for (const animation of started) animation.cancel()
    }
    // 只在挂上那一刻播：之后的重渲染（切版本、打字）不重播。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isPresent) return
    const boxElement = box.current
    if (!canAnimate(boxElement)) {
      release.current?.()
      return
    }
    const scrimElement = scrim.current
    const running: Animation[] = []
    if (reduce) {
      for (const element of [boxElement, scrimElement]) {
        if (element)
          running.push(
            element.animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: DURATION_MS.fast,
              fill: 'forwards',
            }),
          )
      }
    } else {
      // 卡可能在开着的时候被挪过 —— 缩回去之前再量一次。
      const originRect = origin?.current?.getBoundingClientRect()
      const to =
        originRect && originRect.width > 0
          ? flipFrom(originRect, boxElement.getBoundingClientRect())
          : (openedFrom.current ?? 'scale(0.96)')
      for (const element of chrome?.current?.querySelectorAll<HTMLElement>(
        '[data-grow-chrome]',
      ) ?? []) {
        element.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: DURATION_MS.fast,
          fill: 'forwards',
        })
      }
      running.push(
        boxElement.animate(
          [
            { transform: 'none', opacity: 1 },
            { opacity: 1, offset: 0.7 },
            { transform: to, opacity: 0 },
          ],
          { duration: CLOSE_MS, easing: EASE_STANDARD_CSS, fill: 'forwards' },
        ),
      )
      if (scrimElement)
        running.push(
          scrimElement.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: CLOSE_MS,
            easing: EASE_STANDARD_CSS,
            fill: 'forwards',
          }),
        )
    }
    let cancelled = false
    void Promise.all(running.map((animation) => animation.finished))
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) release.current?.()
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent])

  return { closing: !isPresent }
}

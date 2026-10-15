'use client'

import { useLayoutEffect, type RefObject } from 'react'

const COMPOSER_HEIGHT_VAR = '--studio-mobile-composer-height'

function keyboardInset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    '--keyboard-inset',
  )
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : 0
}

/**
 * 手机工作台底部输入框 → `.studio-layout-v2` 上的 `--studio-mobile-composer-height`
 * （舞台按它在输入框上方结束）。
 *
 * 键盘升起 / 正在写的时候图不缩（手机稿 v10，owner 2026-10-09「不要缩小了，还是换成覆盖吧」）：
 * - 量出来的高度扣掉键盘那一截 —— 键盘只抬输入框，⛔ 进舞台的下边距；
 * - 输入框里有焦点、或宿主说「展开着」（`frozen`）时不再更新：输入框长高就盖在图上，
 *   收起 / 失焦后再按收起时的高度量一次。
 */
export function useStudioMobileComposerHeight(
  composerRef: RefObject<HTMLElement | null>,
  frozen = false,
) {
  useLayoutEffect(() => {
    const composer = composerRef.current
    const layout = composer?.closest<HTMLElement>('.studio-layout-v2')
    if (!composer || !layout) return
    const update = () => {
      if (frozen || composer.contains(document.activeElement)) return
      const height = composer.getBoundingClientRect().height - keyboardInset()
      layout.style.setProperty(COMPOSER_HEIGHT_VAR, `${Math.ceil(height)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(composer)
    // 失焦那一下 activeElement 还没换走 —— 等它落定再量。
    const onFocusOut = () => requestAnimationFrame(update)
    composer.addEventListener('focusout', onFocusOut)
    return () => {
      observer.disconnect()
      composer.removeEventListener('focusout', onFocusOut)
    }
  }, [composerRef, frozen])

  useLayoutEffect(() => {
    const layout =
      composerRef.current?.closest<HTMLElement>('.studio-layout-v2')
    return () => {
      layout?.style.removeProperty(COMPOSER_HEIGHT_VAR)
    }
  }, [composerRef])
}

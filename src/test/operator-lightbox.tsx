import { screen } from '@testing-library/react'

/**
 * 助手面板的灯箱是一份模块级 store + 一颗挂在 body 上的真组件。组件测试把
 * `<StudioOperatorLightbox />` 和被测组件一起渲染，再用 `openedLightbox()` 读它此刻
 * 画着哪一张 —— ⛔ 不再把 `openOperatorLightbox` 换成假函数去数调用。
 * 每例结束记得 `closeOperatorLightbox()`（store 跨用例常驻）。
 */
/** 真的 `next/image` 会把地址包进 `/_next/image?url=…`：还原成原图地址再比。 */
function originalSrc(src: string | null): string | null {
  if (!src?.includes('/_next/image?')) return src
  return new URL(src, 'http://localhost').searchParams.get('url')
}

export function openedLightbox(): {
  src: string | null
  caption: string | null
  referrerPolicy: string | null
} | null {
  const dialog = screen.queryByRole('dialog')
  if (!dialog) return null
  const img = dialog.querySelector('img')
  const caption = dialog.querySelector('[data-float] > span')
  return {
    src: originalSrc(img?.getAttribute('src') ?? null),
    caption: caption?.textContent ?? null,
    referrerPolicy: img?.getAttribute('referrerpolicy') ?? null,
  }
}

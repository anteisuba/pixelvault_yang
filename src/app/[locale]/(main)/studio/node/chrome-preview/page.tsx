import { notFound } from 'next/navigation'

import { ChromePreviewBoard } from './ChromePreviewBoard'

/**
 * ⚠ **S11 删**（v3 spec §9）。
 *
 * S0 交付的是七件**共用件**，四类节点要到 S2–S6 才换过来——在那之前它们在真机上
 * 没有任何可达的入口。这一页把七件按设计画板摆一遍，只为了「能在真浏览器里量
 * `getComputedStyle`」这一件事：圆角 18、backdrop-filter 只在浮层、卡面不透明、
 * 提示词栏 44、chip 上限 3。
 *
 * 只在开发环境可达（`NODE_ENV !== 'development'` 直接 404），⛔ 不进 sitemap、
 * ⛔ 不加导航入口。
 */
export default function NodeChromePreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ChromePreviewBoard />
}

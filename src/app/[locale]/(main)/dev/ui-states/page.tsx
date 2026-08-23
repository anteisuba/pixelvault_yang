import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { UiStateGallery } from './UiStateGallery'

export const metadata: Metadata = {
  title: 'UI 状态样板间',
  robots: 'noindex, nofollow',
}

/**
 * 开发专用：把「要真花钱生成一轮才能看到」的界面状态摆出来。
 *
 * 生产环境直接 404 —— 不是靠「没人知道这个 URL」，是靠路由本身不存在。
 */
export default function DevUiStatesPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <UiStateGallery />
}

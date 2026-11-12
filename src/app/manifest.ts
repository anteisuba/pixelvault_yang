import type { MetadataRoute } from 'next'

import { HOMEPAGE_METADATA } from '@/constants/homepage'
import { ROUTES } from '@/constants/routes'

/**
 * 装到手机主屏（2026-11-12 手机端）：从主屏打开就是一个全屏 App —— 没有浏览器地址栏和
 * 工具栏，直接进「对话」（中间件按语言 / 登录态再分流）。台上的左缘右划返回也只在这种
 * 模式下接（`MobileShell` 的 `useEdgeSwipeBack`）。底色是白板 `panel`（纯白，ui-spec §3.3）。
 * ⚠ 装进主屏的 App 与 Safari 不共用登录：第一次打开要在里面再登一次（邮箱验证码在 App 里走得通）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ANTEI',
    short_name: 'ANTEI',
    description: HOMEPAGE_METADATA.description,
    start_url: ROUTES.STUDIO,
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}

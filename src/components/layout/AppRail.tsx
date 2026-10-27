'use client'

import { StudioConversationList } from '@/components/business/studio/shell/StudioConversationList'
import { usePathname } from '@/i18n/navigation'
import { isStudioShellPath } from '@/lib/studio-shell-route'

/**
 * ≥1024 外壳以外的页（设置 · 别人的主页 · 公开画廊 · 素材详情）也用外壳那条窄图标栏
 * （用户 10-27「侧边栏只保留最新的」）。外壳里的页由 `StudioShell` 自己画这一条，这里不画。
 * 768–1023 平板照旧是 `AppSidebar` 收起档。
 */
export function AppRail() {
  const pathname = usePathname()
  if (isStudioShellPath(pathname)) return null
  return <StudioConversationList className="sticky top-0 hidden desk:flex" />
}

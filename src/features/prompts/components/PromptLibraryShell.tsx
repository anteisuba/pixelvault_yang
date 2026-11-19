'use client'

import type { AppLocale } from '@/i18n/routing'

import { PromptLibraryDesk } from './PromptLibraryDesk'
import type { PromptTemplateCreateInitialValues } from './PromptTemplateCreatePanel'
import type { PromptTemplateListItem } from './PromptTemplateList'

interface PromptLibraryShellProps {
  locale: AppLocale
  recipes: PromptTemplateListItem[]
  createInitialOpen?: boolean
  createInitialValues?: PromptTemplateCreateInitialValues
}

/**
 * 提示词库：手机和桌面同一副库骨架（`PromptLibraryDesk`）：一行工具行（分组药丸「全部提示词 / 收藏」· 切换条 ……… 搜索 · 排序），
 * 和画廊 / 素材长得一样。
 */
export function PromptLibraryShell(props: PromptLibraryShellProps) {
  return (
    <main className="flex h-page flex-col bg-background px-4 pt-4 text-foreground md:px-5.5">
      <PromptLibraryDesk {...props} />
    </main>
  )
}

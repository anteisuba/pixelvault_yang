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
 * 提示词库：手机和桌面同一副库骨架（`PromptLibraryDesk`）。手机上左栏收掉、「收藏」收成药丸，
 * 和画廊 / 素材长得一样（2026-11-12 手机端重排，替掉灰底地台 + 白卡那一版）。
 */
export function PromptLibraryShell(props: PromptLibraryShellProps) {
  return (
    <main className="flex h-page flex-col bg-background px-4 pt-3 text-foreground md:pr-5.5 md:pl-0">
      <PromptLibraryDesk {...props} />
    </main>
  )
}

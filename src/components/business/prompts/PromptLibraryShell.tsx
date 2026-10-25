'use client'

import type { ReactNode } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import type { AppLocale } from '@/i18n/routing'

import { PromptLibraryDesk } from './PromptLibraryDesk'
import type { PromptTemplateCreateInitialValues } from './PromptTemplateCreatePanel'
import type { PromptTemplateListItem } from './PromptTemplateList'

interface PromptLibraryShellProps {
  locale: AppLocale
  recipes: PromptTemplateListItem[]
  createInitialOpen?: boolean
  createInitialValues?: PromptTemplateCreateInitialValues
  /** 手机那一页（灰底地台 + 白卡，等手机端整体重设计）。 */
  phone: ReactNode
}

/** 提示词库：桌面换库骨架（`PromptLibraryDesk`），手机照旧。 */
export function PromptLibraryShell({
  phone,
  ...desk
}: PromptLibraryShellProps) {
  const isMobile = useIsMobile()
  if (isMobile) return phone
  return (
    <main className="flex h-page flex-col bg-background pt-3 pr-5.5 text-foreground">
      <PromptLibraryDesk {...desk} />
    </main>
  )
}

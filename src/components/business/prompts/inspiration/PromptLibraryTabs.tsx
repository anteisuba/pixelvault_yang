'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'

export type PromptLibraryTab = 'mine' | 'inspiration'

interface PromptLibraryTabsProps {
  currentTab: PromptLibraryTab
}

/**
 * 「我的模板 / 共享提示词库」分段（pages/prompts.md：与 LoRA 台顶行同一颗分段）。
 * 选中那一格立刻走过去，页面随 `?tab=` 换 —— 地址可分享，前进后退照常。
 */
export function PromptLibraryTabs({ currentTab }: PromptLibraryTabsProps) {
  const t = useTranslations('PromptLibrary')
  const router = useRouter()
  const [pending, setPending] = useState<PromptLibraryTab | null>(null)
  // 地址已经换过来了（或前进后退换走了）就不再记着刚点的那一格。
  if (pending !== null && pending === currentTab) setPending(null)

  return (
    <LiquidSegmented
      ariaLabel={t('title')}
      semantics="tabs"
      value={pending ?? currentTab}
      items={[
        { value: 'mine', label: t('tabMine') },
        { value: 'inspiration', label: t('tabInspiration') },
      ]}
      onChange={(tab) => {
        setPending(tab)
        router.push(
          tab === 'mine' ? ROUTES.PROMPTS : `${ROUTES.PROMPTS}?tab=inspiration`,
        )
      }}
    />
  )
}

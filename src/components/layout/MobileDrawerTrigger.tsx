'use client'

import { useTranslations } from 'next-intl'

import { PanelLeft } from '@/components/icons'
import { openMobileDrawer } from '@/hooks/use-mobile-drawer'
import { cn } from '@/lib/utils'

/**
 * 手机各根页面（对话 · 素材 · 画廊 · 角色 · 我的）左上角统一的侧栏呼出键。
 */
export function MobileDrawerTrigger({ className }: { className?: string }) {
  const tMobile = useTranslations('MobileNav')
  return (
    <button
      type="button"
      onClick={openMobileDrawer}
      aria-label={tMobile('drawer.label')}
      data-testid="studio-mobile-drawer-trigger"
      className={cn(
        'touch-target grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-5',
        className,
      )}
    >
      <PanelLeft />
    </button>
  )
}

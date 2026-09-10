import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

export type PromptLibraryTab = 'mine' | 'inspiration'

interface PromptLibraryTabsProps {
  currentTab: PromptLibraryTab
}

/**
 * Two-tab nav on the /prompts page: "My templates" vs shared prompts.
 * Server-rendered — selected tab driven by `?tab=` query param so the
 * URL is shareable and back/forward navigation works naturally.
 */
export function PromptLibraryTabs({ currentTab }: PromptLibraryTabsProps) {
  const t = useTranslations('PromptLibrary')

  const tabs: Array<{ key: PromptLibraryTab; label: string; href: string }> = [
    { key: 'mine', label: t('tabMine'), href: ROUTES.PROMPTS },
    {
      key: 'inspiration',
      label: t('tabInspiration'),
      href: `${ROUTES.PROMPTS}?tab=inspiration`,
    },
  ]

  return (
    <nav
      aria-label={t('title')}
      className="flex flex-wrap items-center gap-5 border-b border-border pb-0"
    >
      {tabs.map((tab) => {
        const active = tab.key === currentTab
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium transition-colors duration-fast',
              active
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

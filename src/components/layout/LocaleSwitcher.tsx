'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'motion/react'

import { cn } from '@/lib/utils'
import { Link, usePathname } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'

interface LocaleSwitcherProps {
  className?: string
  orientation?: 'horizontal' | 'vertical'
  size?: 'default' | 'compact'
  tone?: 'default' | 'sidebar'
}

export function LocaleSwitcher({
  className,
  orientation = 'horizontal',
  size = 'default',
  tone = 'default',
}: LocaleSwitcherProps) {
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('LocaleSwitcher')
  const isVertical = orientation === 'vertical'
  const isCompact = size === 'compact'
  const isSidebar = tone === 'sidebar'

  const queryString = searchParams.toString()
  const href = queryString ? `${pathname}?${queryString}` : pathname

  return (
    <nav
      aria-label={t('label')}
      data-orientation={orientation}
      data-tone={tone}
      className={cn(
        'relative flex gap-0.5',
        isSidebar
          ? 'bg-sidebar-accent/20'
          : 'border border-border/80 bg-background/84',
        isVertical
          ? cn('flex-col p-0.5', isSidebar ? 'rounded-lg' : 'rounded-xl')
          : cn(
              'items-center rounded-full',
              isCompact ? 'px-0.5 py-0.5' : 'px-1 py-0.5',
            ),
        className,
      )}
    >
      {LOCALES.map((option) => {
        const isActive = locale === option

        return (
          <Link
            key={option}
            href={href}
            locale={option}
            aria-current={isActive ? 'page' : undefined}
            aria-label={t(`names.${option}`)}
            title={t(`names.${option}`)}
            className={cn(
              'locale-switcher-option relative z-10 inline-flex items-center justify-center rounded-full text-nav font-semibold uppercase tracking-nav transition-colors duration-200',
              isVertical
                ? 'size-6 p-0 text-2xs tracking-normal'
                : cn(
                    isCompact
                      ? cn(
                          'h-7 px-2 py-0 text-2xs tracking-nav-dense',
                          isSidebar ? 'min-w-0 flex-1' : 'min-w-9',
                        )
                      : 'px-2.5 py-2.5',
                  ),
              isActive
                ? isSidebar
                  ? 'text-sidebar-foreground'
                  : 'text-background'
                : isSidebar
                  ? 'text-sidebar-foreground/45 hover:text-sidebar-foreground/75'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`locale-indicator-${orientation}-${tone}`}
                className={cn(
                  'locale-switcher-indicator absolute inset-0 rounded-full',
                  isSidebar
                    ? 'bg-sidebar-foreground/10 ring-1 ring-sidebar-border/60'
                    : 'bg-foreground',
                )}
                transition={{
                  type: 'tween',
                  ease: 'easeOut',
                  duration: 0.3,
                }}
              />
            )}
            <span className="relative z-10">{t(`options.${option}`)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

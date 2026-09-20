'use client'

import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'motion/react'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'
import { useLocaleSwitch } from '@/hooks/use-locale-switch'

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
  // 当前值 / 落点 / 名册都来自那一条共用的路 —— 侧栏账号菜单里的语言行
  // 调的是同一支（`use-locale-switch.ts`）。
  const { locale, href, locales } = useLocaleSwitch()
  const t = useTranslations('LocaleSwitcher')
  const reducedMotion = useReducedMotion()
  const isVertical = orientation === 'vertical'
  const isCompact = size === 'compact'
  const isSidebar = tone === 'sidebar'

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
      {locales.map((option) => {
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
              'locale-switcher-option relative z-10 inline-flex items-center justify-center rounded-full text-2xs font-semibold uppercase tracking-nav transition-colors duration-200',
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
                  ease: EASE_STANDARD,
                  duration: reducedMotion ? 0 : DURATION.base,
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

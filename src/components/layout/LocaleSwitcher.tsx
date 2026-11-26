'use client'

import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'motion/react'

import { DURATION, EASE_STANDARD } from '@/constants/motion'
import { cn } from '@/lib/utils'
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
  // ⚠ 用原生 `<a>`（整页导航），⛔ 换回 next-intl `<Link locale>`：软导航会被
  //   `(.)library/*` 拦截路由接走，地址换了界面没换（hook 里有完整说明）。
  const { locale, hrefFor, locales } = useLocaleSwitch()
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
        isSidebar ? 'bg-sidebar-accent/20' : 'bg-fill-strong',
        isVertical
          ? cn('flex-col p-0.5', isSidebar ? 'rounded-lg' : 'rounded-xl')
          : 'items-center rounded-full p-0.5',
        className,
      )}
    >
      {locales.map((option) => {
        const isActive = locale === option

        return (
          <a
            key={option}
            href={hrefFor(option)}
            hrefLang={option}
            aria-current={isActive ? 'page' : undefined}
            aria-label={t(`names.${option}`)}
            title={t(`names.${option}`)}
            className={cn(
              'locale-switcher-option touch-target-y relative z-10 inline-flex items-center justify-center rounded-full text-2xs font-semibold uppercase tracking-nav transition-colors duration-200',
              isVertical
                ? 'size-6 p-0 text-2xs tracking-normal'
                : cn(
                    isCompact
                      ? cn(
                          'h-7 px-2 py-0 text-2xs tracking-nav-dense',
                          isSidebar
                            ? 'min-w-0 flex-1'
                            : 'min-w-9 coarse:min-w-11',
                        )
                      : 'px-2.5 py-2.5',
                  ),
              isActive
                ? isSidebar
                  ? 'text-sidebar-foreground'
                  : 'text-foreground'
                : isSidebar
                  ? 'text-sidebar-foreground/45 hover:text-sidebar-foreground/75'
                  : 'text-ink-2 hover:text-foreground',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`locale-indicator-${orientation}-${tone}`}
                className={cn(
                  'locale-switcher-indicator absolute inset-0 rounded-full',
                  isSidebar
                    ? 'bg-sidebar-foreground/10 ring-1 ring-sidebar-border/60'
                    : 'bg-raise shadow-seg',
                )}
                transition={{
                  type: 'tween',
                  ease: EASE_STANDARD,
                  duration: reducedMotion ? 0 : DURATION.base,
                }}
              />
            )}
            <span className="relative z-10">{t(`options.${option}`)}</span>
          </a>
        )
      })}
    </nav>
  )
}

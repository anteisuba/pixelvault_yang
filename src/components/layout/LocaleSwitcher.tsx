'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { motion } from 'motion/react'

import { cn } from '@/lib/utils'
import { Link, usePathname } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'

interface LocaleSwitcherProps {
  className?: string
}

export function LocaleSwitcher({ className }: LocaleSwitcherProps) {
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('LocaleSwitcher')

  const queryString = searchParams.toString()
  const href = queryString ? `${pathname}?${queryString}` : pathname

  return (
    <nav
      aria-label={t('label')}
      className={cn(
        'relative flex items-center gap-0.5 rounded-full border border-border/80 bg-background/84 px-1 py-0.5',
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
              'relative z-10 rounded-full px-2.5 py-1 text-nav font-semibold uppercase tracking-nav transition-colors duration-200',
              isActive
                ? 'text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {isActive && (
              <motion.span
                layoutId="locale-indicator"
                className="absolute inset-0 rounded-full bg-foreground"
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

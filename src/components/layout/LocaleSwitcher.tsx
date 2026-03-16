'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'

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
        'flex items-center gap-1 rounded-full border border-border/80 bg-background/84 px-1.5 py-1',
        className,
      )}
    >
      <span className="hidden px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:inline">
        {t('label')}
      </span>

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
              'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors',
              isActive
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {t(`options.${option}`)}
          </Link>
        )
      })}
    </nav>
  )
}

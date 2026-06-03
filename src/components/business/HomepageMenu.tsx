'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, Globe } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { Link, usePathname } from '@/i18n/navigation'
import { LOCALES, type AppLocale } from '@/i18n/routing'

/** Native language names — fixed per language, not localized. */
const NATIVE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  ja: '日本語',
  zh: '中文',
}

/**
 * Homepage header language switcher.
 *
 * A compact globe trigger that opens a list of native language names
 * with the active one checked.
 */
export function HomepageMenu() {
  const [open, setOpen] = useState(false)
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('LocaleSwitcher')
  const ref = useRef<HTMLDivElement>(null)

  const queryString = searchParams.toString()
  const href = queryString ? `${pathname}?${queryString}` : pathname

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="homepage-menu relative">
      <button
        type="button"
        aria-label={t('label')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="homepage-header-action homepage-menu-trigger flex items-center justify-center gap-1.5 text-sm font-semibold"
      >
        <Globe className="size-4" aria-hidden="true" />
        <span>{t(`options.${locale}`)}</span>
      </button>

      {open ? (
        <div className="homepage-menu-panel absolute right-0 top-full z-30 mt-2 min-w-44 rounded-2xl p-1.5 shadow-lg">
          {LOCALES.map((option) => {
            const isActive = option === locale

            return (
              <Link
                key={option}
                href={href}
                locale={option}
                onClick={() => setOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive ? 'true' : undefined}
                className="homepage-lang-option flex items-center justify-between gap-8 rounded-xl px-3 py-2 text-sm"
              >
                <span>{NATIVE_NAMES[option]}</span>
                {isActive ? (
                  <Check className="size-4" aria-hidden="true" />
                ) : null}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

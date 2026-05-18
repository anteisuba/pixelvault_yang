import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'

const SECTIONS = [
  {
    id: 'product',
    items: [
      { id: 'studio', href: ROUTES.STUDIO, external: false },
      { id: 'gallery', href: ROUTES.GALLERY, external: false },
      { id: 'arena', href: ROUTES.ARENA, external: false },
      { id: 'models', href: '#models', external: false },
    ],
  },
  {
    id: 'resources',
    items: [
      {
        id: 'github',
        href: 'https://github.com/anteisuba/pixelvault_yang',
        external: true,
      },
      { id: 'docs', href: '/docs', external: false },
    ],
  },
  {
    id: 'legal',
    items: [
      { id: 'privacy', href: '/privacy', external: false },
      { id: 'terms', href: '/terms', external: false },
    ],
  },
] as const

export function HomepageFooter() {
  const t = useTranslations('Homepage.footer')
  const year = new Date().getFullYear()

  return (
    <footer className="homepage-footer mt-12 px-1 pt-12">
      <div className="grid gap-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="homepage-brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="font-display text-base font-semibold text-foreground">
              PixelVault
            </span>
          </div>
          <p className="max-w-xs text-sm text-[var(--home-muted)]">
            {t('tagline')}
          </p>
        </div>

        {SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--home-muted)]">
              {t(`sections.${section.id}`)}
            </p>
            <ul className="space-y-2 text-sm">
              {section.items.map((item) =>
                item.external ? (
                  <li key={item.id}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="homepage-footer-link"
                    >
                      {t(`links.${item.id}`)}
                    </a>
                  </li>
                ) : item.href.startsWith('#') ? (
                  <li key={item.id}>
                    <a href={item.href} className="homepage-footer-link">
                      {t(`links.${item.id}`)}
                    </a>
                  </li>
                ) : (
                  <li key={item.id}>
                    <Link href={item.href} className="homepage-footer-link">
                      {t(`links.${item.id}`)}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </div>

      <p className="homepage-footer-copy mt-10 pt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--home-muted)]">
        {t('copyright', { year })}
      </p>
    </footer>
  )
}

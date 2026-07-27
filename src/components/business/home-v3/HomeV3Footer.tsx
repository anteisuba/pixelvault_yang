import { useTranslations } from 'next-intl'

import { HOME_V3_FOOTER_COLS } from '@/constants/homepage'
import { Link } from '@/i18n/navigation'

const CURRENT_YEAR = 2026

/**
 * Black ground the light page rounds into, rather than one more stacked band
 * (docs/references/pages/home.md §A1). Column labels and items come from
 * `Homepage.foot.cols.*`; the hrefs live in the constant so the copy file never
 * carries routes.
 */
export function HomeV3Footer() {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <footer className="home-v3-footer">
      <div className="home-v3-footer-top">
        <div className="home-v3-footer-brand">
          <b>{tCommon('brand')}</b>
          <p>{t('foot.tagline')}</p>
        </div>

        {HOME_V3_FOOTER_COLS.map((col) => (
          <div className="home-v3-footer-col" key={col.id}>
            <p>{t(`foot.cols.${col.id}.title`)}</p>
            {col.hrefs.map((href, index) => (
              <Link key={`${col.id}-${index}`} href={href}>
                {t(`foot.cols.${col.id}.items.i${index + 1}`)}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="home-v3-footer-bottom">
        <span>
          © {tCommon('brand')} {CURRENT_YEAR}
        </span>
        <div>
          <Link href="/privacy">{t('foot.privacy')}</Link>
          <Link href="/terms">{t('foot.terms')}</Link>
        </div>
      </div>
    </footer>
  )
}

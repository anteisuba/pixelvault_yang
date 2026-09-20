import { useTranslations } from 'next-intl'

import { HOME_V4_FINALE, HOME_V4_ROUTES } from '@/constants/homepage-v4'
import { Link } from '@/i18n/navigation'

interface HomeV4FinaleProps {
  /**
   * 这一段的滚动进度 0–1。收尾段不 scrub，所以这里不读它；留在签名上是为了段
   * 的渲染口径统一 —— deck 对九段是同一句 `progress={at}`。
   */
  progress?: number
}

/**
 * 收尾页 — the deck's last screen, fully built (not a placeholder).
 *
 * 长卷的最后一屏：收尾行、CTA、巨型字标、单行页脚。
 *
 * ⚠ 三拍入场时间线已删。长卷里没有「翻到这一页」这个事件可以挂——读者是滚到这里
 * 的，滚到的时候它就该已经在那儿了。
 *
 * ⚠ `.fin-mark` carries the `l1` parallax class, and the parallax rules write
 * `transform`. So it must **not** be centred with `left:50% / translateX(-50%)`
 * — the layer transform would overwrite the centring and throw it sideways on
 * the first page turn. `home-v4.css` centres it with `left:0; right:0;
 * text-align:center` instead. The same trap applies to anything else that ends
 * up carrying a layer class.
 */
export function HomeV4Finale({}: HomeV4FinaleProps) {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  return (
    <div className="page-inner">
      <div className="fg">
        <div className="fin-hero l2 in">
          <h2>
            <span className="opl">
              <span>{t('v4.finale.title')}</span>
            </span>
          </h2>
          <p className="fin-sub">{t('foot.tagline')}</p>
          <Link className="cta" href={HOME_V4_ROUTES.canvas}>
            {t('v4.finale.cta')}
          </Link>
        </div>
      </div>

      {/* Both sit outside `.fg`, pinned to `.page-inner`; the wordmark is cropped
          by `.vp`'s own overflow so it reads as a printed cap. */}
      <div className="fin-mark l1 in" aria-hidden="true">
        {tCommon('brand')}
      </div>

      <div className="fin-foot l3 in">
        <span>
          © {HOME_V4_FINALE.COPYRIGHT_YEAR} {tCommon('brand')}
        </span>
        <span>
          <Link href={HOME_V4_ROUTES.terms}>{t('foot.terms')}</Link>
          {' · '}
          <Link href={HOME_V4_ROUTES.privacy}>{t('foot.privacy')}</Link>
          {' · '}
          {/* No route for the guidelines yet — plain text until one exists. */}
          {t('v4.finale.guidelines')}
        </span>
      </div>
    </div>
  )
}

'use client'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_STATION_KEYS,
  HOME_V4_STATION_ROUTES,
  HOME_V4_STATIONS,
  type HomeV4StationKey,
} from '@/constants/homepage-v4'
import { Link } from '@/i18n/navigation'

import { HomeV4ModelLogo } from './HomeV4ModelLogo'

interface HomeV4ModelRailProps {
  /** Open one model's 强弱 sheet. Owned by the deck, same as before. */
  onOpenDetail: (station: HomeV4StationKey, index: number) => void
}

/**
 * 模型阵容 —— 一段横滑卡片列表，每个模态一行。
 *
 * ⚠ 这一段**替换掉了 v4 的五个整屏模型站**（owner 批注 40 / UX 板「模型站」那
 * 一条）。理由写在板上：五个整屏轮播要读者纵向翻二十五次才看得完，而阵容是拿来
 * **扫**的，不是拿来一张张读的。它也**不参与 scrub**：横轴已经吃掉了滚动，再挂
 * 一个纵向进度上去，两根轴会互相抢。
 *
 * 名册走真站表（`HOME_V4_STATIONS`），⛔ 不在这里手抄任何一个模型名。
 *
 * 封面点下去进对应模态的工作台；卡下面那颗按钮才是详情。⚠ 两件事必须是两个可点
 * 元素，不能把按钮嵌进链接里 —— 嵌套的可点元素在读屏与键盘上都是坏的。
 *
 * 每一行自己横向滚动（`overflow-x: auto` + `scroll-snap-type: x`），所以触控板
 * 的横向手势、手机的横滑、键盘的 Tab 走的都是浏览器原生那一套，没有手写手势。
 */
export function HomeV4ModelRail({ onOpenDetail }: HomeV4ModelRailProps) {
  const t = useTranslations('Homepage')

  return (
    <div className="page-inner mrail">
      <div className="fg">
        <div className="fn-head l2">
          <p className="eyebrow">{t('v4.pages.models.eyebrow')}</p>
          <h2>{t('v4.pages.models.title')}</h2>
        </div>

        <div className="mrail-rows">
          {HOME_V4_STATION_KEYS.map((station) => {
            const models = HOME_V4_STATIONS[station]
            const rowLabel = t(`v4.models.rows.${station}`)

            return (
              <section className="mrow2" key={station} aria-label={rowLabel}>
                <h3>
                  {rowLabel}
                  <span className="n">
                    {t('v4.models.rail.count', { count: models.length })}
                  </span>
                </h3>

                <div className="mcards">
                  {models.map((model, index) => (
                    <figure className="mcard" key={model.key}>
                      <Link
                        className="cover"
                        href={HOME_V4_STATION_ROUTES[station]}
                        aria-label={t('v4.models.rail.open', {
                          model: model.name,
                        })}
                      >
                        {model.cover === null ? (
                          <span className="plain" aria-hidden="true" />
                        ) : (
                          /* ⚠ Plain `<img>` with `loading="lazy"`: a row holds
                             up to seven covers and only two are on screen, so
                             the browser's own viewport heuristic is exactly the
                             right gate here — unlike the v4 deck, which moved
                             pages with transforms and had to gate by hand. */
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={model.cover}
                            alt={t('v4.modelPage.coverAlt', {
                              model: model.name,
                            })}
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                      </Link>

                      <figcaption>
                        <span className="toprow">
                          <HomeV4ModelLogo
                            logo={model.logo}
                            mark={model.mark}
                          />
                          <span className="prov">{model.provider}</span>
                        </span>
                        <b>{model.name}</b>
                        <span className="pos">
                          {t(`v4.models.${model.key}.pos`)}
                        </span>
                        <button
                          type="button"
                          className="more"
                          onClick={() => onOpenDetail(station, index)}
                        >
                          {t('v4.modelPage.more')}
                        </button>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

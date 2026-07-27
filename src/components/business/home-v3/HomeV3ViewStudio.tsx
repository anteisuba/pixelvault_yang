import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOME_V3_STUDIO_SHEET, HOME_V3_STUDIO_TAGS } from '@/constants/home-v3'

/** One prompt across four models — the product's core claim, shown rather than described. */
export function HomeV3ViewStudio() {
  const t = useTranslations('Homepage.studioView')

  return (
    <div className="home-v3-deck">
      <div className="home-v3-compose">
        <div className="home-v3-promptbox">
          <b>PROMPT</b>
          {t('prompt')}
        </div>

        <div className="home-v3-tagrow">
          {HOME_V3_STUDIO_TAGS.map((tag) => (
            <span className="home-v3-tag" key={tag.name} data-on={tag.on}>
              {tag.name}
            </span>
          ))}
        </div>

        <div className="home-v3-control">
          <span>{t('size')}</span>
          <span>{t('perModel')}</span>
        </div>
        <div className="home-v3-control">
          <span>{t('ownKey')}</span>
          <span>{t('estimate')}</span>
        </div>

        <button type="button" className="home-v3-generate">
          {t('generateAll')}
        </button>
      </div>

      <div className="home-v3-sheet">
        {HOME_V3_STUDIO_SHEET.map((cell) => {
          const running = 'progress' in cell
          return (
            <div
              className="home-v3-cell"
              key={cell.model}
              data-running={running || undefined}
            >
              <Image src={cell.shot} alt="" width={420} height={420} />
              <span className="home-v3-cell-label">{cell.model}</span>

              {'picked' in cell && cell.picked ? (
                <span className="home-v3-cell-flag">{t('picked')}</span>
              ) : null}

              {'elapsed' in cell && cell.elapsed ? (
                <span className="home-v3-cell-flag" data-muted="true">
                  {cell.elapsed}
                </span>
              ) : null}

              {running ? (
                <span className="home-v3-cell-progress">
                  <i style={{ width: `${cell.progress}%` }} />
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

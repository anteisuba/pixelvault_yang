import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { HOME_V3_ASSETS, HOME_V3_SHOTS } from '@/constants/home-v3'

const GRID_POOL = Object.values(HOME_V3_SHOTS)
const SELECTED_SHOT = GRID_POOL[HOME_V3_ASSETS.selectedIndex]

/** The archive: folder tree, dense grid, and the metadata that travels with every result. */
export function HomeV3ViewAssets() {
  const t = useTranslations('Homepage.assetsView')

  return (
    <>
      <div className="home-v3-tree">
        <p>{t('treeTitle')}</p>
        {HOME_V3_ASSETS.folders.map((folder) => (
          <a
            href="#"
            key={folder.id}
            data-active={'active' in folder ? folder.active : undefined}
          >
            {t(
              `folder${folder.id.charAt(0).toUpperCase()}${folder.id.slice(1)}`,
            )}
            <span>{folder.count}</span>
          </a>
        ))}
      </div>

      <div className="home-v3-grid">
        {Array.from({ length: HOME_V3_ASSETS.gridSize }, (_, index) => (
          <figure
            key={index}
            data-selected={
              index === HOME_V3_ASSETS.selectedIndex ? true : undefined
            }
          >
            <Image
              src={GRID_POOL[index % GRID_POOL.length]}
              alt=""
              width={220}
              height={220}
            />
          </figure>
        ))}
      </div>

      <div className="home-v3-meta">
        <Image src={SELECTED_SHOT} alt="" width={260} height={260} />
        <div className="home-v3-row">
          <span>{t('rowModel')}</span>
          <b>{HOME_V3_ASSETS.meta.model}</b>
        </div>
        <div className="home-v3-row">
          <span>{t('rowProvider')}</span>
          <b>{HOME_V3_ASSETS.meta.provider}</b>
        </div>
        <div className="home-v3-row">
          <span>{t('rowSeed')}</span>
          <b>{HOME_V3_ASSETS.meta.seed}</b>
        </div>
        <div className="home-v3-row">
          <span>{t('rowTime')}</span>
          <b>{HOME_V3_ASSETS.meta.time}</b>
        </div>
        <p className="home-v3-sublabel">PROMPT</p>
        <p className="home-v3-prompt">{t('prompt')}</p>
      </div>
    </>
  )
}

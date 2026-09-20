'use client'

import Image from 'next/image'
import type { CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_FN_VAULT,
  HOME_V4_FN_VAULT_CELLS,
  HOME_V4_FN_VAULT_FILTERS,
  HOME_V4_FN_VAULT_WAVE,
  HOME_V4_GLYPHS,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'
import { homeV4VaultBeats } from '@/lib/home-v4-beats'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnVaultProps {
  /** 段内滚动进度 0–1。0 = 空库，1 = 复用位填满 + CTA。 */
  progress: number
  eyebrow: string
  title: string
}

const ARRIVALS = HOME_V4_FN_VAULT_CELLS.filter((cell) => cell.arrival)
const REST = HOME_V4_FN_VAULT_CELLS.filter((cell) => !cell.arrival)

/**
 * 功能页 06 · 资源库 — everything you kept can go back on stage.
 *
 * Archiving is the hook; *reuse* is the subject. So the performance runs in
 * that order: the three things the sections above just made drop in from off the
 * top, the rest of the library floods in behind them, then the character anchor
 * lights up and the reuse slot fills with a **copy** of it — the original stays
 * in the grid, because taking it out of the library would say the exact
 * opposite of what the段 is claiming.
 *
 * ⚠ **飞递 ghost 已删**（v5 长卷）。原来那张 FLIP 幽灵是一次性事件：它读
 * `getBoundingClientRect()`、往 DOM 里塞一个元素、再用定时器收尾——在 scrub 下
 * 它会在读者每次来回滚动时重放一遍，而且每次都要读一次布局。现在「被拿去复用」
 * 是复用位自己的 `clip-path` 揭开（`beats.slot` 是 0–1 的连续量），往回滚就真
 * 的收回去，全程只动 `clip-path` 与 `opacity`，一次布局读取都没有。
 *
 * Mobile drops to a 3×3 grid (the prompt card is the one that goes) and lays
 * the reuse column out along the bottom.
 */
export function HomeV4FnVault({
  progress,
  eyebrow,
  title,
}: HomeV4FnVaultProps) {
  const t = useTranslations('Homepage')
  const beats = homeV4VaultBeats(progress)

  return (
    <HomeV4FnFrame id="vault" eyebrow={eyebrow} title={title} ctaOn={beats.cta}>
      <div className="fn-vault">
        <div className="bar">
          <span className="t">{t('v4.fn.vault.title')}</span>
          <span className="p">{t('v4.fn.vault.meta')}</span>
        </div>

        <div className="vbody">
          <div className="vleft">
            <div className="chips2">
              {HOME_V4_FN_VAULT_FILTERS.map((filter, index) => (
                <span className={index === 0 ? 'on' : undefined} key={filter}>
                  {t(`v4.fn.vault.filters.${filter}`)}
                </span>
              ))}
            </div>

            <div className="vgrid">
              {HOME_V4_FN_VAULT_CELLS.map((cell) => {
                const shown = cell.arrival
                  ? ARRIVALS.indexOf(cell) < beats.arrivals
                  : REST.indexOf(cell) < beats.rest
                const classes = [
                  'vc',
                  cell.arrival ? 'far' : '',
                  cell.kind === 'prompt' ? 'tcard' : '',
                  cell.kind === 'count' ? 'ncard' : '',
                  shown ? 'in' : '',
                  cell.hero && beats.lift ? 'lift' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                return (
                  <div
                    className={classes}
                    key={cell.id}
                    data-hero={cell.hero ? '1' : undefined}
                    data-tile={cell.kind === 'swatch' ? cell.id : undefined}
                  >
                    {cell.kind === 'shot' ? (
                      <Image
                        src={cell.src}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 30vw, 150px"
                      />
                    ) : null}

                    {cell.kind === 'wave' ? (
                      <span className="wvc">
                        {HOME_V4_FN_VAULT_WAVE.map((height, bar) => (
                          <i
                            key={bar}
                            style={{ '--h': height } as CSSProperties}
                          />
                        ))}
                      </span>
                    ) : null}

                    {cell.kind === 'prompt' ? (
                      <span className="tp">{t('v4.fn.vault.promptText')}</span>
                    ) : null}

                    {cell.kind === 'count' ? (
                      <>
                        <b>
                          {t('v4.fn.vault.archived', {
                            count: HOME_V4_FN_VAULT.ARCHIVED_COUNT,
                          })}
                        </b>
                        <span className="nk">
                          {t('v4.fn.vault.cells.count')}
                        </span>
                      </>
                    ) : (
                      <span className="vk">
                        {cell.id === 'cut' ? `${HOME_V4_GLYPHS.play} ` : ''}
                        {t(`v4.fn.vault.cells.${cell.id}`)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="vright">
            <span className="rk2">{t('v4.fn.vault.reuseKicker')}</span>
            {/* `--slot` 走 clip-path：复用位是**被填满**的，不是被替换的。 */}
            <div
              className="slot"
              data-got={String(beats.slot >= 1)}
              style={{ '--slot': beats.slot } as CSSProperties}
            >
              <span className="ph">{t('v4.fn.vault.slotEmpty')}</span>
              <Image
                src={HOME_V4_STORY.anchor}
                alt=""
                fill
                sizes="(max-width: 768px) 116px, 212px"
              />
              <span className="gk">{t('v4.fn.vault.slotFilled')}</span>
            </div>
            <p className="vnote">{t('v4.fn.vault.note')}</p>
            <span className={`cta2${beats.cta ? ' on' : ''}`}>
              {t('v4.fn.vault.cta')} {HOME_V4_GLYPHS.arrow}
            </span>
          </div>
        </div>
      </div>
    </HomeV4FnFrame>
  )
}

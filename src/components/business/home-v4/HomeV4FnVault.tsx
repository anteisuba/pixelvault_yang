'use client'

import Image from 'next/image'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_VAULT,
  HOME_V4_FN_VAULT_CELLS,
  HOME_V4_FN_VAULT_FILTERS,
  HOME_V4_FN_VAULT_WAVE,
  HOME_V4_GLYPHS,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnVaultProps {
  /** True while this is the page on screen. Drives play / reset. */
  active: boolean
  eyebrow: string
  title: string
}

interface VaultBeats {
  /** Tiles dropped in from the pages above. */
  arrivals: number
  /** Tiles that flooded in behind them. */
  rest: number
  /** The character anchor, singled out. */
  lift: boolean
  /** The reuse slot, filled. */
  slot: boolean
  /** The call to action, lit. */
  cta: boolean
}

const AT_REST: VaultBeats = {
  arrivals: 0,
  rest: 0,
  lift: false,
  slot: false,
  cta: false,
}

const ARRIVALS = HOME_V4_FN_VAULT_CELLS.filter((cell) => cell.arrival)
const REST = HOME_V4_FN_VAULT_CELLS.filter((cell) => !cell.arrival)

/**
 * 功能页 06 · 资源库 — everything you kept can go back on stage.
 *
 * Archiving is the hook; *reuse* is the subject. So the performance runs in
 * that order: the three things the pages above just made drop in from off the
 * top, the rest of the library floods in behind them, then the character anchor
 * lights up and a **copy** of it flies out into the reuse slot — the original
 * stays in the grid, because taking it out of the library would say the exact
 * opposite of what the page is claiming.
 *
 * The flight is a FLIP on a raw ghost element, same mechanism as page 05.
 *
 * Mobile drops to a 3×3 grid (the prompt card is the one that goes) and lays
 * the reuse column out along the bottom.
 */
export function HomeV4FnVault({ active, eyebrow, title }: HomeV4FnVaultProps) {
  const t = useTranslations('Homepage')

  const [beats, setBeats] = useState<VaultBeats>(AT_REST)

  const flyersRef = useRef<HTMLDivElement | null>(null)
  const heroRef = useRef<HTMLDivElement | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  /** Send a copy of the anchor tile into the reuse slot. */
  const flyToSlot = useCallback(() => {
    const host = flyersRef.current
    const from = heroRef.current
    const to = slotRef.current
    if (!host || !from || !to) return

    const hostRect = host.getBoundingClientRect()
    const fromRect = from.getBoundingClientRect()
    const toRect = to.getBoundingClientRect()

    const ghost = document.createElement('div')
    ghost.className = 'flyer'
    const shot = document.createElement('img')
    shot.className = 'fly-shot'
    shot.src = HOME_V4_STORY.anchor
    shot.alt = ''
    shot.style.width = `${Math.round(fromRect.width)}px`
    shot.style.height = `${Math.round(fromRect.height)}px`
    ghost.appendChild(shot)
    ghost.style.left = `${fromRect.left - hostRect.left}px`
    ghost.style.top = `${fromRect.top - hostRect.top}px`
    host.appendChild(ghost)
    /* Commit the start frame before moving it — see the same read in
       `HomeV4FnCanvas`. */
    ghost.getBoundingClientRect()

    const dx =
      toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)
    const dy =
      toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${HOME_V4_FN_VAULT.FLY_SCALE})`
    ghost.style.opacity = '0'

    timersRef.current.push(
      window.setTimeout(() => ghost.remove(), HOME_V4_FN_VAULT.FLY_LIFE_MS),
    )
  }, [])

  useEffect(() => {
    if (!active) {
      clearTimers()
      /* Rewind only once the page has slid away — see `HomeV4Opening`. */
      timersRef.current.push(
        window.setTimeout(() => {
          setBeats(AT_REST)
          const host = flyersRef.current
          while (host?.firstChild) host.firstChild.remove()
        }, HOME_V4_ENGINE.PAGE_MS),
      )
      return clearTimers
    }

    const at = (fn: () => void, ms: number) => {
      timersRef.current.push(
        window.setTimeout(fn, HOME_V4_FN_VAULT.ENTER_DELAY_MS + ms),
      )
    }
    const set = (patch: Partial<VaultBeats>) => {
      setBeats((current) => ({ ...current, ...patch }))
    }

    ARRIVALS.forEach((_, index) => {
      at(
        () => set({ arrivals: index + 1 }),
        HOME_V4_FN_VAULT.ARRIVAL_START_MS +
          index * HOME_V4_FN_VAULT.ARRIVAL_STEP_MS,
      )
    })
    REST.forEach((_, index) => {
      at(
        () => set({ rest: index + 1 }),
        HOME_V4_FN_VAULT.REST_START_MS + index * HOME_V4_FN_VAULT.REST_STEP_MS,
      )
    })
    at(() => set({ lift: true }), HOME_V4_FN_VAULT.LIFT_MS)
    at(flyToSlot, HOME_V4_FN_VAULT.FLY_MS)
    at(() => set({ slot: true }), HOME_V4_FN_VAULT.SLOT_MS)
    at(() => set({ cta: true }), HOME_V4_FN_VAULT.CTA_MS)

    return clearTimers
  }, [active, clearTimers, flyToSlot])

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title}>
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
                    ref={cell.hero ? heroRef : undefined}
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
            <div className={`slot${beats.slot ? ' got' : ''}`} ref={slotRef}>
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

        {/* Ghosts land here — a layer React never puts children into, so the
            two never fight over the same DOM. Same host as page 05. */}
        <div className="fn-flyers" ref={flyersRef} aria-hidden="true" />
      </div>
    </HomeV4FnFrame>
  )
}

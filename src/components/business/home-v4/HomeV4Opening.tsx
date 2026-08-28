'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useTranslations } from 'next-intl'

import { HOMEPAGE_MODEL_COUNTS, HOMEPAGE_PROVIDERS } from '@/constants/homepage'
import {
  HOME_V4_ENGINE,
  HOME_V4_OPENING,
  HOME_V4_STRIP,
  HOME_V4_STRIP_SPARES,
} from '@/constants/homepage-v4'

/** One strip cell. `b` sits on top of `a` and only exists during/after a swap. */
interface StripSlot {
  a: string
  b: string | null
  swapping: boolean
}

interface HomeV4OpeningProps {
  /** True while this is the page on screen. Drives play / reset, same as the SPEC. */
  active: boolean
}

/**
 * 开场页 — the first screen, fully built (not a placeholder).
 *
 * Two performances live here and they are deliberately different in kind:
 *
 * 1. **Intro**, once per entry — the headline rises out of its mask, the ten
 *    cells fade up one beat apart, then the note, the provider marquee and the
 *    scroll cue arrive together. Leaving the page resets it, so coming back
 *    plays it again. That is the SPEC's `op0Play` / `op0Reset` pair.
 * 2. **Resident rotation** — every `ROTATE_INTERVAL_MS` one random cell
 *    cross-fades to a spare and hands its own shot back to the pool, so the wall
 *    keeps breathing while the visitor reads. The SPEC fed that pool by copying
 *    base64 blobs out of two later pages at runtime; here the spares are plain
 *    paths and that hack is gone.
 *
 * The cells keep whatever they rotated to across a page exit — resetting the
 * images as well as the classes would make every return to the top look like a
 * reload.
 *
 * Behind all of it, a page-tall ANTEI watermark on the slow parallax layer. It
 * has no timeline of its own: it is there from the first paint and only moves
 * when the deck moves.
 */
export function HomeV4Opening({ active }: HomeV4OpeningProps) {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  const [heroIn, setHeroIn] = useState(false)
  const [revealed, setRevealed] = useState(0)
  const [tailIn, setTailIn] = useState(false)
  const [slots, setSlots] = useState<StripSlot[]>(() =>
    HOME_V4_STRIP.map((shot) => ({ a: shot.src, b: null, swapping: false })),
  )

  /* Refs, not state: the rotation tick reads them from inside a timer, where a
     captured render's values would be stale. */
  const slotsRef = useRef(slots)
  const revealedRef = useRef(0)
  const sparesRef = useRef<string[]>([...HOME_V4_STRIP_SPARES])
  const swapTimersRef = useRef<number[]>([])
  /* The very first paint gets a longer beat than a return visit. */
  const firstRunRef = useRef(true)

  const reveal = useCallback((count: number) => {
    revealedRef.current = count
    setRevealed(count)
  }, [])

  const commit = useCallback((next: StripSlot[]) => {
    slotsRef.current = next
    setSlots(next)
  }, [])

  const rotate = useCallback(() => {
    const current = slotsRef.current
    const candidates = current
      .map((_, index) => index)
      .filter(
        (index) => index < revealedRef.current && !current[index].swapping,
      )
    if (candidates.length === 0) return

    const next = sparesRef.current.shift()
    if (!next) return

    const index = candidates[Math.floor(Math.random() * candidates.length)]
    commit(
      current.map((slot, i) =>
        i === index ? { ...slot, b: next, swapping: true } : slot,
      ),
    )

    /* `b` is fully faded in by now: hand `a` the same src, drop the swap class,
       and put the shot that just left back in the pool. */
    swapTimersRef.current.push(
      window.setTimeout(() => {
        const settled = slotsRef.current
        sparesRef.current.push(settled[index].a)
        commit(
          settled.map((slot, i) =>
            i === index ? { a: next, b: next, swapping: false } : slot,
          ),
        )
      }, HOME_V4_OPENING.SWAP_MS),
    )
  }, [commit])

  useEffect(() => {
    if (!active) {
      swapTimersRef.current.forEach((id) => window.clearTimeout(id))
      swapTimersRef.current = []
      /* Rewind only once the page has finished sliding away. Resetting on the
         spot would play the intro backwards in full view — the headline sinking
         back into its mask, the cells dropping — for the whole 850ms exit. */
      const rewind = window.setTimeout(() => {
        setHeroIn(false)
        setTailIn(false)
        reveal(0)
        commit(slotsRef.current.map((slot) => ({ ...slot, swapping: false })))
      }, HOME_V4_ENGINE.PAGE_MS)
      return () => window.clearTimeout(rewind)
    }

    const base = firstRunRef.current
      ? HOME_V4_OPENING.FIRST_PAINT_DELAY_MS
      : HOME_V4_OPENING.ENTER_DELAY_MS
    firstRunRef.current = false

    const timers: number[] = []
    const at = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms))
    }

    at(() => setHeroIn(true), base + HOME_V4_OPENING.HERO_MS)
    HOME_V4_STRIP.forEach((_, index) => {
      at(
        () => reveal(index + 1),
        base +
          HOME_V4_OPENING.STRIP_START_MS +
          index * HOME_V4_OPENING.STRIP_STAGGER_MS,
      )
    })
    at(() => setTailIn(true), base + HOME_V4_OPENING.TAIL_MS)

    let interval: number | undefined
    at(() => {
      interval = window.setInterval(rotate, HOME_V4_OPENING.ROTATE_INTERVAL_MS)
    }, base)

    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [active, commit, reveal, rotate])

  return (
    <div className="page-inner">
      {/* Watermark, so it goes before `.fg` and stays behind it. It rides the
          slowest parallax layer — the wall and the headline slide past it. */}
      <div className="op-brand l1" aria-hidden="true">
        {tCommon('brand')}
      </div>

      <div className="fg">
        <div className={`op-hero l2${heroIn ? ' in' : ''}`}>
          <p className="eyebrow op-stat">
            {t('heroStat', {
              models: HOMEPAGE_MODEL_COUNTS.total,
              providers: HOMEPAGE_MODEL_COUNTS.providers,
              modalities: HOMEPAGE_MODEL_COUNTS.modalities,
            })}
          </p>
          <h1>
            <span className="opl">
              <span>{t('heroLine1')}</span>
            </span>
            <span className="opl">
              <span>{t('heroLine2')}</span>
            </span>
          </h1>
        </div>

        <div className="op-strip l3">
          {HOME_V4_STRIP.map((shot, index) => {
            const slot = slots[index]
            const classes = [
              index < revealed ? 'in' : '',
              slot.swapping ? 'swap' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <figure key={shot.id} className={classes}>
                <Image
                  className="a"
                  src={slot.a}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 34vw, 120px"
                  priority={index < 4}
                />
                {slot.b ? (
                  <Image
                    className="b"
                    src={slot.b}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 34vw, 120px"
                  />
                ) : null}
              </figure>
            )
          })}
        </div>

        <p className={`op-note l3${tailIn ? ' in' : ''}`}>
          {t('v4.opening.note')}
        </p>
      </div>

      {/* Outside `.fg` on purpose: both are pinned to `.page-inner`. */}
      <div className={`op-mq l1${tailIn ? ' in' : ''}`}>
        <div className="op-track">
          {/* duplicated once so the -50% translate loops seamlessly */}
          {[false, true].map((isClone) => (
            <span
              className="half"
              key={isClone ? 'clone' : 'lead'}
              aria-hidden={isClone || undefined}
            >
              {HOMEPAGE_PROVIDERS.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className={`op-cue${tailIn ? ' in' : ''}`}>
        <i />
        <span className="cue-pc">{t('v4.opening.cuePc')}</span>
        <span className="cue-m">{t('v4.opening.cueMobile')}</span>
      </div>
    </div>
  )
}

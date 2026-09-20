'use client'

import Image from 'next/image'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { useTranslations } from 'next-intl'

import { HOMEPAGE_MODEL_COUNTS, HOMEPAGE_PROVIDERS } from '@/constants/homepage'
import {
  HOME_V4_BEATS,
  HOME_V4_OPENING,
  HOME_V4_SHOWCASE,
  HOME_V4_STRIP,
  HOME_V4_STRIP_SPARES,
  type HomeV4ShowcaseShot,
} from '@/constants/homepage-v4'
import { homeV4OpeningBeats } from '@/lib/home-v4-beats'

/** One strip cell. `b` sits on top of `a` and only exists during/after a swap. */
interface StripSlot {
  a: string
  b: string | null
  swapping: boolean
}

/** The bundled wall, used when the page passed nothing (tests, storybook). */
const STATIC_SHOTS: readonly HomeV4ShowcaseShot[] = [
  ...HOME_V4_STRIP,
  ...HOME_V4_STRIP_SPARES.map((src, index) => ({
    id: `static-spare-${index}`,
    src,
  })),
]

interface HomeV4OpeningProps {
  /**
   * 这一段的滚动进度 0–1 —— 首屏往上退出的那一程。作品墙按它向两侧散开，
   * 标题在后半程淡出。
   */
  progress: number
  /**
   * The wall, newest public work first, read server-side by the page. The first
   * `CELL_COUNT` fill the grid and the rest become the rotation pool — the split
   * happens here because only this component knows what a "cell" is.
   *
   * Falls back to the bundled strip when absent. The service already guarantees
   * a full wall, so this fallback is for callers that pass nothing at all.
   */
  shots?: readonly HomeV4ShowcaseShot[]
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
export function HomeV4Opening({ progress, shots }: HomeV4OpeningProps) {
  const t = useTranslations('Homepage')
  const tCommon = useTranslations('Common')

  /* Server prop, so these are settled on the first render and never change —
     but memoised anyway, because `cells` is an effect dependency. */
  const wall = shots?.length ? shots : STATIC_SHOTS
  const cells = useMemo(
    () => wall.slice(0, HOME_V4_SHOWCASE.CELL_COUNT),
    [wall],
  )

  const beats = homeV4OpeningBeats(progress)
  const [slots, setSlots] = useState<StripSlot[]>(() =>
    cells.map((shot) => ({ a: shot.src, b: null, swapping: false })),
  )

  /* Refs, not state: the rotation tick reads them from inside a timer, where a
     captured render's values would be stale. */
  const slotsRef = useRef(slots)
  /* Whatever the grid did not take. The rotation swaps these in and hands the
     outgoing shot back, so the pool never empties. */
  const sparesRef = useRef<string[]>(
    wall.slice(HOME_V4_SHOWCASE.CELL_COUNT).map((shot) => shot.src),
  )
  const swapTimersRef = useRef<number[]>([])

  const commit = useCallback((next: StripSlot[]) => {
    slotsRef.current = next
    setSlots(next)
  }, [])

  const rotate = useCallback(() => {
    const current = slotsRef.current
    const candidates = current
      .map((_, index) => index)
      .filter((index) => !current[index].swapping)
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

  /**
   * 常驻轮换。⚠ 这里**不再有入场时间线**：长卷的首屏一落地就是完整的，没有
   * 「进入这一页」这个事件可以挂。墙照旧每隔一阵换一张，读者在读的时候它在呼吸。
   */
  useEffect(() => {
    const interval = window.setInterval(
      rotate,
      HOME_V4_OPENING.ROTATE_INTERVAL_MS,
    )
    return () => {
      window.clearInterval(interval)
      swapTimersRef.current.forEach((id) => window.clearTimeout(id))
      swapTimersRef.current = []
    }
  }, [rotate])

  /**
   * 散开：格子离中线越远走得越远（`--away` 是它到中线的距离，0–1），所以墙是
   * **向两侧摊开**而不是整块平移。只写 `transform` 与 `opacity`。
   */
  const spreadStyle = (index: number): CSSProperties => {
    const middle = (cells.length - 1) / 2
    const away = middle === 0 ? 0 : (index - middle) / middle
    return {
      '--away': away,
      '--spread': beats.spread,
      '--spread-vw': `${HOME_V4_BEATS.opening.spreadVw}vw`,
    } as CSSProperties
  }

  return (
    <div className="page-inner">
      {/* Watermark, so it goes before `.fg` and stays behind it. It rides the
          slowest parallax layer — the wall and the headline slide past it. */}
      <div className="op-brand l1" aria-hidden="true">
        {tCommon('brand')}
      </div>

      <div className="fg">
        <div
          className="op-hero l2 in"
          style={{ opacity: beats.copyOpacity } as CSSProperties}
        >
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
          {cells.map((shot, index) => {
            const slot = slots[index]
            const classes = ['in', slot.swapping ? 'swap' : '']
              .filter(Boolean)
              .join(' ')

            return (
              <figure
                key={shot.id}
                className={classes}
                style={spreadStyle(index)}
              >
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

        <p
          className="op-note l3 in"
          style={{ opacity: beats.copyOpacity } as CSSProperties}
        >
          {t('v4.opening.note')}
        </p>
      </div>

      {/* Outside `.fg` on purpose: both are pinned to `.page-inner`. */}
      <div className="op-mq l1 in">
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

      <div
        className="op-cue in"
        style={{ opacity: beats.copyOpacity } as CSSProperties}
      >
        <i />
        <span className="cue-pc">{t('v4.opening.cuePc')}</span>
        <span className="cue-m">{t('v4.opening.cueMobile')}</span>
      </div>
    </div>
  )
}

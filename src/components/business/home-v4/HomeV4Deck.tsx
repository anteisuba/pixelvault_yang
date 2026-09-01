'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_PAGES,
  HOME_V4_STATION_KEYS,
  HOME_V4_STATIONS,
  type HomeV4Page,
  type HomeV4PageGroup,
  type HomeV4ShowcaseShot,
  type HomeV4StationKey,
} from '@/constants/homepage-v4'

import { HomeV4Finale } from './HomeV4Finale'
import { HomeV4FnAudio } from './HomeV4FnAudio'
import { HomeV4FnCanvas } from './HomeV4FnCanvas'
import { HomeV4FnImage } from './HomeV4FnImage'
import { HomeV4FnLora } from './HomeV4FnLora'
import { HomeV4FnVault } from './HomeV4FnVault'
import { HomeV4FnVideo } from './HomeV4FnVideo'
import { HomeV4ModelPage } from './HomeV4ModelPage'
import { HomeV4ModelSheet } from './HomeV4ModelSheet'
import { HomeV4Opening } from './HomeV4Opening'
import { HomeV4Topbar } from './HomeV4Topbar'

type StationIndexes = Record<HomeV4StationKey, number>

interface HomeV4DeckProps {
  /** Locale segment. Passed down so the sheet's portal can re-declare it. */
  locale: string
  /** Opening wall shots, read server-side. Passed straight through. */
  shots?: readonly HomeV4ShowcaseShot[]
}

/** Which model's detail sheet is open. `null` while none is. */
interface OpenSheet {
  station: HomeV4StationKey
  index: number
}

const LAST_PAGE = HOME_V4_PAGES.length - 1

function initialStationIndexes(): StationIndexes {
  return HOME_V4_STATION_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as StationIndexes)
}

/** `01`…`09`, then `10` upward — the SPEC's mobile toc numbering. */
function tocNumber(index: number): string {
  return index < 9 ? `0${index + 1}` : String(index + 1)
}

/** Position class for a page/station page relative to the one on screen. */
function posOf(index: number, current: number): 'before' | 'on' | 'after' {
  if (index < current) return 'before'
  if (index > current) return 'after'
  return 'on'
}

/**
 * v4 marketing home — the paging engine.
 *
 * Fourteen full-screen pages stacked in place and moved with a single
 * `translateY`; five of them are *stations* that page sideways through their
 * models before releasing the deck downward again. Every number lives in
 * `HOME_V4_ENGINE` / `HOME_V4_PARALLAX`; every visual rule lives in
 * `home-v4.css`. Domain contract and page/station tables:
 * `docs/references/pages/home.md`.
 *
 * Three things about the shape of this file are load-bearing:
 *
 * - **Position is computed, never written.** Each page renders its own
 *   `data-pos` from the current index and the stylesheet does the rest, so there
 *   is no imperative DOM layer to fall out of sync with React.
 * - **The gesture handlers read refs, not state.** They are registered once and
 *   never re-bound; `vGo`/`hGo` update the ref before the setState so a wheel
 *   event arriving in the same tick already sees the new position.
 * - **The lock outlives the slide.** `LOCK_MS` is a hair longer than the
 *   transition: shorter, and a trackpad's tail delta lands mid-flight and
 *   double-steps.
 *
 * `prefers-reduced-motion` is handled entirely in CSS (transitions off, so pages
 * cut rather than slide). The gestures stay — taking them away would leave the
 * page with no way to move at all.
 */
export function HomeV4Deck({ locale, shots }: HomeV4DeckProps) {
  const t = useTranslations('Homepage')

  const [vIdx, setVIdx] = useState(0)
  const [hIdxs, setHIdxs] = useState<StationIndexes>(initialStationIndexes)
  const [tocOpen, setTocOpen] = useState(false)
  const [sheet, setSheet] = useState<OpenSheet | null>(null)

  /* Declared before every callback that writes them. */
  const vIdxRef = useRef(0)
  const hIdxsRef = useRef<StationIndexes>(initialStationIndexes())
  const tocOpenRef = useRef(false)
  const sheetRef = useRef<OpenSheet | null>(null)
  const wheelAccRef = useRef(0)
  /**
   * When the input lock expires, as a `performance.now()` stamp.
   *
   * ⚠ This used to be a boolean flipped back by a `setTimeout`, and that shape
   * has one failure mode with no symptom to debug by: if the release timer is
   * starved — a background tab clamps timers to one-second buckets, a long task
   * blocks the queue — the flag stays `true` and *every* gesture is swallowed
   * from then on. Silent, permanent, zero console output; the page simply stops
   * turning. A deadline cannot get stuck: nothing has to run for it to expire.
   */
  const lockUntilRef = useRef(0)

  const lock = useCallback(() => {
    lockUntilRef.current = performance.now() + HOME_V4_ENGINE.LOCK_MS
  }, [])

  const isLocked = useCallback(
    () => performance.now() < lockUntilRef.current,
    [],
  )

  const setToc = useCallback((open: boolean) => {
    tocOpenRef.current = open
    setTocOpen(open)
  }, [])

  /**
   * The mobile detail sheet belongs to the deck rather than to the model page
   * that opens it, because closing it is a *deck* event: any page turn, any
   * station turn and Escape all have to close it, and a sheet owned by the page
   * underneath would be left hanging over the next one.
   */
  const openSheet = useCallback((station: HomeV4StationKey, index: number) => {
    const next = { station, index }
    sheetRef.current = next
    setSheet(next)
  }, [])

  const closeSheet = useCallback(() => {
    if (sheetRef.current === null) return
    sheetRef.current = null
    setSheet(null)
  }, [])

  const vGo = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(LAST_PAGE, target))
      if (next === vIdxRef.current) return
      vIdxRef.current = next
      setVIdx(next)
      setToc(false)
      closeSheet()
      lock()
    },
    [closeSheet, lock, setToc],
  )

  const hGo = useCallback(
    (station: HomeV4StationKey, target: number) => {
      const total = HOME_V4_STATIONS[station].length
      const next = Math.max(0, Math.min(total - 1, target))
      if (next === hIdxsRef.current[station]) return
      const updated = { ...hIdxsRef.current, [station]: next }
      hIdxsRef.current = updated
      setHIdxs(updated)
      closeSheet()
      lock()
    },
    [closeSheet, lock],
  )

  /**
   * Open a station straight at one of its models — the feature pages' 「N 个模型
   * →」 chips land here.
   *
   * The horizontal index is written *before* the vertical move so the station
   * page mounts already showing the asked-for model; doing it the other way
   * round shows model 1 for a frame and then slides sideways.
   */
  const jumpToModel = useCallback(
    (station: HomeV4StationKey, modelIndex: number) => {
      const total = HOME_V4_STATIONS[station].length
      const next = Math.max(0, Math.min(total - 1, modelIndex))
      const updated = { ...hIdxsRef.current, [station]: next }
      hIdxsRef.current = updated
      setHIdxs(updated)

      const pageIndex = HOME_V4_PAGES.findIndex(
        (page) => page.station === station,
      )
      if (pageIndex >= 0) vGo(pageIndex)
      /* `vGo` locks only when it actually moves; the sideways jump has to be
         covered too, or a wheel tick landing mid-slide double-steps. It also
         only closes the sheet when it moves, and this writes `hIdxs` itself. */
      closeSheet()
      lock()
    },
    [closeSheet, lock, vGo],
  )

  /* A station swallows the input until it runs out of models — that is what makes
     「站内翻完才放行竖走」 true for the wheel, a swipe and the arrow keys alike. */
  const stepNext = useCallback(() => {
    const station = HOME_V4_PAGES[vIdxRef.current].station
    if (
      station &&
      hIdxsRef.current[station] < HOME_V4_STATIONS[station].length - 1
    ) {
      hGo(station, hIdxsRef.current[station] + 1)
      return
    }
    vGo(vIdxRef.current + 1)
  }, [hGo, vGo])

  const stepPrev = useCallback(() => {
    const station = HOME_V4_PAGES[vIdxRef.current].station
    if (station && hIdxsRef.current[station] > 0) {
      hGo(station, hIdxsRef.current[station] - 1)
      return
    }
    vGo(vIdxRef.current - 1)
  }, [hGo, vGo])

  /* The page owns the viewport while it is mounted. Scoped to a class rather
     than bare `html, body` selectors so leaving the route hands the document
     back — every other page in the app shares this body. */
  useEffect(() => {
    const { documentElement, body } = document
    documentElement.classList.add('home-v4-locked')
    body.classList.add('home-v4-locked')
    return () => {
      documentElement.classList.remove('home-v4-locked')
      body.classList.remove('home-v4-locked')
    }
  }, [])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      /* The toc is a normal scrolling list; swallowing its wheel would strand
         anyone whose page list is taller than the screen. The detail sheet is
         the same case — and a wheel that reached here from *outside* it (the
         veil) must not turn the page under an open sheet either. */
      if (tocOpenRef.current || sheetRef.current) return
      event.preventDefault()
      if (isLocked()) {
        wheelAccRef.current = 0
        return
      }
      wheelAccRef.current += event.deltaY
      if (wheelAccRef.current > HOME_V4_ENGINE.WHEEL_THRESHOLD) {
        wheelAccRef.current = 0
        stepNext()
      } else if (wheelAccRef.current < -HOME_V4_ENGINE.WHEEL_THRESHOLD) {
        wheelAccRef.current = 0
        stepPrev()
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [isLocked, stepNext, stepPrev])

  useEffect(() => {
    let startY: number | null = null
    let startX: number | null = null

    const onStart = (event: TouchEvent) => {
      startY = event.touches[0].clientY
      startX = event.touches[0].clientX
    }

    const onEnd = (event: TouchEvent) => {
      if (startY === null || startX === null) return
      const dy = startY - event.changedTouches[0].clientY
      const dx = startX - event.changedTouches[0].clientX
      startY = null
      startX = null
      if (isLocked() || tocOpenRef.current || sheetRef.current) return

      const threshold = HOME_V4_ENGINE.TOUCH_THRESHOLD_PX
      const station = HOME_V4_PAGES[vIdxRef.current].station
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > threshold && station) {
        hGo(station, hIdxsRef.current[station] + (dx > 0 ? 1 : -1))
      } else if (Math.abs(dy) > threshold) {
        if (dy > 0) stepNext()
        else stepPrev()
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [hGo, isLocked, stepNext, stepPrev])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (tocOpenRef.current) {
        if (event.key === 'Escape') setToc(false)
        return
      }
      /* Escape is the sheet's only keyboard exit — the veil is a pointer
         target, and the sheet covers the page it belongs to. */
      if (sheetRef.current) {
        if (event.key === 'Escape') closeSheet()
        return
      }
      /* Space is a control's own activation key. Stealing it from a focused
         button would fire the button *and* turn the page. */
      const target = event.target as HTMLElement | null
      if (event.key === ' ' && target?.closest('button, a')) return
      if (isLocked()) return

      const station = HOME_V4_PAGES[vIdxRef.current].station
      if (
        event.key === 'ArrowDown' ||
        event.key === 'PageDown' ||
        event.key === ' '
      ) {
        event.preventDefault()
        stepNext()
      } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault()
        stepPrev()
      } else if (event.key === 'ArrowRight' && station) {
        event.preventDefault()
        hGo(station, hIdxsRef.current[station] + 1)
      } else if (event.key === 'ArrowLeft' && station) {
        event.preventDefault()
        hGo(station, hIdxsRef.current[station] - 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSheet, hGo, isLocked, setToc, stepNext, stepPrev])

  const renderStation = (page: HomeV4Page, pageIndex: number) => {
    const station = page.station
    if (!station) return null
    const models = HOME_V4_STATIONS[station]
    const hIdx = hIdxs[station]
    const isLive = pageIndex === vIdx
    /* The station's own nav stands where the sheet comes up; it steps aside. */
    const sheetOn = sheet?.station === station

    return (
      <>
        <div
          className={sheetOn ? 'hwrap sheet-on' : 'hwrap'}
          data-station={station}
        >
          {models.map((model, index) => (
            <div
              key={model.key}
              className="hpg"
              data-pos={posOf(index, hIdx)}
              inert={!(isLive && index === hIdx)}
            >
              <HomeV4ModelPage
                model={model}
                /* Same condition `inert` runs on — one page is live, and only
                   that one may play its clip. */
                active={isLive && index === hIdx}
                /* ⭐ One step either way, vertically and horizontally. The
                   opening page is seven steps from the nearest station, so a
                   visitor who never scrolls fetches **no** model shot at all —
                   which is what makes full-quality covers affordable. */
                near={
                  Math.abs(pageIndex - vIdx) <= 1 && Math.abs(index - hIdx) <= 1
                }
                onOpenDetail={() => openSheet(station, index)}
              />
            </div>
          ))}
        </div>

        <div className="hnav">
          <button
            type="button"
            aria-label={t('v4.nav.prevModel')}
            onClick={() => hGo(station, hIdx - 1)}
          >
            ←
          </button>
          <span className="hdots">
            {models.map((model, index) => (
              <i key={model.key} data-on={String(index === hIdx)} />
            ))}
          </span>
          <span>
            {hIdx + 1} / {models.length} · {models[hIdx].name}
          </span>
          <button
            type="button"
            aria-label={t('v4.nav.nextModel')}
            onClick={() => hGo(station, hIdx + 1)}
          >
            →
          </button>
        </div>
      </>
    )
  }

  const renderPage = (page: HomeV4Page, index: number) => {
    const active = index === vIdx
    if (page.id === 'opening')
      return <HomeV4Opening active={active} shots={shots} />
    if (page.id === 'finale') return <HomeV4Finale active={active} />
    if (page.station) return renderStation(page, index)

    /* Every feature page takes the same header and the same play/reset switch;
       only page 01 needs a way back out into a station. */
    const shared = {
      active,
      eyebrow: page.eyebrow ?? '',
      title: t(`v4.pages.${page.id}.title`),
    }

    switch (page.id) {
      case 'image':
        return (
          <HomeV4FnImage
            {...shared}
            onOpenModel={(modelIndex) => jumpToModel('image', modelIndex)}
          />
        )
      case 'lora':
        return <HomeV4FnLora {...shared} />
      case 'audio':
        return <HomeV4FnAudio {...shared} />
      case 'video':
        return <HomeV4FnVideo {...shared} />
      case 'canvas':
        return <HomeV4FnCanvas {...shared} />
      case 'vault':
        return <HomeV4FnVault {...shared} />
      default:
        /* Unreachable: every id in `HOME_V4_PAGES` is handled above, and the
           copy test pins that list against the message files. P1/P2's
           `HomeV4PlaceholderPage` is gone — nothing on the deck is a stand-in
           any more, and keeping one around invites a half-built page to look
           finished. */
        return null
    }
  }

  /** A group heading is printed on the first row of each group, and nowhere else. */
  const tocGroupHeads: (HomeV4PageGroup | null)[] = HOME_V4_PAGES.map(
    (page, index) =>
      index === 0 || HOME_V4_PAGES[index - 1].group !== page.group
        ? page.group
        : null,
  )

  return (
    <>
      <HomeV4Topbar />

      <main className="deck">
        {HOME_V4_PAGES.map((page, index) => (
          <section
            key={page.id}
            className="vp"
            data-name={page.id}
            data-pos={posOf(index, vIdx)}
            inert={index !== vIdx}
          >
            {renderPage(page, index)}
          </section>
        ))}
      </main>

      {/* PC：左缘页点，hover 整个区域展开全部页名 */}
      <nav className="dots" aria-label={t('v4.nav.label')}>
        {HOME_V4_PAGES.map((page, index) => (
          <button
            key={page.id}
            type="button"
            data-on={String(index === vIdx)}
            style={{ '--i': index } as CSSProperties}
            onClick={() => vGo(index)}
          >
            <i />
            <span className="nm">{t(`v4.pages.${page.id}.nav`)}</span>
          </button>
        ))}
      </nav>

      {/* Mobile：右缘细点条（拇指区）→ 点击弹全屏目录 */}
      <button
        type="button"
        className="mdots"
        aria-label={t('v4.nav.pageLabel')}
        onClick={() => setToc(true)}
      >
        {HOME_V4_PAGES.map((page, index) => (
          <i key={page.id} className={index === vIdx ? 'on' : undefined} />
        ))}
      </button>

      {/* Closed, it is only `opacity:0` — without `inert` a screen reader would
          still walk fourteen invisible page buttons on every mobile page. */}
      <div className={`mtoc${tocOpen ? ' on' : ''}`} inert={!tocOpen}>
        <button
          type="button"
          className="mt-x"
          aria-label={t('v4.nav.close')}
          onClick={() => setToc(false)}
        >
          ✕
        </button>
        {HOME_V4_PAGES.map((page, index) => {
          const heading = tocGroupHeads[index]
          const models = page.station
            ? HOME_V4_STATIONS[page.station].length
            : 0
          const name = t(`v4.pages.${page.id}.nav`)

          return (
            <Fragment key={page.id}>
              {heading ? (
                <span className="mt-k">{t(`v4.groups.${heading}`)}</span>
              ) : null}
              <button
                type="button"
                className={index === vIdx ? 'on' : undefined}
                onClick={() => vGo(index)}
              >
                <span className="no">{tocNumber(index)}</span>
                {models
                  ? `${name} · ${t('v4.nav.stationPages', { count: models })}`
                  : name}
              </button>
            </Fragment>
          )
        })}
      </div>

      {/* Portalled to `<body>`: a `.vp` is transformed, so a sheet rendered
          inside one would be fixed to the page rather than the viewport. */}
      <HomeV4ModelSheet
        model={sheet ? HOME_V4_STATIONS[sheet.station][sheet.index] : null}
        locale={locale}
        onClose={closeSheet}
      />
    </>
  )
}

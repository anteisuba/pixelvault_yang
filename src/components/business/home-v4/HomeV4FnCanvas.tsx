'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_CANVAS,
  HOME_V4_FN_CANVAS_SHOTS,
  HOME_V4_FN_CANVAS_THUMBS,
  HOME_V4_GLYPHS,
  HOME_V4_MOBILE_QUERY,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnCanvasProps {
  /** True while this is the page on screen. Drives play / reset. */
  active: boolean
  eyebrow: string
  title: string
}

interface CanvasBeats {
  /** Chat bubbles that have landed in window ①. */
  msgs: number
  /** The script chip under them. */
  chip: boolean
  /** How many hand-off arrows are lit (PC only — mobile hides them). */
  hands: number
  /** Window ② / ③ have woken up (`.dimmed.on`). */
  scriptOn: boolean
  boardOn: boolean
  /** Script rows shown, and script rows marked as sent to the canvas. */
  rowsIn: number
  rowsSent: number
  /** Shot nodes that have popped onto the canvas. */
  nodesIn: number
  /** The three wires drawing themselves. */
  wires: boolean
  /** The finished cut node. */
  cut: boolean
  /**
   * Mobile only: which of the three windows is on stage. `null` on desktop,
   * where all three stand side by side and the attribute must not exist.
   */
  stage: '1' | '2' | '3' | null
}

const AT_REST: CanvasBeats = {
  msgs: 0,
  chip: false,
  hands: 0,
  scriptOn: false,
  boardOn: false,
  rowsIn: 0,
  rowsSent: 0,
  nodesIn: 0,
  wires: false,
  cut: false,
  stage: null,
}

/** Shot thumbnails, in script order. */
const SHOT_SOURCES = [
  HOME_V4_STORY.shotDeck,
  HOME_V4_STORY.shotDeparture,
  HOME_V4_STORY.shotPullback,
] as const

/**
 * 功能页 05 · 画布 — talk out a script, grow it into nodes, wire it into a cut.
 *
 * Three windows, and the point of the page is the *hand-off* between them, not
 * the windows themselves. So the two layouts tell it differently:
 *
 * - **PC** stands all three side by side and animates the hand-off literally:
 *   a ghost of the script chip flies into window ②'s title, then a ghost card
 *   flies out of each script row and lands as a node on the canvas. The ghosts
 *   are measured with two `getBoundingClientRect` reads and moved with one
 *   transform — a FLIP, which is why they are raw DOM in `.fn-flyers` rather
 *   than React children.
 * - **Mobile** stacks the three windows in one grid cell and pages between them
 *   (`data-stage`), where the step change *is* the hand-off, so the flights are
 *   dropped and every beat moves.
 *
 * ⚠ Two traps live in `home-v4.css` and are load-bearing:
 *   1. the mobile carousel's `opacity` ties with `.fn-step.dimmed.on`, so those
 *      rules are written through `.fn-canvas` to outrank it;
 *   2. the wires are normalised with `pathLength="1"`, so drawing a line is
 *      just `stroke-dashoffset` 1 → 0 regardless of its real length.
 */
export function HomeV4FnCanvas({
  active,
  eyebrow,
  title,
}: HomeV4FnCanvasProps) {
  const t = useTranslations('Homepage')

  const [beats, setBeats] = useState<CanvasBeats>(AT_REST)

  /* Read during render, not inside the effect: a *string* dependency is
     value-compared, so the timeline is not rebuilt on every state change the
     performance itself causes. */
  const chipLabel = t('v4.fn.canvas.assistant.chip')

  const flyersRef = useRef<HTMLDivElement | null>(null)
  const chipRef = useRef<HTMLSpanElement | null>(null)
  const scriptTitleRef = useRef<HTMLSpanElement | null>(null)
  const rowSendRefs = useRef<(HTMLSpanElement | null)[]>([])
  const nodeRefs = useRef<(HTMLDivElement | null)[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  /* Every timer this page owns, including the ones a flight schedules from
     inside another timer — one array, one place that clears it. */
  const timersRef = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = []
  }, [])

  /** FLIP one ghost from `from` to `to`, then drop it. */
  const fly = useCallback(
    (
      from: Element | null,
      to: Element | null,
      ghost: HTMLElement,
      scaleTo: number,
    ) => {
      const host = flyersRef.current
      if (!host || !from || !to) return

      const hostRect = host.getBoundingClientRect()
      const fromRect = from.getBoundingClientRect()
      const toRect = to.getBoundingClientRect()

      ghost.className = 'flyer'
      ghost.style.left = `${fromRect.left - hostRect.left}px`
      ghost.style.top = `${fromRect.top - hostRect.top}px`
      host.appendChild(ghost)
      /* Read once so the browser commits the start frame. Without it the ghost
         is born at its destination and nothing animates. */
      ghost.getBoundingClientRect()

      const dx =
        toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2)
      const dy =
        toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2)
      ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleTo})`
      ghost.style.opacity = '0'

      timersRef.current.push(
        window.setTimeout(() => ghost.remove(), HOME_V4_FN_CANVAS.FLY_LIFE_MS),
      )
    },
    [],
  )

  useEffect(() => {
    if (!active) {
      clearTimers()
      /* Rewind only once the page has slid away — see `HomeV4Opening`. */
      timersRef.current.push(
        window.setTimeout(() => {
          setBeats(AT_REST)
          const host = flyersRef.current
          while (host?.firstChild) host.firstChild.remove()
          videoRef.current?.pause()
        }, HOME_V4_ENGINE.PAGE_MS),
      )
      return clearTimers
    }

    const at = (fn: () => void, ms: number) => {
      timersRef.current.push(
        window.setTimeout(fn, HOME_V4_FN_CANVAS.ENTER_DELAY_MS + ms),
      )
    }
    const set = (patch: Partial<CanvasBeats>) => {
      setBeats((current) => ({ ...current, ...patch }))
    }
    const rollCut = () => {
      set({ cut: true })
      const clip = videoRef.current
      if (!clip) return
      clip.currentTime = 0
      /* Autoplay can be refused; the poster is the fallback, not an error. */
      void clip.play().catch(() => undefined)
    }

    /* jsdom (and some runners) ship without `matchMedia` — same guard as
       `use-mobile.ts`. Falling back to the desktop timeline there is right:
       it is the one that exercises the flights. */
    const isMobile =
      typeof window.matchMedia === 'function' &&
      window.matchMedia(HOME_V4_MOBILE_QUERY).matches

    if (isMobile) {
      const m = HOME_V4_FN_CANVAS.MOBILE
      at(() => set({ stage: '1' }), 0)
      m.MSG_MS.forEach((ms, index) => {
        at(() => set({ msgs: index + 1 }), ms)
      })
      at(() => set({ chip: true }), m.CHIP_MS)
      at(() => set({ stage: '2', scriptOn: true }), m.STAGE_SCRIPT_MS)
      HOME_V4_FN_CANVAS_SHOTS.forEach((_, index) => {
        at(
          () => set({ rowsIn: index + 1 }),
          m.ROW_IN_MS + index * m.ROW_STEP_MS,
        )
        at(
          () => set({ rowsSent: index + 1 }),
          m.ROW_SENT_MS + index * m.ROW_STEP_MS,
        )
      })
      at(() => set({ stage: '3', boardOn: true }), m.STAGE_BOARD_MS)
      HOME_V4_FN_CANVAS_SHOTS.forEach((_, index) => {
        at(
          () => set({ nodesIn: index + 1 }),
          m.NODE_IN_MS + index * m.NODE_STEP_MS,
        )
      })
      at(() => set({ wires: true }), m.WIRES_MS)
      at(rollCut, m.CUT_MS)
      return clearTimers
    }

    const p = HOME_V4_FN_CANVAS.PC
    p.MSG_MS.forEach((ms, index) => {
      at(() => set({ msgs: index + 1 }), ms)
    })
    at(() => set({ chip: true }), p.CHIP_MS)
    at(() => {
      set({ hands: 1 })
      const ghost = document.createElement('div')
      const chip = document.createElement('span')
      chip.className = 'fly-chip'
      chip.textContent = chipLabel
      ghost.appendChild(chip)
      fly(
        chipRef.current,
        scriptTitleRef.current,
        ghost,
        HOME_V4_FN_CANVAS.CHIP_FLY_SCALE,
      )
    }, p.HANDOFF_MS)
    at(() => set({ scriptOn: true }), p.SCRIPT_ON_MS)

    HOME_V4_FN_CANVAS_SHOTS.forEach((_, index) => {
      at(() => set({ rowsIn: index + 1 }), p.ROW_IN_MS + index * p.ROW_STEP_MS)
      at(
        () => {
          /* The board wakes up on the first hand-off, not on a clock of its own —
           the row leaving is what opens it. */
          set(
            index === 0
              ? { rowsSent: 1, hands: 2, boardOn: true }
              : { rowsSent: index + 1 },
          )
          const ghost = document.createElement('div')
          const card = document.createElement('span')
          card.className = 'fly-card'
          ghost.appendChild(card)
          fly(
            rowSendRefs.current[index],
            nodeRefs.current[index],
            ghost,
            HOME_V4_FN_CANVAS.CARD_FLY_SCALE,
          )
        },
        p.ROW_SENT_MS + index * p.ROW_STEP_MS,
      )
      at(
        () => set({ nodesIn: index + 1 }),
        p.NODE_IN_MS + index * p.ROW_STEP_MS,
      )
    })

    at(() => set({ wires: true }), p.WIRES_MS)
    at(rollCut, p.CUT_MS)

    return clearTimers
  }, [active, chipLabel, clearTimers, fly])

  const wireClass = `${beats.wires ? 'draw' : ''}`

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title}>
      <div className="fn-canvas" data-stage={beats.stage ?? undefined}>
        {/* ① 助手 */}
        <div className="fn-step s1">
          <div className="bar">
            <span className="no">1</span>
            <span className="t">{t('v4.fn.canvas.assistant.title')}</span>
            <span className="p">{t('v4.fn.canvas.assistant.meta')}</span>
          </div>
          <div className="body">
            <div className={`m me${beats.msgs > 0 ? ' in' : ''}`}>
              <span className="av">{t('v4.fn.canvas.assistant.meAvatar')}</span>
              <span className="b">{t('v4.fn.canvas.assistant.me')}</span>
            </div>
            <div className={`m${beats.msgs > 1 ? ' in' : ''}`}>
              <span className="av">
                {t('v4.fn.canvas.assistant.botAvatar')}
              </span>
              <span className="b">{t('v4.fn.canvas.assistant.bot')}</span>
            </div>
            <span className={`chip${beats.chip ? ' in' : ''}`} ref={chipRef}>
              {t('v4.fn.canvas.assistant.chip')}
            </span>
          </div>
        </div>

        <div className={`fn-hand${beats.hands > 0 ? ' on' : ''}`} data-h="0">
          {HOME_V4_GLYPHS.arrow}
        </div>

        {/* ② 剧本 */}
        <div className={`fn-step s2 dimmed${beats.scriptOn ? ' on' : ''}`}>
          <div className="bar">
            <span className="no">2</span>
            <span className="t" ref={scriptTitleRef}>
              {t('v4.fn.canvas.script.title')}
            </span>
            <span className="p">{t('v4.fn.canvas.script.meta')}</span>
          </div>
          <div className="body">
            {HOME_V4_FN_CANVAS_SHOTS.map((shot, index) => {
              const classes = [
                'row',
                index < beats.rowsIn ? 'in' : '',
                index < beats.rowsSent ? 'sent' : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <div className={classes} key={shot}>
                  <span className="ix">
                    {t(`v4.fn.canvas.script.rows.${shot}.index`)}
                  </span>
                  <span className="tx">
                    {t(`v4.fn.canvas.script.rows.${shot}.text`)}
                  </span>
                  <span
                    className="np"
                    ref={(element) => {
                      rowSendRefs.current[index] = element
                    }}
                  >
                    {HOME_V4_GLYPHS.arrow} {t('v4.fn.canvas.script.toNode')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className={`fn-hand${beats.hands > 1 ? ' on' : ''}`} data-h="1">
          {HOME_V4_GLYPHS.arrow}
        </div>

        {/* ③ 画布 */}
        <div className={`fn-step s3 dimmed${beats.boardOn ? ' on' : ''}`}>
          <div className="bar">
            <span className="no">3</span>
            <span className="t">{t('v4.fn.canvas.board.title')}</span>
            <span className="p">{t('v4.fn.canvas.board.meta')}</span>
          </div>
          <div className="cv">
            <svg className="wires" viewBox="0 0 450 378" aria-hidden="true">
              <path
                pathLength={1}
                className={wireClass}
                d="M136 63 C 168 63, 168 158, 196 158"
              />
              <path
                pathLength={1}
                className={wireClass}
                d="M136 189 C 168 189, 168 188, 196 188"
              />
              <path
                pathLength={1}
                className={wireClass}
                d="M136 315 C 168 315, 168 218, 196 218"
              />
            </svg>

            {HOME_V4_FN_CANVAS_SHOTS.map((shot, index) => (
              <div
                className={`cn${index < beats.nodesIn ? ' in' : ''}`}
                data-n={index}
                key={shot}
                ref={(element) => {
                  nodeRefs.current[index] = element
                }}
              >
                <Image
                  src={SHOT_SOURCES[index]}
                  alt=""
                  width={HOME_V4_FN_CANVAS_THUMBS.SHOT.W}
                  height={HOME_V4_FN_CANVAS_THUMBS.SHOT.H}
                />
                <span className="cl">
                  {t(`v4.fn.canvas.board.nodes.${shot}`)}
                </span>
              </div>
            ))}

            <div
              className={`cn cnv${beats.cut ? ' in' : ''}`}
              data-n={HOME_V4_FN_CANVAS_SHOTS.length}
            >
              <video
                ref={videoRef}
                muted
                loop
                playsInline
                preload="none"
                poster={HOME_V4_STORY.poster}
                src={HOME_V4_STORY.clip}
                width={HOME_V4_FN_CANVAS_THUMBS.CUT.W}
                height={HOME_V4_FN_CANVAS_THUMBS.CUT.H}
              />
              <span className="cl">{t('v4.fn.canvas.board.cut')}</span>
            </div>
          </div>
        </div>

        {/* Ghosts land here — a layer React never puts children into, so the
            two never fight over the same DOM. */}
        <div className="fn-flyers" ref={flyersRef} aria-hidden="true" />
      </div>
    </HomeV4FnFrame>
  )
}

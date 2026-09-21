'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_CANVAS,
  HOME_V4_FN_CANVAS_SHOTS,
  HOME_V4_FN_CANVAS_THUMBS,
  HOME_V4_GLYPHS,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'

import { useHomeV4Typewriter } from '@/hooks/use-home-v4-typewriter'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnCanvasProps {
  active: boolean
  eyebrow: string
  title: string
}

const SHOT_SOURCES = [
  HOME_V4_STORY.shotDeck,
  HOME_V4_STORY.shotDeparture,
  HOME_V4_STORY.shotPullback,
]

const AT_REST = {
  stage: 0,
  message: false,
  reply: false,
  recipe: false,
  rows: 0,
  sent: 0,
  nodes: 0,
  wires: false,
  cut: false,
  reduced: false,
}

export function HomeV4FnCanvas({
  active,
  eyebrow,
  title,
}: HomeV4FnCanvasProps) {
  const t = useTranslations('Homepage')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [beats, setBeats] = useState(AT_REST)
  const timing = HOME_V4_FN_CANVAS
  const me = t('v4.fn.canvas.assistant.me')
  const bot = t('v4.fn.canvas.assistant.bot')
  const replyAt =
    timing.ENTER_DELAY_MS + me.length * timing.TYPE_MS + timing.REPLY_GAP_MS
  const recipeAt = replyAt + bot.length * timing.TYPE_MS + timing.RECIPE_GAP_MS
  const scriptAt = recipeAt + timing.SCRIPT_GAP_MS
  const boardAt =
    scriptAt +
    HOME_V4_FN_CANVAS_SHOTS.length * timing.ROW_STEP_MS +
    timing.BOARD_GAP_MS
  const wiresAt =
    boardAt +
    HOME_V4_FN_CANVAS_SHOTS.length * timing.NODE_STEP_MS +
    timing.WIRES_AFTER_NODES_MS
  const typedMe = useHomeV4Typewriter({
    text: me,
    stepMs: timing.TYPE_MS,
    delayMs: timing.ENTER_DELAY_MS,
    active: active && !beats.reduced,
    resetMs: HOME_V4_ENGINE.PAGE_MS,
  })
  const typedBot = useHomeV4Typewriter({
    text: bot,
    stepMs: timing.TYPE_MS,
    delayMs: replyAt,
    active: active && !beats.reduced,
    resetMs: HOME_V4_ENGINE.PAGE_MS,
  })

  useEffect(() => {
    if (!active) {
      const rewind = window.setTimeout(
        () => setBeats(AT_REST),
        HOME_V4_ENGINE.PAGE_MS,
      )
      return () => window.clearTimeout(rewind)
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const timers: number[] = []
    const at = (ms: number, patch: Partial<typeof AT_REST>) => {
      timers.push(
        window.setTimeout(
          () => setBeats((current) => ({ ...current, ...patch })),
          ms,
        ),
      )
    }
    at(0, AT_REST)
    if (reduced?.matches) {
      at(0, {
        stage: 2,
        message: true,
        reply: true,
        recipe: true,
        rows: 3,
        sent: 3,
        nodes: 3,
        wires: true,
        cut: true,
        reduced: true,
      })
    } else {
      at(timing.ENTER_DELAY_MS, { message: true })
      at(replyAt, { reply: true })
      at(recipeAt, { recipe: true })
      at(scriptAt, { stage: 1 })
      HOME_V4_FN_CANVAS_SHOTS.forEach((_, index) => {
        at(scriptAt + (index + 1) * timing.ROW_STEP_MS, { rows: index + 1 })
        at(boardAt - (3 - index) * 300, { sent: index + 1 })
        at(boardAt + (index + 1) * timing.NODE_STEP_MS, { nodes: index + 1 })
      })
      at(boardAt, { stage: 2 })
      at(wiresAt, { wires: true })
      at(wiresAt + timing.CUT_AFTER_WIRES_MS, { cut: true })
    }
    return () => timers.forEach(window.clearTimeout)
  }, [active, replyAt, recipeAt, scriptAt, boardAt, wiresAt, timing])

  const showCut = active && beats.cut && !beats.reduced
  useEffect(() => {
    const clip = videoRef.current
    if (!clip) return
    if (showCut) {
      clip.currentTime = 0
      void clip.play().catch(() => undefined)
    } else clip.pause()
    return () => clip.pause()
  }, [showCut])

  const progress = beats.stage
  const stepStyle = (index: number): CSSProperties =>
    ({
      '--step-offset': index - progress,
      '--step-distance': Math.min(1, Math.abs(index - progress)),
    }) as CSSProperties

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title}>
      <div
        className="fn-canvas"
        data-stage={Math.round(progress) + 1}
        data-scroll-story
      >
        <div className="canvas-steps" aria-label={title}>
          {['assistant', 'script', 'board'].map((step, index) => (
            <span
              key={step}
              aria-current={progress === index ? 'step' : undefined}
            >
              <span>{index + 1}</span>
              {t(`v4.fn.canvas.${step}.title`)}
            </span>
          ))}
        </div>
        <div className="canvas-panels">
          {/* ① 助手 */}
          <div
            className="fn-step s1"
            style={stepStyle(0)}
            inert={Math.round(progress) !== 0}
          >
            <div className="bar">
              <span className="no">1</span>
              <span className="t">{t('v4.fn.canvas.assistant.title')}</span>
              <span className="p">{t('v4.fn.canvas.assistant.meta')}</span>
            </div>
            <div className="body">
              <div className={`m me${beats.message ? ' in' : ''}`}>
                <span className="av">
                  {t('v4.fn.canvas.assistant.meAvatar')}
                </span>
                <span className="b">{beats.reduced ? me : typedMe}</span>
              </div>
              <div className={`m${beats.reply ? ' in' : ''}`}>
                <span className="av">
                  {t('v4.fn.canvas.assistant.botAvatar')}
                </span>
                <span className="b">{beats.reduced ? bot : typedBot}</span>
              </div>
              <span className={`chip${beats.recipe ? ' in' : ''}`}>
                {t('v4.fn.canvas.assistant.chip')}
              </span>
            </div>
          </div>

          {/* ② 剧本 */}
          <div
            className="fn-step s2"
            style={stepStyle(1)}
            inert={Math.round(progress) !== 1}
          >
            <div className="bar">
              <span className="no">2</span>
              <span className="t">{t('v4.fn.canvas.script.title')}</span>
              <span className="p">{t('v4.fn.canvas.script.meta')}</span>
            </div>
            <div className="body">
              {HOME_V4_FN_CANVAS_SHOTS.map((shot, index) => {
                const classes = [
                  'row',
                  index < beats.rows ? 'in' : '',
                  index < beats.sent ? 'sent' : '',
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
                    <span className="np">
                      {HOME_V4_GLYPHS.arrow} {t('v4.fn.canvas.script.toNode')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ③ 画布 */}
          <div
            className="fn-step s3"
            style={stepStyle(2)}
            inert={Math.round(progress) !== 2}
          >
            <div className="bar">
              <span className="no">3</span>
              <span className="t">{t('v4.fn.canvas.board.title')}</span>
              <span className="p">{t('v4.fn.canvas.board.meta')}</span>
            </div>
            <div className="cv">
              <svg className="wires" viewBox="0 0 450 378" aria-hidden="true">
                <path
                  pathLength={1}
                  className={beats.wires ? 'draw' : ''}
                  d="M136 63 C 168 63, 168 158, 196 158"
                />
                <path
                  pathLength={1}
                  className={beats.wires ? 'draw' : ''}
                  d="M136 189 C 168 189, 168 188, 196 188"
                />
                <path
                  pathLength={1}
                  className={beats.wires ? 'draw' : ''}
                  d="M136 315 C 168 315, 168 218, 196 218"
                />
              </svg>

              {HOME_V4_FN_CANVAS_SHOTS.map((shot, index) => (
                <div
                  className={`cn${index < beats.nodes ? ' in' : ''}`}
                  data-n={index}
                  key={shot}
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
        </div>
      </div>
    </HomeV4FnFrame>
  )
}

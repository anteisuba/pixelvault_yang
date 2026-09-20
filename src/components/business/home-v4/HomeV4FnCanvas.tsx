'use client'

import Image from 'next/image'
import { useEffect, useRef, type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_FN_CANVAS_SHOTS,
  HOME_V4_FN_CANVAS_THUMBS,
  HOME_V4_GLYPHS,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'
import { homeV4CanvasBeats } from '@/lib/home-v4-beats'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnCanvasProps {
  /** 这一段还在视口里。只管成片播放，不管画什么。 */
  active: boolean
  eyebrow: string
  title: string
  /** 段内滚动进度 0–1，经 `homeV4CanvasBeats` 映到 0–2 号步骤。 */
  progress: number
  /** 步骤按钮：跳到那一步（= 把该步的进度喂回来）。 */
  onStepChange: (step: number) => void
}

const SHOT_SOURCES = [
  HOME_V4_STORY.shotDeck,
  HOME_V4_STORY.shotDeparture,
  HOME_V4_STORY.shotPullback,
]

export function HomeV4FnCanvas({
  active,
  eyebrow,
  title,
  progress,
  onStepChange,
}: HomeV4FnCanvasProps) {
  const t = useTranslations('Homepage')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const beats = homeV4CanvasBeats(progress)
  const step = beats.step
  const showCut = active && beats.cut

  useEffect(() => {
    const clip = videoRef.current
    if (!clip) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => {
      if (showCut && !reduced?.matches) void clip.play().catch(() => undefined)
      else clip.pause()
    }
    update()
    reduced?.addEventListener('change', update)
    return () => {
      reduced?.removeEventListener('change', update)
      clip.pause()
    }
  }, [showCut])

  const stepStyle = (index: number): CSSProperties =>
    ({
      '--step-offset': index - step,
      '--step-distance': Math.min(1, Math.abs(index - step)),
    }) as CSSProperties

  return (
    <HomeV4FnFrame
      id="canvas"
      eyebrow={eyebrow}
      title={title}
      ctaOn={beats.cta}
    >
      <div
        className="fn-canvas"
        data-stage={Math.round(step) + 1}
        data-scroll-story
      >
        <nav className="canvas-steps" aria-label={title}>
          {['assistant', 'script', 'board'].map((name, index) => (
            <button
              key={name}
              type="button"
              aria-current={Math.round(step) === index ? 'step' : undefined}
              onClick={() => onStepChange(index)}
            >
              <span>{index + 1}</span>
              {t(`v4.fn.canvas.${name}.title`)}
            </button>
          ))}
        </nav>
        <div className="canvas-panels">
          {/* ① 助手 */}
          <div
            className="fn-step s1"
            style={stepStyle(0)}
            inert={Math.round(step) !== 0}
          >
            <div className="bar">
              <span className="no">1</span>
              <span className="t">{t('v4.fn.canvas.assistant.title')}</span>
              <span className="p">{t('v4.fn.canvas.assistant.meta')}</span>
            </div>
            <div className="body">
              <div className={`m me${active ? ' in' : ''}`}>
                <span className="av">
                  {t('v4.fn.canvas.assistant.meAvatar')}
                </span>
                <span className="b">{t('v4.fn.canvas.assistant.me')}</span>
              </div>
              <div className="m in">
                <span className="av">
                  {t('v4.fn.canvas.assistant.botAvatar')}
                </span>
                <span className="b">{t('v4.fn.canvas.assistant.bot')}</span>
              </div>
              <span className="chip in">
                {t('v4.fn.canvas.assistant.chip')}
              </span>
            </div>
          </div>

          {/* ② 剧本 */}
          <div
            className="fn-step s2"
            style={stepStyle(1)}
            inert={Math.round(step) !== 1}
          >
            <div className="bar">
              <span className="no">2</span>
              <span className="t">{t('v4.fn.canvas.script.title')}</span>
              <span className="p">{t('v4.fn.canvas.script.meta')}</span>
            </div>
            <div className="body">
              {HOME_V4_FN_CANVAS_SHOTS.map((shot) => {
                const classes = ['row', 'in', step >= 1.5 ? 'sent' : '']
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
            inert={Math.round(step) !== 2}
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
                  className={showCut ? 'draw' : ''}
                  d="M136 63 C 168 63, 168 158, 196 158"
                />
                <path
                  pathLength={1}
                  className={showCut ? 'draw' : ''}
                  d="M136 189 C 168 189, 168 188, 196 188"
                />
                <path
                  pathLength={1}
                  className={showCut ? 'draw' : ''}
                  d="M136 315 C 168 315, 168 218, 196 218"
                />
              </svg>

              {HOME_V4_FN_CANVAS_SHOTS.map((shot, index) => (
                <div
                  className={`cn${step > 1 ? ' in' : ''}`}
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
                className={`cn cnv${showCut ? ' in' : ''}`}
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

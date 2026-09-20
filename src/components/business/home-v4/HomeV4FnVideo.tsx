'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_VIDEO,
  HOME_V4_FN_VIDEO_REFS,
  HOME_V4_FN_VIDEO_TOOLS,
  HOME_V4_GLYPHS,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'
import { useHomeV4Typewriter } from '@/hooks/use-home-v4-typewriter'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnVideoProps {
  /** True while this is the page on screen. Drives play / reset. */
  active: boolean
  eyebrow: string
  title: string
}

interface VideoBeats {
  /** How many reference capsules have dropped into the composer. */
  pills: number
  /** The prompt line itself (the typewriter owns the text). */
  prompt: boolean
  /** The send button, lit once the line is finished. */
  send: boolean
  /** The finished cut. */
  out: boolean
}

const AT_REST: VideoBeats = {
  pills: 0,
  prompt: false,
  send: false,
  out: false,
}

/**
 * 功能页 04 · 视频 — the reference composer.
 *
 * A shot, a character anchor and a voice line drop into the input one after the
 * other, each with the plain sentence saying what it is *for*; then the prompt
 * is typed, the send button lights, and the cut appears. The argument of the
 * page is the mixed-type input, so the capsules arrive before the words.
 *
 * PC puts the composer and the cut side by side at equal height (the tool row
 * is pushed to the bottom with `margin-top:auto`); mobile stacks them.
 *
 * ⚠ This window is wider than `.imgfn`'s 860px cap: `.fn-video` has to keep its
 * `flex:none` and its own `vw` ceiling or the parent squeezes it back.
 *
 * The clip is a static path with a poster behind it. The SPEC copied blobs
 * between pages at runtime; that hack is retired — see `HOME_V4_STORY`.
 */
export function HomeV4FnVideo({ active, eyebrow, title }: HomeV4FnVideoProps) {
  const t = useTranslations('Homepage')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const promptText = t('v4.fn.video.prompt')
  const typed = useHomeV4Typewriter({
    text: promptText,
    stepMs: HOME_V4_FN_VIDEO.TYPE_MS,
    delayMs: HOME_V4_FN_VIDEO.ENTER_DELAY_MS + HOME_V4_FN_VIDEO.PROMPT_MS,
    active,
    resetMs: HOME_V4_ENGINE.PAGE_MS,
  })

  const [beats, setBeats] = useState<VideoBeats>(AT_REST)

  useEffect(() => {
    if (!active) {
      /* Rewind — and stop the clip — only once the page has slid away, so the
         cut keeps running through the exit instead of freezing mid-frame. */
      const rewind = window.setTimeout(() => {
        setBeats(AT_REST)
        videoRef.current?.pause()
      }, HOME_V4_ENGINE.PAGE_MS)
      return () => window.clearTimeout(rewind)
    }

    const timers: number[] = []
    const at = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, HOME_V4_FN_VIDEO.ENTER_DELAY_MS + ms))
    }

    HOME_V4_FN_VIDEO_REFS.forEach((_, index) => {
      at(
        () => setBeats((current) => ({ ...current, pills: index + 1 })),
        HOME_V4_FN_VIDEO.PILL_START_MS + index * HOME_V4_FN_VIDEO.PILL_STEP_MS,
      )
    })

    const typedAt =
      HOME_V4_FN_VIDEO.PROMPT_MS + promptText.length * HOME_V4_FN_VIDEO.TYPE_MS

    at(
      () => setBeats((current) => ({ ...current, prompt: true })),
      HOME_V4_FN_VIDEO.PROMPT_MS,
    )
    at(() => setBeats((current) => ({ ...current, send: true })), typedAt)
    at(() => {
      setBeats((current) => ({ ...current, out: true }))
      const clip = videoRef.current
      if (!clip) return
      clip.currentTime = 0
      /* Autoplay can be refused (a data-saver profile, a paused-media setting).
         The poster is the fallback, so a refusal is not an error. */
      void clip.play().catch(() => undefined)
    }, typedAt + HOME_V4_FN_VIDEO.OUT_AFTER_TYPE_MS)

    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [active, promptText])

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title}>
      <div className="fn-video">
        <div className="bar">
          <span className="t">{t('v4.fn.video.workbench')}</span>
          <span className="p">{t('v4.fn.video.meta')}</span>
        </div>

        <div className="vrow">
          <div className="ibox">
            {HOME_V4_FN_VIDEO_REFS.map((reference, index) => (
              <div
                className={`iline${index < beats.pills ? ' in' : ''}`}
                key={reference.id}
              >
                <span className="pill">
                  {reference.thumb ? (
                    <Image
                      src={reference.thumb}
                      alt=""
                      width={HOME_V4_FN_VIDEO.THUMB_PX}
                      height={HOME_V4_FN_VIDEO.THUMB_PX}
                    />
                  ) : (
                    <i className="ai">{reference.glyph}</i>
                  )}
                  <b>
                    {reference.thumb && reference.glyph
                      ? `${reference.glyph} ${t(`v4.fn.video.refs.${reference.id}.label`)}`
                      : t(`v4.fn.video.refs.${reference.id}.label`)}
                  </b>
                </span>
                <span className="say">
                  {t(`v4.fn.video.refs.${reference.id}.say`)}
                </span>
              </div>
            ))}

            <div className={`iline ptxt${beats.prompt ? ' in' : ''}`}>
              <span className="tw">{typed}</span>
              <span className="cur3" />
            </div>

            <div className="itools">
              {HOME_V4_FN_VIDEO_TOOLS.map((glyph) => (
                <span className="ic" key={glyph}>
                  {glyph}
                </span>
              ))}
              <span className="meta">{t('v4.fn.video.toolsMeta')}</span>
              {/* A picture of the send key, not a control. */}
              <button
                type="button"
                className={`up${beats.send ? ' on' : ''}`}
                aria-label={t('v4.fn.video.submit')}
              >
                {HOME_V4_GLYPHS.send}
              </button>
            </div>
          </div>

          <div className={`out${beats.out ? ' in' : ''}`}>
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              preload="metadata"
              poster={HOME_V4_STORY.poster}
              src={HOME_V4_STORY.clip}
            />
            <span className="src2">{t('v4.fn.video.outTag')}</span>
          </div>
        </div>
      </div>
    </HomeV4FnFrame>
  )
}

'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_FN_VIDEO,
  HOME_V4_FN_VIDEO_REFS,
  HOME_V4_FN_VIDEO_TOOLS,
  HOME_V4_GLYPHS,
  HOME_V4_STORY,
} from '@/constants/homepage-v4'
import { homeV4VideoBeats } from '@/lib/home-v4-beats'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnVideoProps {
  /** 段内滚动进度 0–1。0 = 空输入框，1 = 成片 + CTA。 */
  progress: number
  /**
   * 这一段还在视口里。进度管画什么，这个只管**播放**：滚出视口就暂停，不让一段
   * 看不见的视频在背后解码。
   */
  active: boolean
  eyebrow: string
  title: string
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
 *
 * v5 长卷：胶囊、brief、发送键与成片全部由 `homeV4VideoBeats(progress)` 求值。
 */
export function HomeV4FnVideo({
  progress,
  active,
  eyebrow,
  title,
}: HomeV4FnVideoProps) {
  const t = useTranslations('Homepage')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const promptText = t('v4.fn.video.prompt')
  const chars = useMemo(() => Array.from(promptText), [promptText])
  const beats = homeV4VideoBeats(progress)
  const typed = chars.slice(0, Math.round(beats.typed * chars.length)).join('')
  const playing = active && beats.out

  /**
   * The cut plays while the段 is on screen and the progress has reached it, and
   * is paused otherwise. ⚠ Not `autoPlay`: a段 the visitor scrolls past at speed
   * must not leave a decoder running behind the next one.
   */
  useEffect(() => {
    const clip = videoRef.current
    if (!clip) return
    if (playing) {
      /* Autoplay can be refused (a data-saver profile, a paused-media setting).
         The poster is the fallback, so a refusal is not an error. */
      void clip.play().catch(() => undefined)
      return
    }
    clip.pause()
  }, [playing])

  return (
    <HomeV4FnFrame id="video" eyebrow={eyebrow} title={title} ctaOn={beats.cta}>
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

            <div className={`iline ptxt${beats.typed > 0 ? ' in' : ''}`}>
              <span className="tw">{typed}</span>
              {beats.typed < 1 ? <span className="cur3" /> : null}
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

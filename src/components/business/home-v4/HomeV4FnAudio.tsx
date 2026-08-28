'use client'

import { useEffect, useState, type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_AUDIO,
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_GLYPHS,
} from '@/constants/homepage-v4'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnAudioProps {
  /** True while this is the page on screen. Drives play / reset. */
  active: boolean
  eyebrow: string
  title: string
}

/** How many bubbles have landed, and how many have played their waveform. */
interface AudioBeats {
  arrived: number
  played: number
}

const AT_REST: AudioBeats = { arrived: 0, played: 0 }

/**
 * 功能页 03 · 声音 — the dubbing room.
 *
 * Three lines arrive as chat messages, each with a voice note whose bars grow a
 * beat after the bubble settles (the growth is a per-bar CSS delay off `--i`,
 * so the waveform draws itself left to right for free). Two library voices and
 * one cloned voice, which is the page's whole argument.
 *
 * A chat column is already the mobile shape, so this page only trims type
 * sizes below 768px rather than re-laying anything out.
 */
export function HomeV4FnAudio({ active, eyebrow, title }: HomeV4FnAudioProps) {
  const t = useTranslations('Homepage')
  const [beats, setBeats] = useState<AudioBeats>(AT_REST)

  useEffect(() => {
    if (!active) {
      /* Rewind only once the page has slid away — see `HomeV4Opening`. */
      const rewind = window.setTimeout(
        () => setBeats(AT_REST),
        HOME_V4_ENGINE.PAGE_MS,
      )
      return () => window.clearTimeout(rewind)
    }

    const timers: number[] = []
    const at = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, HOME_V4_FN_AUDIO.ENTER_DELAY_MS + ms))
    }

    HOME_V4_FN_AUDIO_LINES.forEach((_, index) => {
      const landsAt =
        HOME_V4_FN_AUDIO.MSG_START_MS + index * HOME_V4_FN_AUDIO.MSG_STEP_MS
      at(
        () => setBeats((current) => ({ ...current, arrived: index + 1 })),
        landsAt,
      )
      at(
        () => setBeats((current) => ({ ...current, played: index + 1 })),
        landsAt + HOME_V4_FN_AUDIO.PLAY_DELAY_MS,
      )
    })

    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [active])

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title}>
      <div className="fn-audio">
        <div className="bar">
          <span className="t">{t('v4.fn.audio.room')}</span>
          <span className="p">{t('v4.fn.audio.meta')}</span>
        </div>

        <div className="flow">
          {HOME_V4_FN_AUDIO_LINES.map((line, index) => {
            const classes = [
              'msg',
              line.mine ? 'me' : '',
              index < beats.arrived ? 'in' : '',
              index < beats.played ? 'played' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div className={classes} key={line.id}>
                <span className="ava" data-voice={line.id}>
                  {t(`v4.fn.audio.lines.${line.id}.avatar`)}
                </span>
                <span className="grp">
                  <span className="who">
                    {t(`v4.fn.audio.lines.${line.id}.who`)}
                  </span>
                  <span className="bub">
                    {t(`v4.fn.audio.lines.${line.id}.text`)}
                  </span>
                  <span className="voice">
                    <span className="play">{HOME_V4_GLYPHS.play}</span>
                    <span className="wv">
                      {line.wave.map((height, bar) => (
                        <i
                          key={bar}
                          style={{ '--i': bar, '--h': height } as CSSProperties}
                        />
                      ))}
                    </span>
                    <span className="dur">
                      {t(`v4.fn.audio.lines.${line.id}.duration`)}
                    </span>
                  </span>
                </span>
              </div>
            )
          })}
        </div>

        <div className="inrow">
          <span className="picks">
            {HOME_V4_FN_AUDIO_LINES.map((line, index) => (
              <span
                className={`pick${index === 0 ? ' on' : ''}`}
                data-voice={line.id}
                key={line.id}
              >
                {t(`v4.fn.audio.lines.${line.id}.avatar`)}
              </span>
            ))}
            <span className="pick add" title={t('v4.fn.audio.addVoice')}>
              {HOME_V4_GLYPHS.plus}
            </span>
          </span>
          <span className="tx">{t('v4.fn.audio.placeholder')}</span>
          <span className="cur2" />
          {/* A picture of the button, not a control — nothing to submit. */}
          <button type="button" className="go">
            {t('v4.fn.audio.generate')}
          </button>
        </div>
      </div>
    </HomeV4FnFrame>
  )
}

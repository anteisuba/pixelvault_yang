'use client'

import { useEffect, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_IMAGE,
  HOME_V4_FN_IMAGE_MODELS,
  HOME_V4_GLYPHS,
  HOME_V4_STATIONS,
} from '@/constants/homepage-v4'
import { useHomeV4Typewriter } from '@/hooks/use-home-v4-typewriter'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnImageProps {
  /** True while this is the page on screen. Drives play / reset. */
  active: boolean
  eyebrow: string
  title: string
  /** Open the image station at this model. Wired to the chips under the window. */
  onOpenModel: (index: number) => void
}

/** `''` → `'typed'` → `'reveal'`; the class string is cumulative. */
type Beat = 'idle' | 'typed' | 'reveal'

const BEAT_CLASS: Record<Beat, string> = {
  idle: '',
  typed: ' typed',
  reveal: ' typed reveal',
}

/**
 * 功能页 01 · 图片 — the image workbench, played out.
 *
 * One prompt is typed into a bar that already has four models switched on, the
 * generate button lights the moment the line is finished, and the four results
 * stagger in. The four tiles are deliberately 「待生成」 placeholders: the shots
 * have to be generated in-app before this page can show real output, and a
 * stand-in that admits it is a stand-in beats four pretty stock images.
 *
 * Everything after the typing is chained off `promptText.length` rather than a
 * fixed offset — see `useHomeV4Typewriter`.
 */
export function HomeV4FnImage({
  active,
  eyebrow,
  title,
  onOpenModel,
}: HomeV4FnImageProps) {
  const t = useTranslations('Homepage')
  const models = HOME_V4_STATIONS.image

  const promptText = t('v4.fn.image.prompt')
  const typed = useHomeV4Typewriter({
    text: promptText,
    stepMs: HOME_V4_FN_IMAGE.TYPE_MS,
    delayMs: HOME_V4_FN_IMAGE.ENTER_DELAY_MS,
    active,
    resetMs: HOME_V4_ENGINE.PAGE_MS,
  })

  const [beat, setBeat] = useState<Beat>('idle')

  useEffect(() => {
    if (!active) {
      /* Rewind once the page has finished sliding away — resetting on the spot
         would play the whole performance backwards in full view. */
      const rewind = window.setTimeout(
        () => setBeat('idle'),
        HOME_V4_ENGINE.PAGE_MS,
      )
      return () => window.clearTimeout(rewind)
    }

    const typedAt =
      HOME_V4_FN_IMAGE.ENTER_DELAY_MS +
      promptText.length * HOME_V4_FN_IMAGE.TYPE_MS
    const timers = [
      window.setTimeout(() => setBeat('typed'), typedAt),
      window.setTimeout(
        () => setBeat('reveal'),
        typedAt + HOME_V4_FN_IMAGE.REVEAL_MS,
      ),
    ]

    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [active, promptText])

  return (
    <HomeV4FnFrame eyebrow={eyebrow} title={title} column>
      <div className={`fn-studio${BEAT_CLASS[beat]}`}>
        <div className="bar">
          <span className="t">{t('v4.fn.image.workbench')}</span>
          {HOME_V4_FN_IMAGE_MODELS.map((name) => (
            <span className="mchip on" key={name}>
              {name}
            </span>
          ))}
          <span className="p">{t('v4.fn.image.meta')}</span>
        </div>

        <div className="prow">
          <span className="txt">{typed}</span>
          <span className="cur" />
          {/* A picture of the button, not a control — it has nothing to submit. */}
          <button type="button" className="go">
            {t('v4.fn.image.generate')}
          </button>
        </div>

        {/* The stagger between tiles lives in `home-v4.css` as `nth-child`
            delays, so these must stay direct children. */}
        <div className="fn-quad">
          {HOME_V4_FN_IMAGE_MODELS.map((name) => (
            <div className="fq" key={name}>
              <span className="want">
                <span className="k">{t('v4.fn.image.pendingKicker')}</span>
                <p>{t('v4.fn.image.pendingLine')}</p>
              </span>
              <span className="mtag">{name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* PC only — mobile hides the row and keeps the quad as the one focus. */}
      <div className="chips">
        <span className="hint">
          {t('v4.fn.image.moreModels', { count: models.length })}{' '}
          {HOME_V4_GLYPHS.arrow}
        </span>
        {models.map((model, index) => (
          <button
            type="button"
            key={model.key}
            onClick={() => onOpenModel(index)}
          >
            {model.name}
          </button>
        ))}
      </div>
    </HomeV4FnFrame>
  )
}

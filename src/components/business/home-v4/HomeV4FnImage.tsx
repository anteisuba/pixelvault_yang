'use client'

import Image from 'next/image'
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
 * The bar across the top has four models switched on; under it the window is
 * split left/right — the prompt is typed on the left, and the answers come back
 * on the right, one after another, into a 2×2 that starts out **empty**.
 *
 * ⚠ Empty means empty: before `reveal` the right half draws nothing at all — no
 * frames, no placeholder cards. What it does keep is its *size*, which is why
 * the tiles are still in the DOM with their `aspect-ratio` and only their paint
 * is withheld; a right half that grew when the pictures arrived would shove the
 * whole window down at the moment the page is asking to be looked at. (An
 * earlier cut did the opposite — four visible 「待生成」 slots standing through
 * the typing — and that copy is gone, keys and all.)
 *
 * The four shots are four in-app results of this very prompt, one per model,
 * carried on `HOME_V4_FN_IMAGE_MODELS` so the name and the picture can never
 * drift apart.
 *
 * Same shape as 功能页 04 (`.bar` over `.vrow` → `.ibox` / results), because
 * they are the same claim: what you put in on the left, what came back on the
 * right.
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
          {HOME_V4_FN_IMAGE_MODELS.map((model) => (
            <span className="mchip on" key={model.name}>
              {model.name}
            </span>
          ))}
          <span className="p">{t('v4.fn.image.meta')}</span>
        </div>

        <div className="vrow">
          <div className="ibox">
            <p className="ptxt">
              <span className="txt">{typed}</span>
              <span className="cur" />
            </p>
            {/* A picture of the button, not a control — it has nothing to submit. */}
            <button type="button" className="go">
              {t('v4.fn.image.generate')}
            </button>
          </div>

          {/* The stagger between tiles lives in `home-v4.css` as `nth-child`
              delays, so these must stay direct children. */}
          <div className="fn-quad">
            {HOME_V4_FN_IMAGE_MODELS.map((model) => (
              <div className="fq" key={model.name}>
                {/* The prompt is the description of the picture, in the reader's
                    own language, so the model name in front of it is the whole
                    alt this needs. */}
                <Image
                  src={model.shot}
                  alt={`${model.name} · ${promptText}`}
                  fill
                  sizes="(max-width: 768px) 44vw, 250px"
                />
                <span className="mtag">{model.name}</span>
              </div>
            ))}
          </div>
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

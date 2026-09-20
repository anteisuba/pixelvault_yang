'use client'

import Image from 'next/image'
import { useMemo } from 'react'

import { useTranslations } from 'next-intl'

import {
  HOME_V4_FN_IMAGE_MODELS,
  HOME_V4_GLYPHS,
  HOME_V4_STATIONS,
} from '@/constants/homepage-v4'
import { homeV4ImageBeats } from '@/lib/home-v4-beats'

import { HomeV4FnFrame } from './HomeV4FnFrame'

interface HomeV4FnImageProps {
  /** 段内滚动进度 0–1。0 = 空态，1 = 结果态 + CTA。 */
  progress: number
  eyebrow: string
  title: string
  /** Open the image models at this entry. Wired to the chips under the window. */
  onOpenModel: (index: number) => void
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
 * v5 长卷：这一段是**按进度求值的状态机**，不是时间线。打字、四格、CTA 全部由
 * `homeV4ImageBeats(progress)` 给出，所以往回滚就真的往回演；元素一律预渲染，
 * 只揭 `opacity` / `transform`。
 */
export function HomeV4FnImage({
  progress,
  eyebrow,
  title,
  onOpenModel,
}: HomeV4FnImageProps) {
  const t = useTranslations('Homepage')
  const models = HOME_V4_STATIONS.image

  const promptText = t('v4.fn.image.prompt')
  /* ⚠ `Array.from`, not `slice` on the string: a CJK line is fine either way,
     but an emoji or a combining mark would be cut in half mid-codepoint. */
  const chars = useMemo(() => Array.from(promptText), [promptText])
  const beats = homeV4ImageBeats(progress)
  const typed = chars.slice(0, Math.round(beats.typed * chars.length)).join('')

  /* PC only — mobile hides the row and keeps the quad as the one focus. In the
     rail it sits under the title; otherwise under the window. */
  const chips = (
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
  )

  return (
    <HomeV4FnFrame
      id="image"
      eyebrow={eyebrow}
      title={title}
      rail
      aside={chips}
      ctaOn={beats.cta}
    >
      <div className={`fn-studio${beats.typed >= 1 ? ' typed' : ''}`}>
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
              {/* 光标只在还在写的时候闪——写完了还留着，读起来像卡住了。 */}
              {beats.typed < 1 ? <span className="cur" /> : null}
            </p>
            {/* A picture of the button, not a control — it has nothing to submit. */}
            <button type="button" className="go">
              {t('v4.fn.image.generate')}
            </button>
          </div>

          {/* The stagger between tiles lives in `home-v4.css` as `nth-child`
              delays, so these must stay direct children. */}
          <div className="fn-quad">
            {HOME_V4_FN_IMAGE_MODELS.map((model, index) => (
              <div
                className={`fq${index < beats.tiles ? ' in' : ''}`}
                key={model.name}
              >
                {/* The prompt is the description of the picture, in the reader's
                    own language, so the model name in front of it is the whole
                    alt this needs. */}
                <Image
                  src={model.shot}
                  alt={`${model.name} · ${promptText}`}
                  fill
                  sizes="(max-width: 768px) 44vw, 290px"
                />
                <span className="mtag">{model.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </HomeV4FnFrame>
  )
}

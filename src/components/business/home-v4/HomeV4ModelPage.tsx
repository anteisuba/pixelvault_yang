import { useEffect, useRef } from 'react'

import { useTranslations } from 'next-intl'

import { HOME_V4_MODEL_FACETS, type HomeV4Model } from '@/constants/homepage-v4'

import { HomeV4ModelLogo } from './HomeV4ModelLogo'
import { HomeV4ModelStrip } from './HomeV4ModelStrip'

interface HomeV4ModelPageProps {
  model: HomeV4Model
  /**
   * True only for the one model page currently on screen. Every page in a
   * station stays mounted, so without this all four video clips would play at
   * once — the deck already computes it for `inert`, this reuses that.
   */
  active: boolean
  /**
   * ⭐ This page is the live one or one step from it — the gate on whether its
   * shot is fetched at all.
   *
   * All twenty-five model pages are mounted from first paint, and a plain
   * `<img src>` is eager, so without this the opening page pulls **every**
   * model shot before the visitor has scrolled once. That was ~16 MB after the
   * covers were re-made at full quality (owner 2026-08-30: 背景素材不压清晰度)
   * — and the answer to that is not to compress them again, it is to not fetch
   * what nobody is looking at. Same trade the video makes with `preload="none"`.
   *
   * ⚠ One step, not zero: paging to the next model must not flash an empty
   * frame, so the neighbours are warmed. `loading="lazy"` cannot do this job —
   * the deck moves pages with transforms, not scroll, so the browser's own
   * viewport heuristic sees them all as on-screen.
   */
  near: boolean
  /** Open the mobile detail sheet for this model. */
  onOpenDetail: () => void
}

/**
 * One model page — the whole model region is this component, twenty-five times.
 *
 * Three backgrounds, one identity board, one strip:
 *
 * - **cover** — the shot bled over the page under a scrim that only presses the
 *   left and bottom edges, where the glass sits. The shots were made 16:9 with
 *   the subject held right, so `object-fit: cover` never eats the subject.
 * - **side** — a portrait shot stood upright on the right, whole and uncropped,
 *   over paper. Used by the LoRA station, whose covers are all portraits.
 * - **wall** — three portraits abreast. Mobile drops to the first one (CSS).
 *
 * A model with no shot yet gets neither: paper plus a dashed card printing the
 * prompt that will generate it, so the page says what it is missing instead of
 * pretending. That prompt is deliberately **not** translated — it is a task for
 * a model, not a sentence for a reader.
 *
 * A model page has no timeline of its own — it is a poster, not a performance.
 * It still takes `active` / `near`, and neither is choreography: they are the
 * two fetch gates. Twenty-five pages are mounted at once, so without them the
 * opening screen would pull every shot and play four videos behind it.
 */
export function HomeV4ModelPage({
  model,
  active,
  near,
  onOpenDetail,
}: HomeV4ModelPageProps) {
  const t = useTranslations('Homepage')
  const base = `v4.models.${model.key}`
  const alt = t('v4.modelPage.coverAlt', { model: model.name })
  const clipRef = useRef<HTMLVideoElement | null>(null)

  /**
   * ⚠ The clip is tied to `active`, not mounted-ness. `preload="none"` means
   * nothing is fetched until this fires, so a station the visitor never opens
   * costs nothing — and stepping to the next model stops the previous one
   * rather than leaving four videos decoding behind the one on screen.
   */
  useEffect(() => {
    const clip = clipRef.current
    if (clip === null) return

    if (!active) {
      clip.pause()
      clip.currentTime = 0
      return
    }

    /* A refusal is not an error — the poster is already the fallback. */
    void clip.play().catch(() => undefined)
  }, [active])

  /**
   * ⚠ Plain `<img>`, not `next/image`. All three layouts drive `position`,
   * `object-fit` and `object-position` from the stylesheet, and `next/image`'s
   * `fill` mode writes `position:absolute; inset:0; width:100%; height:100%` as
   * *inline* style — no rule in `home-v4.css` can beat that, so `side` would
   * stop standing on the right and `wall` would stop being three panels. The
   * usual reason to pay that cost does not apply either: `images.unoptimized`
   * is on project-wide, so `next/image` here optimizes nothing.
   */
  const background = () => {
    if (model.cover === null) {
      return (
        <div className="m-bg plain l1">
          {model.wantPrompt === null ? null : (
            <div className="want">
              <span className="k">{t('v4.modelPage.want')}</span>
              <p lang="zh">{model.wantPrompt}</p>
            </div>
          )}
        </div>
      )
    }

    if (model.layout === 'wall') {
      return (
        <div className="m-bg wall l1">
          {[model.cover, ...model.wall].map((src) => (
            // eslint-disable-next-line @next/next/no-img-element -- see the note above `background`.
            <img key={src} src={near ? src : undefined} alt={alt} />
          ))}
          <span className="veil2" />
          <span className="src">{t(`${base}.src`)}</span>
        </div>
      )
    }

    const side = model.layout === 'side'
    return (
      <div className={side ? 'm-bg side l1' : 'm-bg l1'}>
        {model.clip === null || side ? (
          // eslint-disable-next-line @next/next/no-img-element -- see above
          <img src={near ? model.cover : undefined} alt={alt} />
        ) : (
          /* A video model's page shows the video. `poster` is the same still the
             other pages use, so the page is never blank while the clip loads —
             and it is also the fallback if `play()` is refused. */
          <video
            ref={clipRef}
            muted
            loop
            playsInline
            preload="none"
            poster={near ? model.cover : undefined}
            src={model.clip}
            aria-label={alt}
          />
        )}
        {/* A portrait over paper needs no scrim; a full bleed does. */}
        {side ? null : <span className="veil" />}
        <span className="src">{t(`${base}.src`)}</span>
      </div>
    )
  }

  return (
    <div className="page-inner mpage">
      {background()}

      <div className="m-glass l2">
        <div className="toprow">
          <HomeV4ModelLogo logo={model.logo} mark={model.mark} />
          <span className="prov">{model.provider}</span>
        </div>

        <h2>{model.name}</h2>
        <p className="pos">{t(`${base}.pos`)}</p>

        <div className="m-tags">
          {Array.from({ length: HOME_V4_MODEL_FACETS.TAGS }, (_, index) => (
            <i key={index}>{t(`${base}.tags.${index}`)}</i>
          ))}
        </div>

        <div className="meta">
          <span className="fare">
            <b>{t(`${base}.fare`)}</b>
          </span>
          <span className="routes">{t(`${base}.routes`)}</span>
        </div>

        {/* Mobile only (`display:none` above 768px) — on desktop the strip is
            already on screen, so this would open a sheet onto what is visible. */}
        <button type="button" className="m-more" onClick={onOpenDetail}>
          {t('v4.modelPage.more')}
        </button>
      </div>

      <HomeV4ModelStrip model={model} />
    </div>
  )
}

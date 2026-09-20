import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_ALL_MODELS,
  HOME_V4_MODEL_FACETS,
  type HomeV4Model,
} from '@/constants/homepage-v4'

import { HomeV4ModelPage } from './HomeV4ModelPage'

vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate }
})

const model = (key: string): HomeV4Model => {
  const found = HOME_V4_ALL_MODELS.find((entry) => entry.key === key)
  if (!found) throw new Error(`no model ${key}`)
  return found
}

const renderModel = (key: string, near = true) =>
  render(
    <HomeV4ModelPage
      model={model(key)}
      active
      near={near}
      onOpenDetail={() => undefined}
    />,
  )

/**
 * One template, twenty-five records, four background states. jsdom has no
 * layout, so nothing here measures anything — what is pinned is which branch a
 * record takes, because that is the part a data edit can silently flip.
 */
describe('HomeV4ModelPage', () => {
  beforeEach(() => {
    /* The four video-model pages hold a `<video>` and play it while they are
       the live page; jsdom implements neither method — and its `play()` returns
       `undefined` rather than a promise, so an unmocked run dies on `.catch`
       rather than merely logging. Same shim as `HomeV4Deck.test.tsx`. */
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    )
  })

  it('renders every model without throwing, each with a full strip', () => {
    for (const entry of HOME_V4_ALL_MODELS) {
      const { container, unmount } = renderModel(entry.key)

      expect(container.querySelectorAll('.m-glass')).toHaveLength(1)
      /* Two blocks, not three — 站内规格 was retired 2026-08-28. A stray `dl`
         would mean the spec column came back with it. */
      expect(container.querySelectorAll('.m-strip .pm')).toHaveLength(2)
      expect(container.querySelectorAll('.m-strip dl')).toHaveLength(0)
      expect(container.querySelectorAll('.m-strip .pm ul li')).toHaveLength(
        HOME_V4_MODEL_FACETS.PLUS + HOME_V4_MODEL_FACETS.MINUS,
      )
      expect(container.querySelectorAll('.m-tags i')).toHaveLength(
        HOME_V4_MODEL_FACETS.TAGS,
      )

      unmount()
    }
  })

  it('bleeds one shot with a scrim for a cover page', () => {
    const { container } = renderModel('gpt')
    const background = container.querySelector('.m-bg')

    expect(background?.className).toBe('m-bg l1')
    expect(container.querySelectorAll('.m-bg img')).toHaveLength(1)
    expect(container.querySelector('.m-bg .veil')).not.toBeNull()
    expect(container.querySelector('.m-bg .src')).not.toBeNull()
  })

  /* A portrait stood on paper needs no scrim — the glass sits on white. */
  it('stands the shot on the side, unscrimmed, for a side page', () => {
    const { container } = renderModel('wai')

    expect(container.querySelector('.m-bg')?.className).toBe('m-bg side l1')
    expect(container.querySelectorAll('.m-bg img')).toHaveLength(1)
    expect(container.querySelector('.m-bg .veil')).toBeNull()
  })

  it('hangs three panels for a wall page', () => {
    const { container } = renderModel('novelai')

    expect(container.querySelector('.m-bg')?.className).toBe('m-bg wall l1')
    expect(container.querySelectorAll('.m-bg img')).toHaveLength(3)
    expect(container.querySelector('.m-bg .veil2')).not.toBeNull()
  })

  /**
   * ⭐ A video model's page plays the clip rather than showing a still of it,
   * and the still becomes the `poster` — so nothing is blank while it loads and
   * the page still reads if `play()` is refused.
   *
   * ⚠ `preload="none"` is the whole weight story: the clips are the **source
   * files, not re-encoded** (owner 2026-08-30: 背景素材不压清晰度), so a station
   * the visitor never opens must fetch none of them. If this attribute ever
   * drops, every model page starts pulling megabytes on first paint.
   */
  it('plays the clip, postered by the still, on a video model page', () => {
    const { container } = renderModel('seedance')
    const clip = container.querySelector('.m-bg video')

    expect(clip).not.toBeNull()
    expect(container.querySelector('.m-bg img')).toBeNull()
    expect(clip?.getAttribute('preload')).toBe('none')
    expect(clip?.getAttribute('poster')).toBe(model('seedance').cover)
    expect(clip?.getAttribute('src')).toBe(model('seedance').clip)
    /* Muted is what makes autoplay legal at all; loop keeps a 3-second clip
       from freezing on its last frame under the identity board. */
    expect((clip as HTMLVideoElement).muted).toBe(true)
    expect(clip?.hasAttribute('loop')).toBe(true)
  })

  /* A clip only makes sense full-bleed: a `side` portrait and a `wall`
     triptych have nowhere to put one, so they stay images even if one exists. */
  it('leaves every non-cover layout on a still', () => {
    for (const entry of HOME_V4_ALL_MODELS) {
      if (entry.layout === 'cover') continue
      expect(entry.clip).toBeNull()
    }
  })

  /**
   * ⭐⭐ The far pages carry **no `src` at all**, in any of the three layouts.
   *
   * This is the only thing standing between the opening screen and ~16 MB of
   * model shots: twenty-five pages are mounted from first paint and a plain
   * `<img src>` is eager, so a missing gate here does not fail visibly — it
   * just makes the homepage quietly pull every cover before the visitor has
   * scrolled once. The covers are full-quality on purpose (owner 2026-08-30:
   * 背景素材不压清晰度), so the weight has nowhere else to go.
   *
   * ⚠ The element still renders — it holds the layout and keeps the other
   * assertions in this file honest. What is gated is the fetch.
   */
  it('fetches nothing for a page that is not near', () => {
    for (const key of ['gpt', 'wai', 'novelai', 'seedance']) {
      const { container, unmount } = renderModel(key, false)

      for (const shot of container.querySelectorAll('.m-bg img')) {
        expect(shot.getAttribute('src')).toBeNull()
      }
      /* A video's poster is a fetch too — gate it or the four video pages
         still pull four full-resolution stills from the opening screen. */
      const clip = container.querySelector('.m-bg video')
      if (clip) expect(clip.getAttribute('poster')).toBeNull()

      unmount()
    }
  })

  /**
   * ⭐ The page with no shot says so, and prints the prompt that will make it.
   * The prompt stays in Chinese in every locale — it is a task addressed to a
   * model, not a sentence addressed to a reader — so it comes from the constant
   * and never from the message files.
   *
   * ⚠ The record is **synthetic on purpose**. This used to render `wan30`,
   * which was the catalogue's live `cover: null` case; on 2026-08-29 the last
   * three empty covers were filled in and the assertion lost its subject with
   * no replacement — every model now has a shot. What is pinned here is which
   * branch the template takes, not what any one model's data happens to say,
   * so tying it to a live record only meant a design edit could redden a UI
   * test. The `cover: null ⟺ wantPrompt !== null` pairing across the real
   * catalogue is held by `home-v4.test.ts` instead, and it still holds
   * vacuously at zero.
   */
  it('shows the prompt card, in the original Chinese, when there is no shot', () => {
    const wantPrompt = '代表帧：茶馆窗外雨景，水汽氤氲，缓慢横摇，16:9'
    const pending: HomeV4Model = {
      ...model('wan30'),
      cover: null,
      wall: [],
      wantPrompt,
    }
    const { container } = render(
      <HomeV4ModelPage
        model={pending}
        active
        near
        onOpenDetail={() => undefined}
      />,
    )
    const card = container.querySelector('.m-bg.plain .want')

    expect(card).not.toBeNull()
    expect(card?.querySelector('p')?.textContent).toBe(wantPrompt)
    expect(container.querySelector('.m-bg img')).toBeNull()
    /* No shot means no provenance to claim. */
    expect(container.querySelector('.m-bg .src')).toBeNull()
  })

  it('draws a mark for the three brands that have one and types the rest', () => {
    expect(
      renderModel('gpt').container.querySelectorAll('.lg svg'),
    ).toHaveLength(1)
    expect(
      renderModel('seedream').container.querySelectorAll('.lg.seedmark b'),
    ).toHaveLength(1)
    expect(
      renderModel('flux').container.querySelector('.lg.textmark')?.textContent,
    ).toBe(model('flux').mark)
  })
})

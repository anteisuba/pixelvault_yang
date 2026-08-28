import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_PAGES,
  HOME_V4_STATIONS,
} from '@/constants/homepage-v4'

import { HomeV4Deck } from './HomeV4Deck'

/* The topbar is the only thing under the deck that reaches for Clerk and the
   auth dialog context; the engine has nothing to do with either. */
vi.mock('./HomeV4Topbar', () => ({
  HomeV4Topbar: () => null,
}))

/* `.rich` is part of the surface too — feature page 02 prints its mount counter
   through it, and a translator without it throws on render. */
vi.mock('next-intl', () => {
  const translate = Object.assign((key: string) => key, {
    rich: (key: string) => key,
  })
  return { useTranslations: () => translate }
})

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const IMAGE_STATION_INDEX = HOME_V4_PAGES.findIndex(
  (page) => page.station === 'image',
)

function renderDeck() {
  return render(<HomeV4Deck locale="zh" />)
}

/** Long enough for any feature page's timeline to finish. */
const PERFORMANCE_MS = 12_000

/** Let the input lock expire so the next gesture is accepted. */
function unlock() {
  act(() => {
    vi.advanceTimersByTime(HOME_V4_ENGINE.LOCK_MS + 50)
  })
}

const pageAt = (container: HTMLElement, index: number) =>
  container.querySelectorAll('.vp')[index]

/**
 * Smoke coverage for the paging engine: enough to catch a deck that throws on
 * mount, a page that stops tracking the current index, a station that stops
 * swallowing the input, and a viewport lock that outlives the page.
 *
 * jsdom has no layout, so nothing here asserts geometry — `data-pos` is the
 * contract between this component and `home-v4.css`, and that is what is pinned.
 */
describe('HomeV4Deck', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    /* Two feature pages hold a `<video>` and stop it when they leave; jsdom
       implements neither method and logs a `jsdomError` for each call. */
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
      () => undefined,
    )
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('stacks every page with only the first one on screen', () => {
    const { container } = renderDeck()
    const pages = container.querySelectorAll('.vp')

    expect(pages).toHaveLength(HOME_V4_PAGES.length)
    expect(pages[0].getAttribute('data-pos')).toBe('on')
    expect(pages[0].hasAttribute('inert')).toBe(false)
    expect(pages[1].getAttribute('data-pos')).toBe('after')
    expect(pages[1].hasAttribute('inert')).toBe(true)
  })

  it('steps down on ArrowDown and leaves the page behind marked "before"', () => {
    const { container } = renderDeck()

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(pageAt(container, 0).getAttribute('data-pos')).toBe('before')
    expect(pageAt(container, 1).getAttribute('data-pos')).toBe('on')
  })

  it('ignores a second step while the slide is still in flight', () => {
    const { container } = renderDeck()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(pageAt(container, 1).getAttribute('data-pos')).toBe('on')

    unlock()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(pageAt(container, 2).getAttribute('data-pos')).toBe('on')
  })

  it('pages sideways through a station before releasing the deck downward', () => {
    const { container } = renderDeck()
    const models = HOME_V4_STATIONS.image

    /* Jump straight to the image station via its left-rail dot. */
    const dots = container.querySelectorAll('.dots button')
    act(() => {
      fireEvent.click(dots[IMAGE_STATION_INDEX])
    })
    expect(
      pageAt(container, IMAGE_STATION_INDEX).getAttribute('data-pos'),
    ).toBe('on')

    const stationPages = () =>
      pageAt(container, IMAGE_STATION_INDEX).querySelectorAll('.hpg')

    expect(stationPages()).toHaveLength(models.length)
    expect(stationPages()[0].getAttribute('data-pos')).toBe('on')

    /* Down inside a station moves the station, not the deck. */
    unlock()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(stationPages()[1].getAttribute('data-pos')).toBe('on')
    expect(
      pageAt(container, IMAGE_STATION_INDEX).getAttribute('data-pos'),
    ).toBe('on')

    /* ArrowRight is the same move. */
    unlock()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(stationPages()[2].getAttribute('data-pos')).toBe('on')

    /* Run the station out, then the next step finally goes down. */
    for (let i = 2; i < models.length - 1; i++) {
      unlock()
      fireEvent.keyDown(window, { key: 'ArrowDown' })
    }
    expect(stationPages()[models.length - 1].getAttribute('data-pos')).toBe(
      'on',
    )

    unlock()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(
      pageAt(container, IMAGE_STATION_INDEX + 1).getAttribute('data-pos'),
    ).toBe('on')
  })

  /**
   * ⭐ The performance is wired to `active`, which the deck computes from
   * `vIdx`. `HomeV4Fn.test.tsx` pins that each page replays when its own prop
   * is toggled; this pins that the deck actually toggles it — leave a feature
   * page, come back, and the whole thing has to run again.
   *
   * It drives the *real* feature components (only next-intl and next/image are
   * mocked), because the reported failure was in the seam between them.
   */
  it('replays a feature page every time the deck returns to it', () => {
    const { container } = renderDeck()
    const dots = container.querySelectorAll('.dots button')
    const audioIndex = HOME_V4_PAGES.findIndex((page) => page.id === 'audio')
    const bubbles = () => container.querySelectorAll('.fn-audio .msg.in').length

    const goTo = (index: number, settleMs: number) => {
      act(() => {
        fireEvent.click(dots[index])
      })
      act(() => {
        vi.advanceTimersByTime(settleMs)
      })
    }

    goTo(audioIndex, PERFORMANCE_MS)
    expect(pageAt(container, audioIndex).getAttribute('data-pos')).toBe('on')
    expect(bubbles()).toBe(HOME_V4_FN_AUDIO_LINES.length)

    /* Away long enough for the delayed rewind to land. */
    goTo(1, HOME_V4_ENGINE.PAGE_MS + 100)
    expect(bubbles()).toBe(0)

    goTo(audioIndex, PERFORMANCE_MS)
    expect(bubbles()).toBe(HOME_V4_FN_AUDIO_LINES.length)
  })

  /**
   * The lock is a deadline, not a flag a timer has to clear. This is the
   * behaviour that guarantees it: let the clock pass and input is accepted,
   * with nothing scheduled that could be starved into never running.
   */
  it('releases the input lock by the clock alone', () => {
    const { container } = renderDeck()

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(pageAt(container, 1).getAttribute('data-pos')).toBe('on')

    unlock()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(pageAt(container, 2).getAttribute('data-pos')).toBe('on')

    unlock()
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(pageAt(container, 1).getAttribute('data-pos')).toBe('on')
  })

  /**
   * ⭐ The mobile sheet is portalled into `<body>`, and the deck — not the model
   * page — owns whether it is open, because *any* move has to close it. A sheet
   * left standing after a page turn hangs over a page it does not describe.
   */
  describe('the model detail sheet', () => {
    /** Open the image station, then the sheet of whichever model is on screen. */
    const openSheet = (container: HTMLElement) => {
      act(() => {
        fireEvent.click(
          container.querySelectorAll('.dots button')[IMAGE_STATION_INDEX],
        )
      })
      const more = pageAt(container, IMAGE_STATION_INDEX).querySelector(
        '.hpg[data-pos="on"] .m-more',
      )
      act(() => {
        fireEvent.click(more as Element)
      })
    }

    const sheet = () => document.body.querySelector('.m-strip.as-sheet')

    it('opens from the model page and closes on the veil', () => {
      const { container } = renderDeck()
      expect(sheet()).toBeNull()

      openSheet(container)
      expect(sheet()).not.toBeNull()

      act(() => {
        fireEvent.click(document.body.querySelector('.msheet-veil') as Element)
      })
      expect(sheet()).toBeNull()
    })

    /* Gestures are blocked while it is open (below), so the moves that can still
       happen are the ones with a control: the left rail, the toc, the station's
       own arrows. Every one of them goes through `vGo` / `hGo`. */
    it('closes when a control turns the station or the page', () => {
      const { container } = renderDeck()

      openSheet(container)
      expect(sheet()).not.toBeNull()
      unlock()
      act(() => {
        fireEvent.click(
          pageAt(container, IMAGE_STATION_INDEX).querySelectorAll(
            '.hnav button',
          )[1],
        )
      })
      expect(sheet()).toBeNull()

      openSheet(container)
      expect(sheet()).not.toBeNull()
      unlock()
      act(() => {
        fireEvent.click(container.querySelectorAll('.dots button')[0])
      })
      expect(sheet()).toBeNull()
    })

    it('swallows the deck gestures while it is open', () => {
      const { container } = renderDeck()
      openSheet(container)

      unlock()
      fireEvent.keyDown(window, { key: 'ArrowDown' })

      /* Still on the station's first model: the sheet ate the step. */
      expect(
        pageAt(container, IMAGE_STATION_INDEX)
          .querySelectorAll('.hpg')[0]
          .getAttribute('data-pos'),
      ).toBe('on')
      expect(sheet()).not.toBeNull()

      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' })
      })
      expect(sheet()).toBeNull()
    })
  })

  it('holds the viewport lock only while it is mounted', () => {
    const { unmount } = renderDeck()

    expect(document.documentElement.classList.contains('home-v4-locked')).toBe(
      true,
    )
    expect(document.body.classList.contains('home-v4-locked')).toBe(true)

    unmount()

    expect(document.documentElement.classList.contains('home-v4-locked')).toBe(
      false,
    )
    expect(document.body.classList.contains('home-v4-locked')).toBe(false)
  })
})

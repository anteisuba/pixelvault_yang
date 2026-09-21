import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_PAGES,
  HOME_V4_STATION_KEYS,
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
  return { useTranslations: () => translate, useLocale: () => 'zh' }
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
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
    vi.unstubAllGlobals()
  })

  /**
   * ⭐ Owner 2026-09-20 reported the finale coming up blank with only the topbar
   * and the rail on it, and a rail click that did not move the deck. Neither
   * reproduces: the rail jumps to any page from any other in one step, across a
   * station and across ten pages, and the finale renders its own content when it
   * gets there. What owner saw was a dev-server refresh mid-revert, where the
   * finale's message keys were briefly absent. This pins the behaviour so the
   * next report has something to contradict.
   */
  it('jumps straight to the finale from the rail, from anywhere', () => {
    const { container } = renderDeck()
    const last = HOME_V4_PAGES.length - 1
    const dots = () => container.querySelectorAll('.dots button')

    fireEvent.click(dots()[last])
    expect(pageAt(container, last).getAttribute('data-pos')).toBe('on')
    expect(container.querySelector('.fin-hero')).not.toBeNull()

    /* Back to a station, then ten pages forward in one click — the jump is a
       set, not a walk, so neither the lock nor the one-page-at-a-time stepper
       may truncate it. */
    fireEvent.click(dots()[IMAGE_STATION_INDEX])
    expect(
      pageAt(container, IMAGE_STATION_INDEX).getAttribute('data-pos'),
    ).toBe('on')

    fireEvent.click(dots()[last])
    expect(pageAt(container, last).getAttribute('data-pos')).toBe('on')
    expect(container.querySelector('.fin-hero')).not.toBeNull()
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

  it('continues model browsing from an explicit selection', () => {
    const { container } = renderDeck()
    fireEvent.click(
      container.querySelectorAll('.dots button')[IMAGE_STATION_INDEX],
    )
    unlock()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(
      container.querySelector('[data-station="image"] .hpg[data-pos="on"]'),
    ).toBe(container.querySelectorAll('[data-station="image"] .hpg')[1])
    unlock()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(pageAt(container, IMAGE_STATION_INDEX)).toHaveAttribute(
      'data-pos',
      'on',
    )
    expect(
      container.querySelector('[data-station="image"] .hpg[data-pos="on"]'),
    ).toBe(container.querySelectorAll('[data-station="image"] .hpg')[2])
  })

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

  it.each(HOME_V4_STATION_KEYS)(
    'visits every model in %s before leaving the station',
    (stationKey) => {
      const { container } = renderDeck()
      const index = HOME_V4_PAGES.findIndex(
        (page) => page.station === stationKey,
      )
      fireEvent.click(container.querySelectorAll('.dots button')[index])
      const models = container.querySelectorAll(
        `[data-station="${stationKey}"] > .hpg`,
      )
      for (
        let model = 1;
        model < HOME_V4_STATIONS[stationKey].length;
        model++
      ) {
        unlock()
        fireEvent.wheel(window, { deltaY: 120 })
        expect(pageAt(container, index)).toHaveAttribute('data-pos', 'on')
        expect(models[model]).toHaveAttribute('data-pos', 'on')
      }
      unlock()
      fireEvent.wheel(window, { deltaY: 120 })
      expect(pageAt(container, index + 1)).toHaveAttribute('data-pos', 'on')
      unlock()
      fireEvent.wheel(window, { deltaY: -120 })
      expect(pageAt(container, index)).toHaveAttribute('data-pos', 'on')
      expect(models[models.length - 1]).toHaveAttribute('data-pos', 'on')
      unlock()
      fireEvent.wheel(window, { deltaY: -120 })
      expect(models[models.length - 2]).toHaveAttribute('data-pos', 'on')
      expect(container.querySelector('[data-parallax="scroll"]')).toBeNull()
    },
  )

  it('does not consume page navigation to advance the canvas demo', () => {
    const { container } = renderDeck()
    const index = HOME_V4_PAGES.findIndex((page) => page.id === 'canvas')
    fireEvent.click(container.querySelectorAll('.dots button')[index])
    unlock()
    fireEvent.wheel(window, { deltaY: 120 })
    expect(pageAt(container, index + 1)).toHaveAttribute('data-pos', 'on')
  })

  it('normalizes wheel line units and ignores horizontal gestures and zoom', () => {
    const { container } = renderDeck()
    fireEvent.wheel(window, { deltaX: 120, deltaY: 20 })
    fireEvent.wheel(window, { deltaY: 120, ctrlKey: true })
    expect(pageAt(container, 0)).toHaveAttribute('data-pos', 'on')
    fireEvent.wheel(window, { deltaY: 10, deltaMode: 1 })
    expect(pageAt(container, 1)).toHaveAttribute('data-pos', 'on')
  })
})

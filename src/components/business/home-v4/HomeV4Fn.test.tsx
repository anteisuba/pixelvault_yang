import { act, fireEvent, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOME_V4_ENGINE,
  HOME_V4_FN_AUDIO,
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_FN_CANVAS,
  HOME_V4_FN_CANVAS_SHOTS,
  HOME_V4_FN_LORA_MOUNTS,
  HOME_V4_FN_LORA_OUTS,
  HOME_V4_FN_VAULT,
  HOME_V4_FN_VAULT_CELLS,
  HOME_V4_FN_VIDEO_REFS,
  HOME_V4_STATIONS,
} from '@/constants/homepage-v4'

import { HomeV4FnAudio } from './HomeV4FnAudio'
import { HomeV4FnCanvas } from './HomeV4FnCanvas'
import { HomeV4FnImage } from './HomeV4FnImage'
import { HomeV4FnLora } from './HomeV4FnLora'
import { HomeV4FnVault } from './HomeV4FnVault'
import { HomeV4FnVideo } from './HomeV4FnVideo'

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

/** Long enough for every page's last beat plus its longest flight. */
const WHOLE_PERFORMANCE_MS = 12_000
const HEADER = { eyebrow: '01 · TEST', title: 'title' }

/**
 * Drives one feature page through the switch the deck actually flips: mounted
 * off-screen, played, then left.
 */
function stage(page: (active: boolean) => ReactElement) {
  const view = render(page(false))

  const advance = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  return {
    container: view.container,
    unmount: view.unmount,
    /** Turn the page on and run its timeline for `ms`. */
    play(ms: number = WHOLE_PERFORMANCE_MS) {
      view.rerender(page(true))
      advance(ms)
    },
    /** Turn it off and wait out the delayed rewind. */
    leave() {
      view.rerender(page(false))
      advance(HOME_V4_ENGINE.PAGE_MS + 100)
    },
    /** Flip `active` without moving the clock — for what must happen *now*. */
    rerender: (active: boolean) => view.rerender(page(active)),
    advance,
    count: (selector: string) =>
      view.container.querySelectorAll(selector).length,
    /**
     * Every element's class attribute, in document order. `getAttribute` and
     * not `className`, because on an SVG node the latter is an
     * `SVGAnimatedString` and would compare equal to nothing.
     */
    classes: () =>
      Array.from(
        view.container.querySelectorAll('*'),
        (element) => element.getAttribute('class') ?? '',
      ),
  }
}

/**
 * Smoke coverage for the six feature-page performances (P2).
 *
 * jsdom has no layout, so nothing here asserts geometry — every rect is zero,
 * which is exactly why the flight ghosts are only checked for existence and
 * cleanup. What *is* pinned is the contract with `home-v4.css`: which classes
 * are on at the end of the timeline, that leaving clears every one of them, and
 * that no page leaves a timer behind when it unmounts.
 */
describe.each([
  [
    'image',
    (active: boolean) => (
      <HomeV4FnImage
        {...HEADER}
        active={active}
        onOpenModel={() => undefined}
      />
    ),
  ],
  ['lora', (active: boolean) => <HomeV4FnLora {...HEADER} active={active} />],
  ['audio', (active: boolean) => <HomeV4FnAudio {...HEADER} active={active} />],
  ['video', (active: boolean) => <HomeV4FnVideo {...HEADER} active={active} />],
  [
    'canvas',
    (active: boolean) => <HomeV4FnCanvas {...HEADER} active={active} />,
  ],
  ['vault', (active: boolean) => <HomeV4FnVault {...HEADER} active={active} />],
] as const)('home v4 · feature page %s', (_name, page) => {
  beforeEach(() => {
    vi.useFakeTimers()
    /* jsdom implements neither, and `play()` returning undefined would make the
       `.catch()` in the page throw rather than swallow a refused autoplay. */
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

  it('renders the page header and stage before it is ever played', () => {
    const view = stage(page)

    expect(view.count('.page-inner')).toBe(1)
    expect(view.count('.fn-head.l2')).toBe(1)
    expect(view.count('.fn-stage.l3')).toBe(1)
    expect(view.count('.in')).toBe(0)
  })

  it('plays, then rewinds to exactly the state it started in', () => {
    const view = stage(page)
    const atRest = view.classes()

    view.play()
    expect(view.classes()).not.toEqual(atRest)

    view.leave()
    expect(view.classes()).toEqual(atRest)
    expect(view.count('.flyer')).toBe(0)

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  /**
   * ⭐ The regression P2 shipped with: leaving reset the page but coming back
   * never replayed it. Every beat is scheduled off `active` going true, so a
   * page that has been rewound has to run its whole timeline again — this is
   * the invariant, not "it plays the first time".
   */
  it('replays the whole performance on a second visit', () => {
    const view = stage(page)
    const atRest = view.classes()

    view.play()
    const played = view.classes()

    view.leave()
    expect(view.classes()).toEqual(atRest)

    view.play()
    expect(view.classes()).toEqual(played)
  })

  it('survives being toggled on and off mid-performance', () => {
    const view = stage(page)
    const atRest = view.classes()

    view.play(600)
    view.leave()
    view.play(600)
    view.leave()

    expect(view.classes()).toEqual(atRest)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('home v4 · feature page 01 图片', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('types the prompt, lights the button, then reveals four tiles', () => {
    const view = stage((active) => (
      <HomeV4FnImage
        {...HEADER}
        active={active}
        onOpenModel={() => undefined}
      />
    ))

    view.play()

    const studio = view.container.querySelector('.fn-studio')
    expect(studio?.className).toContain('typed')
    expect(studio?.className).toContain('reveal')
    expect(view.container.querySelector('.ptxt .txt')?.textContent).toBe(
      'v4.fn.image.prompt',
    )
    expect(view.count('.fn-quad .fq')).toBe(4)

    view.leave()
    expect(view.container.querySelector('.ptxt .txt')?.textContent).toBe('')
    expect(view.container.querySelector('.fn-studio')?.className).toBe(
      'fn-studio',
    )
  })

  it('offers one chip per image-station model and reports its index', () => {
    const onOpenModel = vi.fn()
    const view = stage((active) => (
      <HomeV4FnImage {...HEADER} active={active} onOpenModel={onOpenModel} />
    ))

    const chips = view.container.querySelectorAll('.chips button')
    expect(chips).toHaveLength(HOME_V4_STATIONS.image.length)

    fireEvent.click(chips[2])
    expect(onOpenModel).toHaveBeenCalledWith(2)
  })
})

describe('home v4 · feature page 02 LoRA', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('mounts all but one library card, then drops in the triggers that exist', () => {
    const view = stage((active) => <HomeV4FnLora {...HEADER} active={active} />)

    view.play()

    const mounts = HOME_V4_FN_LORA_MOUNTS.length
    expect(view.count('.lcard.hot')).toBe(mounts)
    /* One card is deliberately left in the library — and it is the one cut for
       a different base model, which is what「挂不上」 actually looks like. */
    expect(view.count('.lcard')).toBeGreaterThan(mounts)
    expect(view.count('.mrow.in')).toBe(mounts)
    /* ⚠ **Fewer chips than mounts, on purpose.** A slider LoRA and a detail
       LoRA have no trigger word; printing one for every mount would misstate
       how they are used. This asserts the gap is real rather than a dropped
       chip — if `trigger: null` ever silently starts rendering, this fails. */
    const triggered = HOME_V4_FN_LORA_MOUNTS.filter((m) => m.trigger).length
    expect(triggered).toBeLessThan(mounts)
    expect(view.count('.trig.in')).toBe(triggered)
    expect(view.count('.oq.in')).toBe(HOME_V4_FN_LORA_OUTS.length)

    view.leave()
    expect(view.count('.lcard.hot')).toBe(0)
    expect(view.count('.mrow.in')).toBe(0)
  })
})

describe('home v4 · feature page 03 声音', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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

  /** The three transport buttons, in message order. */
  const keys = (view: ReturnType<typeof stage>) =>
    Array.from(
      view.container.querySelectorAll<HTMLButtonElement>('.voice .play'),
    )

  const notes = (view: ReturnType<typeof stage>) =>
    Array.from(view.container.querySelectorAll<HTMLAudioElement>('audio'))

  it('lands each bubble before its waveform grows', () => {
    const view = stage((active) => (
      <HomeV4FnAudio {...HEADER} active={active} />
    ))

    /* Stop between the first bubble arriving and its voice note playing. */
    view.play(
      HOME_V4_FN_AUDIO.ENTER_DELAY_MS +
        HOME_V4_FN_AUDIO.MSG_START_MS +
        HOME_V4_FN_AUDIO.PLAY_DELAY_MS / 2,
    )
    expect(view.count('.msg.in')).toBe(1)
    expect(view.count('.msg.played')).toBe(0)

    view.advance(WHOLE_PERFORMANCE_MS)
    expect(view.count('.msg.in')).toBe(HOME_V4_FN_AUDIO_LINES.length)
    expect(view.count('.msg.played')).toBe(HOME_V4_FN_AUDIO_LINES.length)
  })

  /**
   * ⭐ The page's contract with the visitor: it is silent until asked. The
   * arrival choreography above runs on its own and must never touch `play()`
   * — a homepage that speaks at you is worse than one with a fake button.
   */
  it('never plays on its own, and downloads nothing until clicked', () => {
    const view = stage((active) => (
      <HomeV4FnAudio {...HEADER} active={active} />
    ))

    view.play()

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled()
    expect(notes(view)).toHaveLength(HOME_V4_FN_AUDIO_LINES.length)
    expect(notes(view).map((clip) => clip.getAttribute('preload'))).toEqual(
      notes(view).map(() => 'none'),
    )
    expect(notes(view).map((clip) => clip.getAttribute('src'))).toEqual(
      HOME_V4_FN_AUDIO_LINES.map((line) => line.clips.zh),
    )
  })

  it('gives every note a real, labelled, focusable key', () => {
    const view = stage((active) => (
      <HomeV4FnAudio {...HEADER} active={active} />
    ))
    view.play()

    expect(keys(view)).toHaveLength(HOME_V4_FN_AUDIO_LINES.length)
    keys(view).forEach((key, index) => {
      const line = HOME_V4_FN_AUDIO_LINES[index]
      expect(key.tagName).toBe('BUTTON')
      expect(key.type).toBe('button')
      expect(key.disabled).toBe(false)
      expect(key.getAttribute('aria-label')).toBe(
        `v4.fn.audio.lines.${line.id}.playLabel`,
      )
    })
  })

  it('swaps the key to a pause control while a note sounds', async () => {
    const view = stage((active) => (
      <HomeV4FnAudio {...HEADER} active={active} />
    ))
    view.play()

    await act(async () => {
      fireEvent.click(keys(view)[0])
    })

    const [first] = keys(view)
    expect(first.getAttribute('aria-label')).toBe(
      'v4.fn.audio.lines.qing.pauseLabel',
    )
    expect(view.count('.voice.sounding')).toBe(1)

    await act(async () => {
      fireEvent.click(keys(view)[0])
    })
    expect(keys(view)[0].getAttribute('aria-label')).toBe(
      'v4.fn.audio.lines.qing.playLabel',
    )
    /* Paused, not finished — the line keeps the transport and its progress. */
    expect(view.count('.voice.sounding')).toBe(0)
    expect(view.count('.voice.live')).toBe(1)
  })

  it('lets only one note sound at a time', async () => {
    const view = stage((active) => (
      <HomeV4FnAudio {...HEADER} active={active} />
    ))
    view.play()

    await act(async () => {
      fireEvent.click(keys(view)[0])
    })
    await act(async () => {
      fireEvent.click(keys(view)[1])
    })

    expect(view.count('.voice.live')).toBe(1)
    expect(view.count('.voice.sounding')).toBe(1)
    expect(keys(view)[0].getAttribute('aria-label')).toBe(
      'v4.fn.audio.lines.qing.playLabel',
    )
    expect(keys(view)[1].getAttribute('aria-label')).toBe(
      'v4.fn.audio.lines.lei.pauseLabel',
    )
    /* The one that lost the transport is rewound, not merely paused. */
    expect(notes(view)[0].currentTime).toBe(0)
  })

  /**
   * ⭐ Leaving the page has to cut the sound *now*, not on the page's own
   * rewind clock — a voice carrying across the slide is heard over the next
   * page, which no amount of choreography can take back.
   */
  it('cuts the sound the instant the page starts leaving', async () => {
    const view = stage((active) => (
      <HomeV4FnAudio {...HEADER} active={active} />
    ))
    view.play()

    await act(async () => {
      fireEvent.click(keys(view)[0])
    })
    expect(view.count('.voice.sounding')).toBe(1)

    act(() => {
      view.rerender(false)
    })
    /* Before a single millisecond of the rewind clock has run. */
    expect(view.count('.voice.sounding')).toBe(0)
    expect(view.count('.voice.live')).toBe(0)
    expect(notes(view)[0].paused).toBe(true)
    expect(notes(view)[0].currentTime).toBe(0)
  })
})

describe('home v4 · feature page 04 视频', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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

  it('fills the composer, lights the send key, then rolls the cut', () => {
    const view = stage((active) => (
      <HomeV4FnVideo {...HEADER} active={active} />
    ))

    view.play()

    /* Three reference capsules plus the prompt line. */
    expect(view.count('.iline.in')).toBe(HOME_V4_FN_VIDEO_REFS.length + 1)
    expect(view.count('.itools .up.on')).toBe(1)
    expect(view.count('.out.in')).toBe(1)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()

    view.leave()
    expect(view.count('.iline.in')).toBe(0)
    expect(view.count('.out.in')).toBe(0)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })

  it('keeps a poster behind the clip so a refused autoplay still shows a frame', () => {
    const view = stage((active) => (
      <HomeV4FnVideo {...HEADER} active={active} />
    ))
    const clip = view.container.querySelector('.out video')

    expect(clip?.getAttribute('poster')).toBeTruthy()
  })
})

describe('home v4 · feature page 05 画布', () => {
  beforeEach(() => {
    vi.useFakeTimers()
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

  it('walks assistant → script → canvas and ends with four nodes wired', () => {
    const view = stage((active) => (
      <HomeV4FnCanvas {...HEADER} active={active} />
    ))

    view.play()

    const shots = HOME_V4_FN_CANVAS_SHOTS.length
    expect(view.count('.s1 .m.in')).toBe(2)
    expect(view.count('.s1 .chip.in')).toBe(1)
    expect(view.count('.fn-step.s2.on')).toBe(1)
    expect(view.count('.fn-step.s3.on')).toBe(1)
    expect(view.count('.s2 .row.in')).toBe(shots)
    expect(view.count('.s2 .row.sent')).toBe(shots)
    expect(view.count('.wires path.draw')).toBe(shots)
    /* Three shot nodes plus the cut. */
    expect(view.count('.s3 .cn.in')).toBe(shots + 1)
    expect(view.count('.fn-hand.on')).toBe(2)
  })

  it('launches a ghost on the hand-off and takes it away again', () => {
    const view = stage((active) => (
      <HomeV4FnCanvas {...HEADER} active={active} />
    ))

    view.play(
      HOME_V4_FN_CANVAS.ENTER_DELAY_MS + HOME_V4_FN_CANVAS.PC.HANDOFF_MS + 20,
    )
    expect(view.count('.fn-flyers .flyer')).toBe(1)

    view.advance(HOME_V4_FN_CANVAS.FLY_LIFE_MS + 50)
    expect(view.count('.fn-flyers .flyer')).toBe(0)
  })

  /* `data-stage` is the mobile carousel's only switch; on desktop the attribute
     must not exist at all, or the mobile rules would have something to match. */
  it('leaves the mobile stage attribute off the desktop timeline', () => {
    const view = stage((active) => (
      <HomeV4FnCanvas {...HEADER} active={active} />
    ))

    view.play()
    expect(
      view.container.querySelector('.fn-canvas')?.hasAttribute('data-stage'),
    ).toBe(false)
  })
})

describe('home v4 · feature page 06 资源库', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('fills the grid, then copies the anchor into the reuse slot', () => {
    const view = stage((active) => (
      <HomeV4FnVault {...HEADER} active={active} />
    ))

    view.play()

    expect(view.count('.vc.in')).toBe(HOME_V4_FN_VAULT_CELLS.length)
    expect(view.count('.vc.lift')).toBe(1)
    expect(view.count('.slot.got')).toBe(1)
    expect(view.count('.cta2.on')).toBe(1)
    /* ⭐ The reuse story is a *copy*: taking the tile out of the library would
       say the opposite of what the page claims. */
    expect(view.count('.vgrid .vc[data-hero]')).toBe(1)
  })

  it('sends one ghost to the slot and clears it', () => {
    const view = stage((active) => (
      <HomeV4FnVault {...HEADER} active={active} />
    ))

    view.play(HOME_V4_FN_VAULT.ENTER_DELAY_MS + HOME_V4_FN_VAULT.FLY_MS + 20)
    expect(view.count('.fn-vault .fn-flyers .flyer')).toBe(1)

    view.advance(HOME_V4_FN_VAULT.FLY_LIFE_MS + 50)
    expect(view.count('.fn-vault .fn-flyers .flyer')).toBe(0)
  })
})

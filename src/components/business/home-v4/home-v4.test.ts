import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  HOME_V4_ALL_MODELS,
  HOME_V4_ENGINE,
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_FN_CANVAS_SHOTS,
  HOME_V4_FN_IMAGE_MODELS,
  HOME_V4_FN_LORA_CARDS,
  HOME_V4_FN_LORA_MOUNTS,
  HOME_V4_FN_LORA_OUTS,
  HOME_V4_FN_VAULT_CELLS,
  HOME_V4_FN_VAULT_FILTERS,
  HOME_V4_FN_VIDEO_REFS,
  HOME_V4_MODEL_FACETS,
  HOME_V4_MODEL_LOGO_KEYS,
  HOME_V4_PAGES,
  HOME_V4_STATION_KEYS,
  HOME_V4_STATIONS,
  HOME_V4_STORY,
  HOME_V4_STRIP,
  HOME_V4_STRIP_SPARES,
} from '@/constants/homepage-v4'
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'
import zhMessages from '@/messages/zh.json'

const PUBLIC_DIR = join(process.cwd(), 'public')
const localPath = (src: string) => join(PUBLIC_DIR, src.replace(/^\//, ''))

/**
 * Structural guards for the v4 paging home. These are the invariants that break
 * silently: a mistyped asset path ships a page of grey boxes, a page id that
 * drifts from the message files prints a raw key in the navigation, and a group
 * that is not one contiguous run loses its heading in the mobile toc.
 *
 * Copy and layout are deliberately not asserted — the page is design-led and
 * those change every round.
 */
describe('home v4 · assets', () => {
  it('every image the page references exists in public/', () => {
    const referenced = [
      ...HOME_V4_STRIP.map((shot) => shot.src),
      ...HOME_V4_STRIP_SPARES,
      /* Feature page 01's quad. A missing one leaves that model's tile stuck on
         its 「待生成」 placeholder — the exact state the shot replaced, so the
         page would look intentional rather than broken. */
      ...HOME_V4_FN_IMAGE_MODELS.map((model) => model.shot),
    ]

    const missing = referenced.filter((src) => !existsSync(localPath(src)))
    expect(missing).toEqual([])
  })

  /* Four models, four pictures — a duplicate means one model is showing another
     model's work under its own name, which is the one claim this page makes. */
  it('gives every quad model its own shot', () => {
    const shots = HOME_V4_FN_IMAGE_MODELS.map((model) => model.shot)

    expect(new Set(shots).size).toBe(shots.length)
  })

  /* A mistyped cover ships a model page of grey boxes, and the triptych panels
     are the easiest to get wrong: they are the only assets referenced by a
     field other than `cover`. */
  it('every model background exists in public/', () => {
    const shots = HOME_V4_ALL_MODELS.flatMap((model) => [
      ...(model.cover === null ? [] : [model.cover]),
      ...model.wall,
    ])

    expect(shots.length).toBeGreaterThan(0)
    expect(shots.filter((src) => !existsSync(localPath(src)))).toEqual([])
  })

  /* 「借伞」 is one story told across three feature pages. The SPEC held it
     together by copying blobs between pages at runtime; now each page states
     its own path, so a typo in one of them is a page of grey boxes. */
  it('every 借伞 asset the feature pages reference exists in public/', () => {
    const referenced = Object.values(HOME_V4_STORY)

    expect(referenced.filter((src) => !existsSync(localPath(src)))).toEqual([])
  })

  it('no two models share a cover', () => {
    const covers = HOME_V4_ALL_MODELS.flatMap((model) =>
      model.cover === null ? [] : [model.cover],
    )

    expect(new Set(covers).size).toBe(covers.length)
  })
})

/**
 * The model record drives one template twenty-five times, so a field that is
 * `null` where the template expects a value renders an empty box rather than
 * throwing. These pin the combinations the page actually branches on.
 */
describe('home v4 · model records', () => {
  it('gives every model exactly one brand mark', () => {
    const wrong = HOME_V4_ALL_MODELS.filter(
      (model) => (model.logo === null) === (model.mark === null),
    )

    expect(wrong.map((model) => model.key)).toEqual([])
  })

  it('only names logos the logo component draws', () => {
    const unknown = HOME_V4_ALL_MODELS.filter(
      (model) =>
        model.logo !== null && !HOME_V4_MODEL_LOGO_KEYS.includes(model.logo),
    )

    expect(unknown.map((model) => model.key)).toEqual([])
  })

  /* A triptych needs three panels; anything else needs none. The layout and the
     panel list are two fields that have to agree, and CSS will not say so. */
  it('gives a wall three panels and every other layout none', () => {
    const wrong = HOME_V4_ALL_MODELS.filter((model) =>
      model.layout === 'wall' && model.cover !== null
        ? model.wall.length !== 2
        : model.wall.length !== 0,
    )

    expect(wrong.map((model) => model.key)).toEqual([])
  })

  /**
   * ⭐ The 「待站内生成」 page and the prompt card are the same state seen twice.
   * A model with no shot and no prompt renders a blank page that says nothing;
   * a model with a shot *and* a prompt has a stale task order sitting in the
   * data, and the manifest's generation list would be wrong.
   */
  it('carries a prompt card exactly where the shot is missing', () => {
    const wrong = HOME_V4_ALL_MODELS.filter(
      (model) => (model.cover === null) !== (model.wantPrompt !== null),
    )

    expect(wrong.map((model) => model.key)).toEqual([])
  })
})

describe('home v4 · deck shape', () => {
  /* The SPEC's thirteen. A fourteenth — a catalogue-wide price list after the
     3D station — shipped briefly and was cut by owner on sight, so the model
     region releases straight into the finale again. */
  it('is thirteen pages with unique ids, opening first and finale last', () => {
    expect(HOME_V4_PAGES).toHaveLength(13)
    expect(new Set(HOME_V4_PAGES.map((page) => page.id)).size).toBe(13)
    expect(HOME_V4_PAGES[0].id).toBe('opening')
    expect(HOME_V4_PAGES[HOME_V4_PAGES.length - 1].id).toBe('finale')
  })

  /* The five stations are the last thing before the close. Anything inserted
     between them and the finale has to be a deliberate decision, not a drift. */
  it('closes on the finale directly after the last station', () => {
    const lastStation = HOME_V4_PAGES.map((page) => page.station).lastIndexOf(
      HOME_V4_STATION_KEYS[HOME_V4_STATION_KEYS.length - 1],
    )

    expect(lastStation).toBe(HOME_V4_PAGES.length - 2)
  })

  it('carries every station exactly once, in deck order', () => {
    const stations = HOME_V4_PAGES.flatMap((page) =>
      page.station ? [page.station] : [],
    )

    expect(stations).toEqual([...HOME_V4_STATION_KEYS])
  })

  it('gives every station at least one model, each with a unique key', () => {
    for (const key of HOME_V4_STATION_KEYS) {
      const models = HOME_V4_STATIONS[key]
      expect(models.length).toBeGreaterThan(0)
      expect(new Set(models.map((model) => model.key)).size).toBe(models.length)
    }
  })

  /* The mobile toc prints a group heading on the first row of each group and
     nowhere else, so a group that appears in two separate runs would silently
     lose its heading the second time. */
  it('keeps each navigation group in one contiguous run', () => {
    const runs = HOME_V4_PAGES.reduce<string[]>((acc, page) => {
      if (acc[acc.length - 1] !== page.group) acc.push(page.group)
      return acc
    }, [])

    expect(new Set(runs).size).toBe(runs.length)
  })

  /* Shorter than the slide and a trackpad's tail delta lands mid-flight, which
     double-steps the deck. */
  it('holds the input lock at least as long as the slide', () => {
    expect(HOME_V4_ENGINE.LOCK_MS).toBeGreaterThanOrEqual(
      HOME_V4_ENGINE.PAGE_MS,
    )
  })
})

describe('home v4 · copy', () => {
  const locales = {
    zh: zhMessages.Homepage.v4,
    en: enMessages.Homepage.v4,
    ja: jaMessages.Homepage.v4,
  }

  it('names every page in all three locales', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const pages = messages.pages as Record<string, { nav?: string }>
      const missing = HOME_V4_PAGES.filter((page) => !pages[page.id]?.nav)
      expect(missing.map((page) => `${locale}:${page.id}`)).toEqual([])
    }
  })

  /* Only the placeholder feature pages print a headline of their own — the
     opening and the finale have their own copy, and a model page's headline is
     the model's name. */
  it('gives every feature page a headline in all three locales', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      const pages = messages.pages as Record<string, { title?: string }>
      const missing = HOME_V4_PAGES.filter(
        (page) => page.group === 'feature' && !pages[page.id]?.title,
      )
      expect(missing.map((page) => `${locale}:${page.id}`)).toEqual([])
    }
  })

  it('names every navigation group in all three locales', () => {
    const groups = [...new Set(HOME_V4_PAGES.map((page) => page.group))]

    for (const [locale, messages] of Object.entries(locales)) {
      const named = messages.groups as Record<string, string>
      const missing = groups.filter((group) => !named[group])
      expect(missing.map((group) => `${locale}:${group}`)).toEqual([])
    }
  })

  /**
   * The feature pages build message keys out of the ids in
   * `homepage-v4.ts` — `v4.fn.audio.lines.${line.id}.text` and friends. Those
   * are template literals, so `i18n/completeness.test.ts` cannot see them: it
   * only checks keys written as string literals at the call site. Renaming an
   * id here would print the raw key on the page and nothing else would notice.
   *
   * This walks the same construction the components do, in all three locales.
   */
  it('resolves every id-built feature-page key in all three locales', () => {
    const expected = [
      ...HOME_V4_FN_LORA_CARDS.map((card) => `fn.lora.cards.${card.id}.name`),
      ...HOME_V4_FN_LORA_MOUNTS.map(
        (mount) => `fn.lora.cards.${mount.id}.short`,
      ),
      ...HOME_V4_FN_LORA_OUTS.map((out) => `fn.lora.outs.${out}`),
      ...HOME_V4_FN_AUDIO_LINES.flatMap((line) =>
        ['avatar', 'who', 'text', 'duration'].map(
          (field) => `fn.audio.lines.${line.id}.${field}`,
        ),
      ),
      ...HOME_V4_FN_VIDEO_REFS.flatMap((reference) =>
        ['label', 'say'].map(
          (field) => `fn.video.refs.${reference.id}.${field}`,
        ),
      ),
      ...HOME_V4_FN_CANVAS_SHOTS.flatMap((shot) => [
        `fn.canvas.script.rows.${shot}.index`,
        `fn.canvas.script.rows.${shot}.text`,
        `fn.canvas.board.nodes.${shot}`,
      ]),
      ...HOME_V4_FN_VAULT_FILTERS.map((filter) => `fn.vault.filters.${filter}`),
      ...HOME_V4_FN_VAULT_CELLS.map((cell) => `fn.vault.cells.${cell.id}`),
    ]

    const resolve = (root: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((node, segment) => {
        if (typeof node !== 'object' || node === null) return undefined
        return (node as Record<string, unknown>)[segment]
      }, root)

    for (const [locale, messages] of Object.entries(locales)) {
      const missing = expected.filter(
        (path) => typeof resolve(messages, path) !== 'string',
      )
      expect(missing.map((path) => `${locale}:${path}`)).toEqual([])
    }
  })

  /**
   * ⭐ The model pages are one template read twenty-five times, and every line
   * on them is an id-built key (`v4.models.<key>.plus.2`). `completeness` cannot
   * see any of it — it only follows keys written as literals at the call site —
   * so a missing translation would print the raw path on the page and nothing
   * else would fail. This walks exactly what `HomeV4ModelPage` and
   * `HomeV4ModelStrip` ask for, in all three locales: ~300 keys each.
   */
  it('resolves every model page key in all three locales', () => {
    const range = (count: number) =>
      Array.from({ length: count }, (_, index) => index)

    const expected = HOME_V4_ALL_MODELS.flatMap((model) => {
      const base = `models.${model.key}`
      return [
        `${base}.pos`,
        `${base}.fare`,
        `${base}.routes`,
        `${base}.src`,
        ...range(HOME_V4_MODEL_FACETS.TAGS).map((i) => `${base}.tags.${i}`),
        ...range(HOME_V4_MODEL_FACETS.PLUS).map((i) => `${base}.plus.${i}`),
        ...range(HOME_V4_MODEL_FACETS.MINUS).map((i) => `${base}.minus.${i}`),
      ]
    })

    const resolve = (root: unknown, path: string): unknown =>
      path.split('.').reduce<unknown>((node, segment) => {
        if (typeof node !== 'object' || node === null) return undefined
        return (node as Record<string, unknown>)[segment]
      }, root)

    for (const [locale, messages] of Object.entries(locales)) {
      const missing = expected.filter(
        (path) => typeof resolve(messages, path) !== 'string',
      )
      expect(missing.map((path) => `${locale}:${path}`)).toEqual([])
    }
  })

  /* The other direction: copy left behind by a model that was renamed or
     dropped keeps translating forever and nothing ever prints it. */
  it('carries no model copy for a model that is not on a station', () => {
    const known = new Set(HOME_V4_ALL_MODELS.map((model) => model.key))

    for (const [locale, messages] of Object.entries(locales)) {
      const written = Object.keys(
        (messages as unknown as { models: Record<string, unknown> }).models,
      )
      expect(
        written
          .filter((key) => !known.has(key))
          .map((key) => `${locale}:${key}`),
      ).toEqual([])
    }
  })

  /* The rack mounts a subset of the library, and the library keeps one card
     back — a rack that fills itself completely reads as a fixed list. */
  it('mounts a strict subset of the LoRA library', () => {
    const library = HOME_V4_FN_LORA_CARDS.map((card) => card.id)
    const mounted = HOME_V4_FN_LORA_MOUNTS.map((mount) => mount.id)

    expect(mounted.filter((id) => !library.includes(id))).toEqual([])
    expect(mounted.length).toBeLessThan(library.length)
  })
})

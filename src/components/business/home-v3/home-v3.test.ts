import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  HOME_V3_CANVAS_EDGES,
  HOME_V3_CANVAS_NODES,
  HOME_V3_CAPS,
  HOME_V3_LORA,
  HOME_V3_RAIL_ARROW_MIN,
  HOME_V3_RAIL_GROUPS,
  HOME_V3_SHOTS,
  HOME_V3_STUDIO_SHEET,
  HOME_V3_TURNTABLE,
  HOME_V3_VIDEO_DEMO,
  HOME_V3_VIEWS,
} from '@/constants/home-v3'
import { HOME_V3_STRIP } from '@/constants/homepage'
import { getAvailableModels } from '@/constants/models'

const PUBLIC_DIR = join(process.cwd(), 'public')

const localPath = (src: string) => join(PUBLIC_DIR, src.replace(/^\//, ''))

/**
 * Structural guards for the v3 marketing home. These are the invariants that
 * break silently — a renamed image ships a page full of gaps, a new
 * `outputType` drops a whole modality out of the rails — and that no other
 * suite covers. Copy and layout are deliberately not asserted: the page is
 * design-led and those change every round.
 *
 * i18n is covered by `src/i18n/completeness.test.ts`, which walks all of `src/`
 * and resolves every static `t()` key.
 */
describe('home v3 · assets', () => {
  it('every image referenced by the page exists in public/', () => {
    const referenced = new Set<string>([
      ...HOME_V3_STRIP.map((shot) => shot.src),
      ...Object.values(HOME_V3_SHOTS),
      ...HOME_V3_CANVAS_NODES.flatMap((node) =>
        'shot' in node ? [node.shot] : [],
      ),
      ...HOME_V3_STUDIO_SHEET.map((cell) => cell.shot),
      HOME_V3_LORA.baseShot,
      HOME_V3_LORA.shotSource,
      HOME_V3_VIDEO_DEMO.shot,
      HOME_V3_TURNTABLE.shot,
    ])

    const missing = [...referenced].filter((src) => !existsSync(localPath(src)))
    expect(missing, 'referenced but not in public/').toEqual([])
  })
})

describe('home v3 · product views', () => {
  it('the sliding rail is built for exactly the declared views', () => {
    // `.home-v3-view-rail` is `width: 400%` and each step translates 25%, so a
    // fifth view would silently render off the end of the frame.
    expect(HOME_V3_VIEWS).toHaveLength(4)
    expect(new Set(HOME_V3_VIEWS).size).toBe(HOME_V3_VIEWS.length)
  })

  it('every canvas edge connects two nodes that exist', () => {
    const ids = new Set(HOME_V3_CANVAS_NODES.map((node) => node.id))
    const dangling = HOME_V3_CANVAS_EDGES.filter(
      ([from, to]) => !ids.has(from) || !ids.has(to),
    )
    // `edgePath` returns '' for an unknown endpoint, so a typo drops the line
    // without any error.
    expect(dangling).toEqual([])
  })

  it('exactly one studio result is the picked one', () => {
    const picked = HOME_V3_STUDIO_SHEET.filter(
      (cell) => 'picked' in cell && cell.picked,
    )
    expect(picked).toHaveLength(1)
  })

  it('the four studio results are four different pictures', () => {
    // The row claims four models answered; two identical images disprove it.
    // The prototype shipped this bug by indexing a 14-long pool with a 10-long
    // one, and the same fixture feeds the capability section's contact sheet.
    const shots = HOME_V3_STUDIO_SHEET.map((cell) => cell.shot)
    expect(new Set(shots).size).toBe(shots.length)
  })
})

describe('home v3 · capability stage', () => {
  it('each capability has a demo renderer and its own model tags', () => {
    expect(HOME_V3_CAPS.length).toBeGreaterThan(1)
    for (const cap of HOME_V3_CAPS) {
      expect(['fan', 'video', 'turntable']).toContain(cap.demo)
      expect(cap.tags.length).toBeGreaterThan(0)
    }
    const demos = HOME_V3_CAPS.map((cap) => cap.demo)
    expect(new Set(demos).size).toBe(demos.length)
  })

  it('the video demo highlights a frame that exists', () => {
    expect(HOME_V3_VIDEO_DEMO.currentFrame).toBeLessThan(
      HOME_V3_VIDEO_DEMO.frames.length,
    )
    expect(HOME_V3_VIDEO_DEMO.progress).toBeGreaterThan(0)
    expect(HOME_V3_VIDEO_DEMO.progress).toBeLessThan(100)
  })
})

describe('home v3 · model rails', () => {
  const available = getAvailableModels()

  it('the four rails cover every available model exactly once', () => {
    // The catalog gets a monthly audit; a new outputType would otherwise drop a
    // whole modality off the homepage with nothing failing.
    const railed = HOME_V3_RAIL_GROUPS.flatMap((group) =>
      available.filter((model) => model.outputType === group.outputType),
    ).map((model) => model.id)

    expect(new Set(railed).size).toBe(railed.length)
    expect(railed.sort()).toEqual(available.map((model) => model.id).sort())
  })

  it('arrows are drawn only for rails that can actually scroll', () => {
    // Cards are ~300px wide, so a rail needs roughly six before it overflows a
    // desktop viewport. Below that the arrows would be dead controls.
    expect(HOME_V3_RAIL_ARROW_MIN).toBeGreaterThan(4)
    const withArrows = HOME_V3_RAIL_GROUPS.filter(
      (group) =>
        available.filter((model) => model.outputType === group.outputType)
          .length >= HOME_V3_RAIL_ARROW_MIN,
    )
    expect(withArrows.length).toBeGreaterThan(0)
  })
})

import { describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({
  options: null as null | {
    duration: number
    ease: number[]
    onUpdate(progress: number): void
    onComplete(): void
  },
  stop: vi.fn(),
}))

vi.mock('motion/react', () => ({
  animate: vi.fn((_from, _to, options) => {
    motion.options = options
    return { stop: motion.stop }
  }),
}))

import {
  animateCanvasMove,
  fitCanvasProject,
  locateCanvasNode,
} from './node-canvas-camera'

const stage = { width: 1383, height: 900 }

describe('locateCanvasNode', () => {
  it('centers a card face in the sidebar safe area without changing 90% zoom', () => {
    const node = { x: 500, y: 200, width: 320, height: 180 + 22 / 0.9 }
    const target = locateCanvasNode(stage, node, 0.9, true)

    expect(target.zoom).toBe(0.9)
    expect(target.x + (node.x + node.width / 2) * target.zoom).toBe(856.5)
    expect(target.y + (node.y + 90) * target.zoom + 22).toBe(389)
  })

  it('raises only a card narrower than 160 screen pixels to 100%', () => {
    const node = { x: 50, y: 40, width: 150, height: 100 + 22 / 0.9 }
    expect(locateCanvasNode(stage, node, 0.9, false).zoom).toBe(1)
    expect(
      locateCanvasNode(stage, { ...node, width: 180 }, 0.9, false).zoom,
    ).toBe(0.9)
  })

  it('shrinks a card and its chrome to the available height', () => {
    const node = { x: 50, y: 40, width: 600, height: 300 + 22 }
    const target = locateCanvasNode({ width: 600, height: 500 }, node, 1, false)
    expect(target.zoom).toBeCloseTo(190 / 300)
  })
})

describe('fitCanvasProject', () => {
  it('fits all card faces with 100px stage margins and a 100% cap', () => {
    const target = fitCanvasProject(
      stage,
      [
        { x: 0, y: 0, width: 320, height: 202 },
        { x: 1680, y: 820, width: 320, height: 202 },
      ],
      1,
    )
    expect(target.zoom).toBeCloseTo((1383 - 200) / 2000)
    expect(target.x).toBeCloseTo(100)
    expect(target.x + 2000 * target.zoom).toBeCloseTo(1283)

    const single = fitCanvasProject(
      stage,
      [{ x: 100, y: 100, width: 320, height: 202 }],
      1,
    )
    expect(single.zoom).toBe(1)
  })

  it('centers an empty project at 100% and fits wide graphs below manual minZoom', () => {
    expect(fitCanvasProject(stage, [], 1)).toEqual({
      x: 691.5,
      y: 450,
      zoom: 1,
    })
    const wide = fitCanvasProject(
      stage,
      [{ x: 0, y: 0, width: 5000, height: 202 }],
      1,
    )
    expect(wide.zoom).toBeCloseTo(1183 / 5000)
    expect(wide.zoom).toBeLessThan(0.3)
  })

  it('uses the mock 24px world-space name allowance when height limits fit', () => {
    const target = fitCanvasProject(
      { width: 1000, height: 600 },
      [{ x: 0, y: 0, width: 200, height: 1022 }],
      1,
    )
    expect(target.zoom).toBeCloseTo(400 / 1024)
    expect(target.y + 22).toBeCloseTo(109.375)
  })
})

it('moves pan and zoom together, then settles before selection', () => {
  const events: string[] = []
  const onUpdate = vi.fn(() => events.push('viewport'))
  const onSelected = vi.fn(() => events.push('selected'))
  const controls = animateCanvasMove(
    { x: 0, y: 20, zoom: 0.9 },
    { x: 100, y: 200, zoom: 1 },
    onUpdate,
    onSelected,
  )

  expect(motion.options?.duration).toBe(0.32)
  expect(motion.options?.ease).toEqual([0.22, 1, 0.36, 1])
  expect(onSelected).not.toHaveBeenCalled()
  motion.options?.onUpdate(0.5)
  expect(onUpdate).toHaveBeenLastCalledWith({ x: 50, y: 110, zoom: 0.95 })
  expect(onSelected).not.toHaveBeenCalled()
  motion.options?.onComplete()
  expect(onUpdate).toHaveBeenLastCalledWith({ x: 100, y: 200, zoom: 1 })
  expect(events).toEqual(['viewport', 'viewport', 'selected'])
  controls.stop()
  expect(motion.stop).toHaveBeenCalledOnce()
})

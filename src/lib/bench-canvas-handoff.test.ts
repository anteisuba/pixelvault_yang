import { beforeEach, describe, expect, it } from 'vitest'

import { BENCH_CANVAS_HANDOFF } from '@/constants/studio'
import {
  pickHandoffReferences,
  takeBenchToCanvasHandoff,
  takeCanvasToBenchHandoff,
  writeBenchToCanvasHandoff,
  writeCanvasToBenchHandoff,
} from './bench-canvas-handoff'

beforeEach(() => window.sessionStorage.clear())

describe('台间交接的暂存（P6）', () => {
  it('工作台 → 画布：读一次就清掉，刷新不再落第二张', () => {
    writeBenchToCanvasHandoff({
      projectId: 'project-1',
      prompt: 'a girl',
      referenceUrls: ['https://cdn.test/a.png'],
      result: { url: 'https://cdn.test/out.png', generationId: 'g1' },
      next: '接着做',
    })
    expect(takeBenchToCanvasHandoff()).toMatchObject({
      projectId: 'project-1',
      result: { url: 'https://cdn.test/out.png' },
      next: '接着做',
    })
    expect(takeBenchToCanvasHandoff()).toBeNull()
  })

  it('画布 → 工作台：两个方向各存各的', () => {
    writeCanvasToBenchHandoff({ prompt: 'p', referenceUrls: [] })
    expect(takeBenchToCanvasHandoff()).toBeNull()
    expect(takeCanvasToBenchHandoff()).toMatchObject({ prompt: 'p' })
  })

  it('存的东西坏了：当没有，也清掉', () => {
    window.sessionStorage.setItem(
      BENCH_CANVAS_HANDOFF.toBenchStorageKey,
      '{"prompt":',
    )
    expect(takeCanvasToBenchHandoff()).toBeNull()
    expect(
      window.sessionStorage.getItem(BENCH_CANVAS_HANDOFF.toBenchStorageKey),
    ).toBeNull()
  })

  it('参考图只带网上地址、去重、截到上限，并说截掉了几张', () => {
    const many = Array.from(
      { length: BENCH_CANVAS_HANDOFF.maxReferences + 1 },
      (_, index) => `https://cdn.test/${index}.png`,
    )
    const picked = pickHandoffReferences([
      'blob:local',
      many[0]!,
      many[0]!,
      ...many.slice(1),
    ])
    expect(picked.urls).toEqual(
      many.slice(0, BENCH_CANVAS_HANDOFF.maxReferences),
    )
    // 重复的不算没带上：没带上的是 blob 那张和超出上限那张。
    expect(picked.dropped).toBe(2)
  })
})

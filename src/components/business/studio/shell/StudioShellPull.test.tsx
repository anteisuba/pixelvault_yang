import { describe, expect, it } from 'vitest'

import {
  STUDIO_SHELL_PULL_ANCHOR_ATTR,
  readStudioShellPullAnchor,
  studioShellPullAnchor,
  studioShellPullAnchorProps,
  studioShellPullCompensation,
  studioShellPullSlides,
  type StudioShellPullAnchor,
  type StudioShellPullElementAnchor,
} from '@/constants/studio-shell'

/** 对话栏 400 + 分隔线 1（owner 11-21 真机那一档）。 */
const SHIFT = 401

describe('「拉」的平移量按台的锚取', () => {
  it('画布是靠左锚，其余台（含没有台）一律居中锚', () => {
    expect(studioShellPullAnchor('canvas')).toBe('start')
    for (const id of ['image', 'tags', 'lora', 'audio', 'video', 'model3d']) {
      expect(studioShellPullAnchor(id)).toBe('center')
    }
    expect(studioShellPullAnchor(undefined)).toBe('center')
  })

  it('居中锚：台那一列的关键帧是 ±shift/2，对话栏照旧走整个 shift', () => {
    expect(studioShellPullSlides('collapse', SHIFT, 'center')).toEqual({
      conversation: [0, -SHIFT],
      column: [SHIFT / 2, 0],
    })
    expect(studioShellPullSlides('expand', SHIFT, 'center')).toEqual({
      conversation: [-SHIFT, 0],
      column: [0, SHIFT / 2],
    })
  })

  it('靠左锚（画布）：台那一列的关键帧是 ±shift，行为不变', () => {
    expect(studioShellPullSlides('collapse', SHIFT, 'start')).toEqual({
      conversation: [0, -SHIFT],
      column: [SHIFT, 0],
    })
    expect(studioShellPullSlides('expand', SHIFT, 'start')).toEqual({
      conversation: [-SHIFT, 0],
      column: [0, SHIFT],
    })
  })

  it('居中内容首尾零跳变：收起起步 / 展开落定那一帧，居中内容的中心与上一帧相同', () => {
    const board = 1864 - 240 // 任意白板宽；只看相对关系
    // 并排时台那一列占 [shift, board]，居中内容中心：
    const sideBySide = (SHIFT + board) / 2
    // 「拉」里列按整宽 [0, board] 排、平移 offset 之后的中心：
    const collapseStart =
      board / 2 + studioShellPullSlides('collapse', SHIFT, 'center').column[0]
    const expandEnd =
      board / 2 + studioShellPullSlides('expand', SHIFT, 'center').column[1]
    expect(collapseStart).toBe(sideBySide)
    expect(expandEnd).toBe(sideBySide)
  })
})

describe('与列锚不同的块叠补偿平移（owner 11-21「不同锚的元素不再跳」）', () => {
  it('验算：画布（列靠左）居中块从 −shift/2 起、靠右块从 −shift 起；一般台靠左块从 +shift/2 起', () => {
    expect(
      studioShellPullCompensation('collapse', SHIFT, 'start', 'center'),
    ).toEqual([-SHIFT / 2, 0])
    expect(
      studioShellPullCompensation('collapse', SHIFT, 'start', 'end'),
    ).toEqual([-SHIFT, 0])
    expect(
      studioShellPullCompensation('collapse', SHIFT, 'center', 'start'),
    ).toEqual([SHIFT / 2, 0])
    expect(
      studioShellPullCompensation('expand', SHIFT, 'center', 'end'),
    ).toEqual([0, -SHIFT / 2])
  })

  it('与列同锚不补', () => {
    expect(
      studioShellPullCompensation('collapse', SHIFT, 'start', 'start'),
    ).toBeNull()
    expect(
      studioShellPullCompensation('expand', SHIFT, 'center', 'center'),
    ).toBeNull()
  })

  it('任何列锚 × 元素锚：收起起步 / 展开落定那一帧锚点与并排时相同，另一头与整宽时相同', () => {
    const board = 1624
    const factor: Record<StudioShellPullElementAnchor, number> = {
      start: 0,
      center: 0.5,
      end: 1,
    }
    const columnAnchors: StudioShellPullAnchor[] = ['start', 'center']
    const elementAnchors: StudioShellPullElementAnchor[] = [
      'start',
      'center',
      'end',
    ]
    for (const columnAnchor of columnAnchors) {
      for (const elementAnchor of elementAnchors) {
        const a = factor[elementAnchor]
        // 并排：列占 [shift, board]；整宽：列占 [0, board]（「拉」这一段列一律按整宽排）。
        const sideBySide = SHIFT + a * (board - SHIFT)
        const fullWidth = a * board
        const at = (direction: 'collapse' | 'expand', frame: 0 | 1) => {
          const column = studioShellPullSlides(
            direction,
            SHIFT,
            columnAnchor,
          ).column
          const comp = studioShellPullCompensation(
            direction,
            SHIFT,
            columnAnchor,
            elementAnchor,
          ) ?? [0, 0]
          return fullWidth + column[frame] + comp[frame]
        }
        expect(at('collapse', 0)).toBeCloseTo(sideBySide)
        expect(at('collapse', 1)).toBeCloseTo(fullWidth)
        expect(at('expand', 0)).toBeCloseTo(fullWidth)
        expect(at('expand', 1)).toBeCloseTo(sideBySide)
      }
    }
  })

  it('打标走同一个属性名，读回来不认得的值当没标', () => {
    expect(studioShellPullAnchorProps('end')).toEqual({
      [STUDIO_SHELL_PULL_ANCHOR_ATTR]: 'end',
    })
    expect(readStudioShellPullAnchor('center')).toBe('center')
    expect(readStudioShellPullAnchor('middle')).toBeNull()
    expect(readStudioShellPullAnchor(null)).toBeNull()
  })
})

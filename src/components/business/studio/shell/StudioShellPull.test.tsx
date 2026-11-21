import { describe, expect, it } from 'vitest'

import {
  studioShellPullAnchor,
  studioShellPullSlides,
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
